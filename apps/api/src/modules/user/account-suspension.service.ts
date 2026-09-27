import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { Session } from 'src/entities/session.entity';
import { Role } from 'src/enum/role.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { loginUrl } from 'src/modules/auth/portal-urls';
import { officeAddress } from 'src/modules/mail/office-address';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { AccountApprovalService, type PendingAccount } from './account-approval.service';
import { accountAddressee } from './account-addressee';

/** One row of the suspended list: the family, the day, and the reason the family was sent. */
export interface SuspendedAccount extends PendingAccount {
    suspendedAt: Date;
    suspensionReason: string | null;
}

/**
 * Terms §14: „Putem suspenda un cont folosit contrar regulilor de mai sus, cu un email care spune de
 * ce, și îl reactivăm când motivul dispare." The text reserved the right long before anything could
 * exercise it — the office could refuse an account that was not approved yet, and nothing at all
 * once it was.
 *
 * **A suspension closes the portal and nothing else.** The same paragraph promises „Suspendarea
 * contului nu afectează contractul de înscriere al copilului": the children stay enrolled, the month
 * is billed, and the family keeps hearing about its classes — those messages are the contract, not
 * the portal. So `isAccountActive`, which gates putting a child in a group, does not read it; what
 * does is the sign-in, which refuses with `ACCOUNT_SUSPENDED` once the password is right, and the
 * refresh, which refuses under the account row (`SessionService.rotate`).
 *
 * **Every session closes in the same transaction**, behind the account row taken exclusively — the
 * order `revokeAllForUser` keeps, written inline because that method must not run inside a
 * transaction already holding the row. A rotation in flight holds it shared, so it either committed
 * before the sweep, which then revokes its successor, or it runs after and finds the account
 * suspended. What stays is the access token already issued: up to fifteen minutes, the compromise
 * `AuthGuard` documents.
 *
 * Parent accounts only, like a verdict: an admin's access is its role, changed from the users screen.
 */
@Injectable()
export class AccountSuspensionService {
    private readonly logger = new Logger('AccountSuspension');
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private readonly approvals: AccountApprovalService,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
    ) {}

    /**
     * Every suspended parent account, most recent first — the office's way back to them. Without it a
     * suspended family would be on no screen but its own page, the lesson of the refused list.
     */
    async listSuspended(): Promise<SuspendedAccount[]> {
        const users = await this.userRepository.find({
            where: { role: Role.PARENT, suspendedAt: Not(IsNull()) },
            order: { suspendedAt: 'DESC', id: 'DESC' },
        });
        const rows = await this.approvals.rowsFor(users);
        return rows.map((row, index) => ({
            ...row,
            suspendedAt: users[index].suspendedAt as Date,
            suspensionReason: users[index].suspensionReason,
        }));
    }

    /**
     * Suspends the account, closes its sessions and tells the family why.
     *
     * Idempotent under the lock: a second press — or a second admin — finds it suspended and writes
     * nothing, so the family gets one email. A different reason is a reactivation and a new
     * suspension, which the family then reads as two messages, as it should.
     */
    async suspend(userId: number, reason: string, actor: Actor, now: Date = new Date()): Promise<{ message: string }> {
        await this.approvals.requireParent(userId);

        const suspended = await this.dataSource.transaction(async (manager) => {
            const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
            if (!user) {
                throw new NotFoundException('User not found');
            }
            if (user.suspendedAt !== null) {
                return false;
            }

            await manager.update(User, { id: userId }, { suspendedAt: now, suspensionReason: reason });
            await manager.update(Session, { user: { id: userId }, revokedAt: IsNull() }, { revokedAt: now });

            // The reason travels, unlike a refusal's: §14 promises the email says why. The address
            // gate still applies — `queueOrRecord` writes an undeliverable row for an address nobody
            // proved, instead of mailing a stranger the school's words about a family.
            const addressee = await accountAddressee(manager, userId);
            const mail = await this.mailTemplates.render('account-suspended', {
                firstName: addressee?.firstName ?? '',
                reason,
                officeEmail: this.office,
            });
            await this.outbox.queueOrRecord(
                { email: addressee?.email },
                { subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined, profileId: addressee?.profileId },
                manager,
            );

            // Who suspended, and when — the row only says when. Field names only, as for every
            // account change (E07/S3): the reason is on the row and in the family's mailbox.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: userId,
                    fields: ['suspendedAt', 'suspensionReason'],
                    note: 'cont suspendat (termeni §14); sesiunile au fost închise',
                },
                manager,
            );
            return true;
        });

        if (!suspended) {
            return { message: 'Contul era deja suspendat' };
        }
        this.logger.log(`User ${userId} suspended.`);
        return { message: 'Cont suspendat' };
    }

    /** Lifts the suspension and tells the family it can sign in again. Idempotent like `suspend`. */
    async reactivate(userId: number, actor: Actor): Promise<{ message: string }> {
        await this.approvals.requireParent(userId);

        const reactivated = await this.dataSource.transaction(async (manager) => {
            const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
            if (!user) {
                throw new NotFoundException('User not found');
            }
            if (user.suspendedAt === null) {
                return false;
            }

            // The reason goes with the suspension: the row says what is true now, and a stale reason
            // on an account in use would read, in the family's copy of its data, as a suspension.
            await manager.update(User, { id: userId }, { suspendedAt: null, suspensionReason: null });

            const addressee = await accountAddressee(manager, userId);
            const mail = await this.mailTemplates.render('account-reactivated', { firstName: addressee?.firstName ?? '', portalUrl: loginUrl() });
            await this.outbox.queueOrRecord(
                { email: addressee?.email },
                { subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined, profileId: addressee?.profileId },
                manager,
            );

            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: userId,
                    fields: ['suspendedAt', 'suspensionReason'],
                    note: 'suspendarea contului a fost ridicată',
                },
                manager,
            );
            return true;
        });

        if (!reactivated) {
            return { message: 'Contul nu era suspendat' };
        }
        this.logger.log(`User ${userId} reactivated.`);
        return { message: 'Suspendarea a fost ridicată' };
    }
}
