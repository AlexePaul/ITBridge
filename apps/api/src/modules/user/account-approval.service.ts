import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { loginUrl } from 'src/modules/auth/portal-urls';
import { officeAddress } from 'src/modules/mail/office-address';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { claimedFamiliesOf, claimedFamilyOf } from 'src/modules/auth/claimant';
import { sameAddress } from 'src/common/same-address';
import { accountAddressee } from './account-addressee';

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
    /** The family an account created from a claim link asks to be attached to; its names and contacts are the ones above. */
    claimedProfileId: number | null;
}

/** One row of the refused list: the same, plus when the school decided and the admins' own note. */
export interface RejectedAccount extends PendingAccount {
    decidedAt: Date | null;
    rejectionReason: string | null;
}

@Injectable()
export class AccountApprovalService {
    private readonly logger = new Logger('AccountApproval');
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
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

        return this.rowsFor(users);
    }

    /**
     * Every parent account the school refused, newest decision first — the review of 26 September
     * 2026.
     *
     * The refusal mail and the portal both tell the family "scrie-ne… ne uităm încă o dată", and
     * `approve` has always accepted a refused account — but the queue lists only `PENDING`, so the
     * moment somebody pressed "Respinge" the family vanished from every screen, and the office had
     * nowhere to look again from. The decision day is on the row because that is what the family
     * will quote on the phone; the reason is the admin's own note and this list is the admins'.
     */
    async listRejected(): Promise<RejectedAccount[]> {
        const users = await this.userRepository.find({
            where: { role: Role.PARENT, approvalStatus: ApprovalStatus.REJECTED },
            order: { approvalDecidedAt: 'DESC', id: 'DESC' },
        });

        const rows = await this.rowsFor(users);
        return rows.map((row, index) => ({
            ...row,
            decidedAt: users[index].approvalDecidedAt,
            rejectionReason: users[index].rejectionReason,
        }));
    }

    /**
     * One row per account, with the family's name and contact read in a single query.
     *
     * An account created from a claim link has no family attached yet, and its row carries the
     * family it claimed instead (`claimedProfileId`): that is the family the office is being asked
     * to hand over, and a row of nulls would ask it to approve a stranger blind.
     */
    async rowsFor(users: User[]): Promise<PendingAccount[]> {
        if (users.length === 0) {
            return [];
        }
        const ids = users.map((user) => user.id);

        // One query for the profiles rather than one per user. `Profile.user` is the owning side,
        // so the join goes this way round.
        const profiles = await this.profileRepository
            .createQueryBuilder('profile')
            .leftJoin('profile.user', 'user')
            .where('user.id IN (:...ids)', { ids })
            .addSelect('user.id')
            .getMany();
        const byUserId = new Map(profiles.filter((profile) => profile.user).map((profile) => [profile.user?.id, profile]));

        const claimedBy = await claimedFamiliesOf(this.dataSource.manager, ids);

        return users.map((user) => {
            const profile = byUserId.get(user.id);
            const claimed = profile ? undefined : claimedBy.get(user.id);
            const family = profile ?? claimed;
            return {
                userId: user.id,
                username: user.username,
                createdAt: user.createdAt,
                emailConfirmed: user.emailConfirmedAt !== null,
                firstName: family?.firstName ?? null,
                lastName: family?.lastName ?? null,
                email: family?.email ?? null,
                phone: family?.phone ?? null,
                claimedProfileId: claimed?.id ?? null,
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
    async approve(userId: number, actor: Actor): Promise<{ message: string }> {
        await this.requireParent(userId);
        const now = new Date();

        const approved = await this.dataSource.transaction(async (manager) => {
            // An account created from a claim link is attached to its family here, not at the claim
            // (review of 26 September 2026) — see `claimant.ts`. The family's row is locked before
            // the account's, the order the claim and the erasure take them in.
            const claimed = await claimedFamilyOf(manager, userId);
            const claimedProfile = claimed ? await this.lockProfile(manager, claimed.profile.id) : null;
            const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
            if (!user) {
                throw new NotFoundException('User not found');
            }

            if (user.approvalStatus === ApprovalStatus.APPROVED) {
                // Idempotent rather than a 409: two admins opening the queue at once is normal, and
                // the second click has already got what it asked for. Judged under the lock, so the
                // second one waits for the first and neither writes twice nor mails twice.
                return false;
            }

            let profile: Profile | null;
            if (claimed) {
                // Read again under the lock: the family must still be the one the link was sent to,
                // at the address the account proved. A correction of the address since means the
                // link reached a mailbox that is no longer the family's; an account attached since,
                // or an erasure, means there is nothing left to hand over.
                if (
                    !claimedProfile ||
                    claimedProfile.user ||
                    claimedProfile.erasedAt !== null ||
                    !claimedProfile.email ||
                    !sameAddress(claimedProfile.email, claimed.email)
                ) {
                    throw new ConflictException({
                        message: `The family account ${userId} was created for has changed since the claim; reject it and send the family a new link.`,
                        error: 'CLAIMED_FAMILY_CHANGED',
                    });
                }
                await manager.update(Profile, { id: claimedProfile.id }, { user: { id: userId } });
                await this.audit.recordPersonalDataChange(
                    {
                        actor,
                        action: AuditAction.UPDATED,
                        entityType: 'Profile',
                        entityId: claimedProfile.id,
                        fields: ['user'],
                        note: 'cont creat din linkul de cont, legat de familie la aprobare',
                    },
                    manager,
                );
                profile = claimedProfile;
            } else {
                profile = await manager.findOne(Profile, { where: { user: { id: userId } } });
            }

            await manager.update(User, { id: userId }, { approvalStatus: ApprovalStatus.APPROVED, approvalDecidedAt: now, rejectionReason: null });

            // E17/S5: a family with no address is **recorded as undeliverable**, not skipped. The
            // branch that used to live here logged a warning and moved on, which put the fact
            // somewhere nobody reads — and "the parent was never told" then looked exactly like a
            // queue that is stuck.
            const mail = await this.mailTemplates.render('account-approved', { firstName: profile?.firstName ?? '', portalUrl: loginUrl() });
            await this.outbox.queueOrRecord(
                { email: profile?.email },
                { subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined, profileId: profile?.id },
                manager,
            );

            // `approvalDecidedAt` on the row says *when* the school let this family in. Nothing said
            // *who*, and this is the decision that turns a stranger into an account that can put a
            // child in a room. Field names only: `approvalStatus` is personal data with `account`
            // retention, and the note carries the act rather than a value copied off the row.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: userId,
                    fields: ['approvalStatus', 'approvalDecidedAt'],
                    note: 'cont aprobat',
                },
                manager,
            );
            return true;
        });

        if (!approved) {
            return { message: 'Contul era deja aprobat' };
        }
        this.logger.log(`User ${userId} approved.`);
        return { message: 'Cont aprobat' };
    }

    /**
     * Refuses an account, keeping the row.
     *
     * Deleting it would free the username and the address, so the same person could register again
     * and land back at the top of the queue with nothing to show they had been refused before. The
     * reason is stored for admins and, deliberately, does not travel in the mail — see the
     * `account-rejected` template's description in `template-defaults.ts`.
     */
    async reject(userId: number, actor: Actor, reason?: string): Promise<{ message: string }> {
        await this.requireParent(userId);
        const now = new Date();

        const rejected = await this.dataSource.transaction(async (manager) => {
            // Under the account's lock, so a refusal and an approval pressed together are judged one
            // after the other, each on what the other left.
            const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
            if (!user) {
                throw new NotFoundException('User not found');
            }
            if (user.approvalStatus === ApprovalStatus.APPROVED) {
                throw new BadRequestException({
                    message: 'Contul este deja aprobat. Dezactivarea unui cont activ nu se face de aici.',
                    error: 'ACCOUNT_ALREADY_APPROVED',
                });
            }
            if (user.approvalStatus === ApprovalStatus.REJECTED) {
                return false;
            }

            // An account created from a claim link has no family attached; the refusal goes to the
            // address the link was sent to, which the account proved — see `accountAddressee`.
            const addressee = await accountAddressee(manager, userId);

            await manager.update(User, { id: userId }, { approvalStatus: ApprovalStatus.REJECTED, approvalDecidedAt: now, rejectionReason: reason ?? null });

            const mail = await this.mailTemplates.render('account-rejected', { firstName: addressee?.firstName ?? '', officeEmail: this.office });
            await this.outbox.queueOrRecord(
                { email: addressee?.email },
                { subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined, profileId: addressee?.profileId },
                manager,
            );

            // The refusal is the half a family is most likely to ask about, and `rejectionReason`
            // records what was decided without recording who decided it. `rejectionReason` is not
            // among the fields named: it is the admin's own sentence, and the trail takes names, not
            // content — it is on the row for whoever is entitled to read it.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: userId,
                    fields: ['approvalStatus', 'approvalDecidedAt'],
                    note: 'cont respins',
                },
                manager,
            );
            return true;
        });

        if (!rejected) {
            return { message: 'Contul era deja respins' };
        }
        this.logger.log(`User ${userId} rejected.`);
        return { message: 'Cont respins' };
    }

    /**
     * The family's row, locked, with its account. `FOR UPDATE OF` the one table: Postgres refuses to
     * lock the nullable side of an outer join.
     */
    private lockProfile(manager: EntityManager, profileId: number): Promise<Profile | null> {
        return manager
            .getRepository(Profile)
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .andWhere('profile.id = :id', { id: profileId })
            .setLock('pessimistic_write', undefined, ['profile'])
            .getOne();
    }

    /**
     * A verdict applies to a parent account and to nothing else — approval, refusal and, from
     * `AccountSuspensionService`, suspension.
     *
     * An admin is active by construction — `isAccountActive` exempts the role — so approving or
     * rejecting one would write columns that mean nothing, and rejecting one would read as locking
     * out a colleague while doing no such thing. An admin's access is its role, changed from the users
     * screen. Refused outright rather than silently ignored.
     */
    async requireParent(userId: number): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (user.role !== Role.PARENT) {
            throw new BadRequestException({
                message: 'Only a parent account is approved, refused or suspended here',
                error: 'NOT_A_PARENT_ACCOUNT',
            });
        }
        return user;
    }
}
