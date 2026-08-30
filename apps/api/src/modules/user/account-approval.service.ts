import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { composeAccountApproved, composeAccountRejected } from 'src/modules/auth/account-mail';
import { loginUrl } from 'src/modules/auth/portal-urls';
import { officeAddress } from 'src/modules/mail/office-address';

/**
 * The second gate of E11/S2, and the whole of D2: the school decides who gets in.
 *
 * Registration is open to anyone, but an account is a stranger until somebody at the school says
 * otherwise. That is a deliberate answer to a question the platform would otherwise decide by
 * default — and the default, self-service, fills a school's groups with test accounts and with
 * people nobody has spoken to.
 */

/** One row of the approvals screen: enough to recognise a family without opening anything. */
export interface PendingAccount {
    userId: number;
    username: string;
    createdAt: Date;
    /** Whether the parent has opened the confirmation link. Shown, never enforced here — see below. */
    emailConfirmed: boolean;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
}

@Injectable()
export class AccountApprovalService {
    private readonly logger = new Logger('AccountApproval');
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        private readonly outbox: OutboxService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /**
     * Every parent account still waiting for a verdict, oldest first.
     *
     * Oldest first because this is a queue and the person who has waited longest is the person most
     * likely to have given up. Accounts whose address is not confirmed yet are **included**, with
     * the flag shown: an admin who recognises the family may well approve first and let the parent
     * confirm afterwards, and hiding those rows would make a registration that never confirmed
     * invisible — which is exactly the case the school most wants to see.
     */
    async listPending(): Promise<PendingAccount[]> {
        const users = await this.userRepository.find({
            where: { role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING },
            order: { createdAt: 'ASC' },
        });

        if (users.length === 0) {
            return [];
        }

        // One query for the profiles rather than one per user. `Profile.user` is the owning side,
        // so the join goes this way round.
        const profiles = await this.profileRepository
            .createQueryBuilder('profile')
            .leftJoin('profile.user', 'user')
            .where('user.id IN (:...ids)', { ids: users.map((user) => user.id) })
            .addSelect('user.id')
            .getMany();

        const byUserId = new Map(profiles.filter((profile) => profile.user).map((profile) => [profile.user?.id, profile]));

        return users.map((user) => {
            const profile = byUserId.get(user.id);
            return {
                userId: user.id,
                username: user.username,
                createdAt: user.createdAt,
                emailConfirmed: user.emailConfirmedAt !== null,
                firstName: profile?.firstName ?? null,
                lastName: profile?.lastName ?? null,
                email: profile?.email ?? null,
                phone: profile?.phone ?? null,
            };
        });
    }

    /**
     * Opens the second gate and tells the family.
     *
     * Approving an account whose address is still unconfirmed is allowed, and the account still is
     * not active — `isAccountActive` needs both. The mail goes out anyway: it is the answer to "we
     * are looking at your account", and a parent who reads "your account is active" and then cannot
     * sign in is a parent who goes and finds the confirmation mail, which is the action we want.
     */
    async approve(userId: number): Promise<{ message: string }> {
        const user = await this.requireParent(userId);

        if (user.approvalStatus === ApprovalStatus.APPROVED) {
            // Idempotent rather than a 409: two admins opening the queue at once is normal, and the
            // second click has already got what it asked for.
            return { message: 'Contul era deja aprobat' };
        }

        const profile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        const now = new Date();

        await this.dataSource.transaction(async (manager) => {
            await manager.update(User, { id: userId }, { approvalStatus: ApprovalStatus.APPROVED, approvalDecidedAt: now, rejectionReason: null });

            if (profile?.email) {
                const mail = composeAccountApproved(profile.firstName, loginUrl());
                await this.outbox.queue({ to: profile.email, subject: mail.subject, bodyText: mail.bodyText }, manager);
            } else {
                // A family typed in from a phone call has no address yet. Nothing to send, and
                // nothing broken — but worth a line, because "the parent was never told" is
                // otherwise indistinguishable from a queue that is stuck.
                this.logger.warn(`Approved user ${userId}, who has no email address on file; no notification sent.`);
            }
        });

        this.logger.log(`User ${userId} approved.`);
        return { message: 'Cont aprobat' };
    }

    /**
     * Refuses an account, keeping the row.
     *
     * Deleting it would free the username and the address, so the same person could register again
     * and land back at the top of the queue with nothing to show they had been refused before. The
     * reason is stored for admins and, deliberately, does not travel in the mail — see
     * `composeAccountRejected`.
     */
    async reject(userId: number, reason?: string): Promise<{ message: string }> {
        const user = await this.requireParent(userId);

        if (user.approvalStatus === ApprovalStatus.APPROVED) {
            throw new BadRequestException({
                message: 'Contul este deja aprobat. Dezactivarea unui cont activ nu se face de aici.',
                error: 'ACCOUNT_ALREADY_APPROVED',
            });
        }

        if (user.approvalStatus === ApprovalStatus.REJECTED) {
            return { message: 'Contul era deja respins' };
        }

        const profile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        const now = new Date();

        await this.dataSource.transaction(async (manager) => {
            await manager.update(User, { id: userId }, { approvalStatus: ApprovalStatus.REJECTED, approvalDecidedAt: now, rejectionReason: reason ?? null });

            if (profile?.email) {
                const mail = composeAccountRejected(profile.firstName, this.office);
                await this.outbox.queue({ to: profile.email, subject: mail.subject, bodyText: mail.bodyText }, manager);
            }
        });

        this.logger.log(`User ${userId} rejected.`);
        return { message: 'Cont respins' };
    }

    /**
     * A verdict applies to a parent account and to nothing else.
     *
     * An admin is active by construction — `isAccountActive` exempts the role — so approving or
     * rejecting one would write columns that mean nothing, and rejecting one would read as locking
     * out a colleague while doing no such thing. Refused outright rather than silently ignored.
     */
    private async requireParent(userId: number): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (user.role !== Role.PARENT) {
            throw new BadRequestException({
                message: 'Doar conturile de părinte trec prin aprobare',
                error: 'NOT_A_PARENT_ACCOUNT',
            });
        }
        return user;
    }
}
