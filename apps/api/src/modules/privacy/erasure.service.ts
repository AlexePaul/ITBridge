import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { Discount } from 'src/entities/discount.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { Lead } from 'src/entities/lead.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { User } from 'src/entities/user.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { erasedProfileFields, isErased } from './erasure.rules';

export interface ErasureReport {
    profileId: number;
    childrenRemoved: number;
    leadsRemoved: number;
    discountsRemoved: number;
    messagesRemoved: number;
    invoicesKept: number;
    accountRemoved: boolean;
}

/**
 * Erasure on request — E07 S4, the second flow.
 *
 * **This is not E04 S5.** That story's „retras" state is a reversible thing an admin applies when a
 * family stops coming; this is the right a family exercises, and it cuts through any such state and
 * really deletes. The two are named apart on purpose, because a soft delete that answers to the
 * word "erasure" is how a platform ends up telling a family their data is gone while it is not.
 *
 * **The profile row survives, emptied.** `Invoice.parent` is `CASCADE`, so deleting the row would
 * take the accounting evidence with it — and E04 S5 decided the platform keeps the evidence of what
 * a family paid even though the fiscal document is SmartBill's. So the row stays as a shell and
 * everything that could identify anybody leaves it.
 *
 * **The cascades do most of the work, and that is the point.** Deleting a `Child` takes its
 * enrolments, attendance, announced absences, waitlist entries, session-count overrides and projects
 * with it, because every one of those declares `onDelete: 'CASCADE'` on the child. Deleting the
 * `User` takes the sessions, the e-mail confirmations and the document acceptances. What is left
 * over is exactly what this service has to say out loud, and there are four such things:
 *
 * - **Leads keep their own copies of the names.** `Lead.child` is `SET NULL`, and the row carries
 *   `childFirstName`, `childLastName` and `childBirthDate` written from a public form. Deleting the
 *   child would leave all three sitting in `leads`.
 * - **The outbox has no relation to a profile.** It is shared and it also writes to the office, so
 *   its rows are found by address — which is what the data inventory says E07 S4 would have to do.
 * - **A payment's `notes` is free text an admin wrote about a family**, on a row that is kept. The
 *   figures stay because they are the accounting record; the sentence does not.
 * - **Discounts go.** The epic keeps invoices and nothing else, and a discount row names the reason
 *   a particular family was charged less. The invoice already carries the number.
 *
 * **What this cannot reach**, and it is written here rather than discovered later: a stray file the
 * agent could not attribute (`unassigned_files`) may carry a child's name in its path, and there is
 * no link from it to a family — failing to make that link is the whole content of the row. The
 * inventory says the same in its own words. Clearing those is an admin's job, from the screen that
 * lists them.
 */
@Injectable()
export class ErasureService {
    private readonly logger = new Logger('Erasure');

    constructor(
        @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
    ) {}

    /** The family asks. Nothing is deleted here — the office has to look first. */
    async request(profileId: number, actor: Actor): Promise<{ requestedAt: Date }> {
        const profile = await this.profiles.findOne({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');
        if (isErased(profile)) throw new ConflictException({ message: 'Contul e deja șters.', error: 'ALREADY_ERASED' });

        // A second request before the first is served is the same request made twice, so the first
        // day stands: it is the one the thirty-day term runs from.
        const requestedAt = profile.erasureRequestedAt ?? new Date();
        await this.profiles.update(profileId, { erasureRequestedAt: requestedAt });
        await this.audit.record({
            actor,
            action: AuditAction.UPDATED,
            entityType: 'Profile',
            entityId: profileId,
            changes: { erasureRequestedAt: { from: null, to: requestedAt.toISOString() } },
            note: 'cerere de ștergere',
        });

        return { requestedAt };
    }

    /** The family changes its mind, or the office declines. The request goes; nothing else moves. */
    async withdrawRequest(profileId: number, actor: Actor): Promise<void> {
        const profile = await this.profiles.findOne({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');
        if (isErased(profile)) throw new ConflictException({ message: 'Contul e deja șters.', error: 'ALREADY_ERASED' });
        if (!profile.erasureRequestedAt) return;

        await this.profiles.update(profileId, { erasureRequestedAt: null });
        await this.audit.record({
            actor,
            action: AuditAction.UPDATED,
            entityType: 'Profile',
            entityId: profileId,
            changes: { erasureRequestedAt: { from: profile.erasureRequestedAt.toISOString(), to: null } },
            note: 'cerere de ștergere retrasă',
        });
    }

    /** Families waiting, oldest request first — the office's queue, and the thirty-day clock. */
    async pending(): Promise<Profile[]> {
        return this.profiles.find({
            where: { erasureRequestedAt: Not(IsNull()), erasedAt: IsNull() },
            order: { erasureRequestedAt: 'ASC' },
        });
    }

    /**
     * Carries it out. One transaction: a half-erased family is worse than an un-erased one.
     *
     * The audit entry is written inside it, like every other, and it is the one record that outlives
     * the family — by design, and safely, because the trail stores identifiers rather than names
     * (E07 S3). "Who erased profile 412 and when" has to remain answerable precisely *because*
     * everything else is gone.
     */
    async erase(profileId: number, actor: Actor): Promise<ErasureReport> {
        const profile = await this.profiles.findOne({ where: { id: profileId }, relations: { user: true } });
        if (!profile) throw new NotFoundException('Profile not found');
        if (isErased(profile)) throw new ConflictException({ message: 'Contul e deja șters.', error: 'ALREADY_ERASED' });

        const email = profile.email;
        const userId = profile.user?.id;

        const report = await this.dataSource.transaction(async (manager) => {
            const children = await manager.find(Child, { where: { parent: { id: profileId } }, select: { id: true } });
            const childIds = children.map((child) => child.id);

            // Before the children go: `Lead.child` is SET NULL, and the row keeps its own copies of
            // the child's name and birth date, written from a public form.
            const leads = await manager.delete(Lead, { profile: { id: profileId } });

            // One delete, and the cascades take enrolments, attendance, announced absences, waitlist
            // entries, session-count overrides and projects with them.
            if (childIds.length) await manager.delete(Child, childIds);

            const discounts = await manager.delete(Discount, { parent: { id: profileId } });

            // No relation to walk: the queue is shared and also writes to the office, so its rows
            // are found by address — exactly what the inventory says this story would have to do.
            const messages = email ? await manager.delete(OutboxMessage, { to: email }) : { affected: 0 };

            const invoices = await manager.find(Invoice, { where: { parent: { id: profileId } }, select: { id: true } });
            const invoiceIds = invoices.map((invoice) => invoice.id);
            // The figures stay — they are the accounting record — but the sentence an admin wrote
            // about the family on the same row does not.
            if (invoiceIds.length) await manager.update(Payment, { invoice: { id: In(invoiceIds) } }, { notes: null });

            // Cascades to sessions, e-mail confirmations and document acceptances, and sets
            // `Profile.user` to null on the way out.
            if (userId) await manager.delete(User, userId);

            const now = new Date();
            await manager.update(Profile, profileId, erasedProfileFields(now));

            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profileId,
                    changes: {
                        erasedAt: { from: null, to: now.toISOString() },
                        childrenRemoved: { from: null, to: childIds.length },
                        invoicesKept: { from: null, to: invoiceIds.length },
                    },
                    note: 'ștergere la cererea familiei',
                },
                manager,
            );

            return {
                profileId,
                childrenRemoved: childIds.length,
                leadsRemoved: leads.affected ?? 0,
                discountsRemoved: discounts.affected ?? 0,
                messagesRemoved: messages.affected ?? 0,
                invoicesKept: invoiceIds.length,
                accountRemoved: Boolean(userId),
            };
        });

        // No names, on purpose: this line ends up in a log file, and a log is not a place a family's
        // name should survive its own erasure.
        this.logger.log(
            `Erased profile ${profileId}: ${report.childrenRemoved} child(ren), ${report.leadsRemoved} lead(s), ` +
                `${report.discountsRemoved} discount(s), ${report.messagesRemoved} message(s); ${report.invoicesKept} invoice(s) kept.`,
        );

        return report;
    }
}
