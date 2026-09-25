import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Lead } from 'src/entities/lead.entity';
import { FISCAL_WORK_OUTSTANDING, Invoice } from 'src/entities/invoice.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { EmailConfirmation } from 'src/entities/email-confirmation.entity';
import { PasswordReset } from 'src/entities/password-reset.entity';
import { IN_FORCE_STATUSES } from 'src/enum/enrollment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { SYSTEM_ACTOR } from 'src/modules/audit/actor';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { SCHOOL_TIME_ZONE, schoolDay } from 'src/common/school-clock';
import { ErasureService } from './erasure.service';
import { isErased } from './erasure.rules';
import { claimsLead } from './family-rows';
import {
    EXPIRED_LINK_RETENTION_DAYS,
    FAMILY_RETENTION_MONTHS,
    LEAD_RETENTION_MONTHS,
    MESSAGE_RETENTION_MONTHS,
    erasureDueOn,
    holdOf,
    keptSince,
    type RetentionHold,
} from './retention.rules';

/** One withdrawn family as the office sees it: when it left, when it goes, and what keeps it. */
export interface RetentionRow {
    profileId: number;
    firstName: string;
    lastName: string;
    withdrawnAt: string;
    dueOn: string;
    /** The term has come. With `hold` null, the next nightly pass erases the family. */
    due: boolean;
    hold: RetentionHold | null;
}

/** The terms the server counts with, sent with every answer so the screens name them, never repeat them. */
export interface RetentionTerms {
    familyMonths: number;
    enquiryMonths: number;
    messageMonths: number;
    expiredLinkDays: number;
}

export const RETENTION_TERMS: RetentionTerms = {
    familyMonths: FAMILY_RETENTION_MONTHS,
    enquiryMonths: LEAD_RETENTION_MONTHS,
    messageMonths: MESSAGE_RETENTION_MONTHS,
    expiredLinkDays: EXPIRED_LINK_RETENTION_DAYS,
};

/** The office's list — `GET /privacy/retention`. */
export interface RetentionSchedule {
    terms: RetentionTerms;
    rows: RetentionRow[];
}

/** One family's side of it — the family page. `row` is `null` while the family is not withdrawn. */
export interface FamilyRetention {
    terms: RetentionTerms;
    row: RetentionRow | null;
}

export interface RetentionReport {
    familiesErased: number;
    /** Due, but kept for a reason in `RetentionHold` — the office's list says which. */
    familiesHeld: number;
    /** Enquiries that never became an enrolment, deleted with the shell profile a booking made. */
    enquiriesRemoved: number;
    messagesRemoved: number;
    expiredLinksRemoved: number;
}

/**
 * The second half of the road E04/S5 opened — E22/S3: a family the school recorded as gone keeps its
 * data for a stated term, and then it really goes.
 *
 * **Withdrawal is a fact somebody records, never an inference.** E04/S5 settled it before a line was
 * written: a job that decided "inactive for N months" on its own would erase exactly the family that
 * took a term off. So `withdraw` is an admin's act with a day on it, it can be taken back until the
 * term runs out, and the job only ever counts from it.
 *
 * **The erasure itself is E07/S4's**, called with `SYSTEM_ACTOR` and a reason the trail keeps. One
 * erasure, whoever asks for it: the family, or the calendar. A second implementation of "what goes
 * and what stays" is exactly how the two would drift — one of them keeping the invoices, say.
 *
 * **Three more promises from the privacy note's §7 run in the same pass**, because they are the same
 * kind of promise and a second nightly job would be a second place to forget one: an enquiry that
 * never became an enrolment, a copy of a message sent, and an expired link. Each is a delete with a
 * cut-off, counted in the school's days.
 */
@Injectable()
export class RetentionService {
    private readonly logger = new Logger('Retention');

    constructor(
        @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
        @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
        @InjectRepository(WaitlistEntry) private readonly waitlist: Repository<WaitlistEntry>,
        @InjectRepository(Lead) private readonly leads: Repository<Lead>,
        @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
        @InjectRepository(OutboxMessage) private readonly outbox: Repository<OutboxMessage>,
        @InjectRepository(EmailConfirmation) private readonly confirmations: Repository<EmailConfirmation>,
        @InjectRepository(PasswordReset) private readonly passwordResets: Repository<PasswordReset>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
        private readonly erasure: ErasureService,
        private readonly arrears: ArrearsService,
    ) {}

    /**
     * Records that a family has left — E04/S5.
     *
     * **Refused while anything is still open**, and not by closing it here: an enrolment ends
     * through `EnrollmentService`, which frees the seat and offers it to the waiting list, and a
     * waiting-list place is withdrawn from its own screen. Doing either from here would be a second
     * door to the same thing, without the consequences the first one carries.
     *
     * A second call moves the day, which is how a mistyped one is corrected; the trail keeps both.
     */
    async withdraw(profileId: number, withdrawnOn: string | undefined, actor: Actor, now: Date = new Date()): Promise<FamilyRetention> {
        const profile = await this.profiles.findOne({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');
        if (isErased(profile)) throw new ConflictException({ message: `Profile ${profileId} is already erased.`, error: 'ALREADY_ERASED' });

        const today = schoolDay(now);
        const day = withdrawnOn ?? today;
        // A withdrawal is something that happened. A day in the future would start a clock on an
        // event nobody can have witnessed yet.
        if (day > today) {
            throw new BadRequestException({ message: `A withdrawal cannot be recorded for ${day}, after today (${today}).`, error: 'WITHDRAWAL_IN_FUTURE' });
        }

        const [inForce, waiting] = await Promise.all([this.enrolmentsInForce([profileId]), this.openWaitlist([profileId])]);
        if ((inForce.get(profileId) ?? 0) > 0) {
            throw new ConflictException({
                message: `Family ${profileId} still has a child enrolled; end the enrolment first.`,
                error: 'FAMILY_HAS_ENROLMENTS_IN_FORCE',
            });
        }
        if ((waiting.get(profileId) ?? 0) > 0) {
            throw new ConflictException({
                message: `Family ${profileId} is still on a waiting list; take them off it first.`,
                error: 'FAMILY_ON_WAITLIST',
            });
        }

        const previous = profile.withdrawnAt;
        await this.dataSource.transaction(async (manager) => {
            await manager.update(Profile, profileId, { withdrawnAt: day });
            // The day, like the erasure request's: the trail has to say when the clock started, and
            // a day with no name beside it identifies nobody.
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profileId,
                    changes: { withdrawnAt: { from: previous, to: day } },
                    note: 'familie retrasă',
                },
                manager,
            );
        });

        return this.forFamily(profileId, today);
    }

    /** The family came back, or the withdrawal was a mistake. Nothing else moves. */
    async reinstate(profileId: number, actor: Actor): Promise<void> {
        const profile = await this.profiles.findOne({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');
        if (isErased(profile)) throw new ConflictException({ message: `Profile ${profileId} is already erased.`, error: 'ALREADY_ERASED' });
        if (!profile.withdrawnAt) return;

        const previous = profile.withdrawnAt;
        await this.dataSource.transaction(async (manager) => {
            await manager.update(Profile, profileId, { withdrawnAt: null });
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profileId,
                    changes: { withdrawnAt: { from: previous, to: null } },
                    note: 'retragere anulată',
                },
                manager,
            );
        });
    }

    /** One family's row, or `null` when it is not withdrawn — the family page's question. */
    async forFamily(profileId: number, today: string = schoolDay(new Date())): Promise<FamilyRetention> {
        const profile = await this.profiles.findOne({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');
        const [row] = await this.schedule(today, profileId);
        return { terms: RETENTION_TERMS, row: row ?? null };
    }

    /** The office's list, with the terms it was counted by. */
    async overview(today: string = schoolDay(new Date())): Promise<RetentionSchedule> {
        return { terms: RETENTION_TERMS, rows: await this.schedule(today) };
    }

    /**
     * Every withdrawn family not erased yet, the soonest due first — the office's list.
     *
     * The holds are read in three queries for the whole list, not three per family: the arrears
     * come from `ArrearsService.list`, the one definition of "still owes", so the family held here
     * is exactly the family the arrears screen names.
     */
    async schedule(today: string = schoolDay(new Date()), onlyProfileId?: number): Promise<RetentionRow[]> {
        const withdrawn = await this.profiles.find({
            where: { withdrawnAt: Not(IsNull()), erasedAt: IsNull(), ...(onlyProfileId !== undefined ? { id: onlyProfileId } : {}) },
            order: { withdrawnAt: 'ASC', id: 'ASC' },
        });
        if (withdrawn.length === 0) return [];

        const ids = withdrawn.map((profile) => profile.id);
        const [inForce, waiting, arrears, fiscal] = await Promise.all([
            this.enrolmentsInForce(ids),
            this.openWaitlist(ids),
            this.arrears.list(),
            this.invoicesOnTheirWayToSmartBill(ids),
        ]);
        const owed = new Map<number, number>();
        for (const row of arrears) owed.set(row.parentId, (owed.get(row.parentId) ?? 0) + row.outstanding);

        return withdrawn.map((profile) => {
            const withdrawnAt = String(profile.withdrawnAt).slice(0, 10);
            const dueOn = erasureDueOn(withdrawnAt);
            return {
                profileId: profile.id,
                firstName: profile.firstName,
                lastName: profile.lastName,
                withdrawnAt,
                dueOn,
                due: dueOn <= today,
                hold: holdOf({
                    enrolmentsInForce: inForce.get(profile.id) ?? 0,
                    openWaitlistEntries: waiting.get(profile.id) ?? 0,
                    outstanding: owed.get(profile.id) ?? 0,
                    invoicesOnTheirWayToSmartBill: fiscal.get(profile.id) ?? 0,
                }),
            };
        });
    }

    /**
     * The nightly pass. Each part stands alone: a family that fails to erase is logged and the rest
     * go on, because the alternative is one bad row keeping every other promise from being kept.
     */
    async run(today: string = schoolDay(new Date()), now: Date = new Date()): Promise<RetentionReport> {
        const report: RetentionReport = { familiesErased: 0, familiesHeld: 0, enquiriesRemoved: 0, messagesRemoved: 0, expiredLinksRemoved: 0 };

        for (const row of await this.schedule(today)) {
            if (!row.due) continue;
            if (row.hold) {
                report.familiesHeld++;
                continue;
            }
            try {
                await this.erasure.erase(row.profileId, SYSTEM_ACTOR, 'withdrawal_term');
                report.familiesErased++;
            } catch (error: unknown) {
                this.logger.error(`Could not erase family ${row.profileId} at term: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        report.enquiriesRemoved = await this.removeStaleEnquiries(today);
        report.messagesRemoved = await this.removeOldMessages(today);
        report.expiredLinksRemoved = await this.removeExpiredLinks(now);

        // Counts, never names: this line is in a log, and a log is not where an erased family's
        // name should outlive it.
        if (Object.values(report).some((count) => count > 0)) {
            this.logger.log(
                `Retention ${today}: ${report.familiesErased} family(ies) erased, ${report.familiesHeld} held, ` +
                    `${report.enquiriesRemoved} enquiry(ies), ${report.messagesRemoved} message(s), ${report.expiredLinksRemoved} expired link(s) removed.`,
            );
        }
        return report;
    }

    /**
     * Enquiries that never became an enrolment, a year after anybody last touched them — "cererea de
     * probă și fișa creată de ea, dacă familia nu s-a înscris" (§7).
     *
     * **The shell a booking made goes with it**, through the same erasure: the trial form writes a
     * profile, a child and a trial enrolment (E20/S2), and deleting only the lead would leave the
     * child's name and birthday behind. A profile is a shell while it has no account, no invoice and
     * nothing in force; anything more is a family, whose own term governs it — and so does a lead with
     * no link whose address a family on file answers to, which is how `leadsOfFamily` would find it.
     */
    private async removeStaleEnquiries(today: string): Promise<number> {
        const stale = await this.leads
            .createQueryBuilder('lead')
            .leftJoinAndSelect('lead.profile', 'profile')
            .leftJoinAndSelect('profile.user', 'user')
            .andWhere('lead.status <> :enrolled', { enrolled: LeadStatus.ENROLLED })
            .andWhere(`("lead"."lastActivityAt" AT TIME ZONE '${SCHOOL_TIME_ZONE}')::date < :cutoff`, { cutoff: keptSince(today, LEAD_RETENTION_MONTHS) })
            .getMany();

        let removed = 0;
        for (const lead of stale) {
            try {
                if (lead.profile) {
                    if (isErased(lead.profile) || lead.profile.user || !(await this.isShell(lead.profile.id))) continue;
                    await this.erasure.erase(lead.profile.id, SYSTEM_ACTOR, 'enquiry_term');
                    removed++;
                    continue;
                }
                if (await this.answersToAFamily(lead)) continue;
                await this.leads.delete(lead.id);
                removed++;
            } catch (error: unknown) {
                this.logger.error(`Could not remove enquiry ${lead.id} at term: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return removed;
    }

    /**
     * Copies of what the platform sent, a year after they went — and what could not go, a year after
     * it was written. Never a message still waiting: that one has not been sent yet.
     */
    private async removeOldMessages(today: string): Promise<number> {
        const result = await this.outbox
            .createQueryBuilder()
            .delete()
            .from(OutboxMessage)
            .andWhere('status IN (:...done)', { done: [OutboxStatus.SENT, OutboxStatus.FAILED, OutboxStatus.UNDELIVERABLE] })
            .andWhere(`(COALESCE("sentAt", "createdAt") AT TIME ZONE '${SCHOOL_TIME_ZONE}')::date < :cutoff`, {
                cutoff: keptSince(today, MESSAGE_RETENTION_MONTHS),
            })
            .execute();
        return result.affected ?? 0;
    }

    /** E-mail confirmations and password resets whose link stopped working a month ago. */
    private async removeExpiredLinks(now: Date): Promise<number> {
        const cutoff = new Date(now.getTime() - EXPIRED_LINK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const [confirmations, resets] = await Promise.all([
            this.confirmations.delete({ expiresAt: LessThan(cutoff) }),
            this.passwordResets.delete({ expiresAt: LessThan(cutoff) }),
        ]);
        return (confirmations.affected ?? 0) + (resets.affected ?? 0);
    }

    /** No invoice, and nothing in force or waiting — what a trial booking leaves when it goes nowhere. */
    private async isShell(profileId: number): Promise<boolean> {
        const [invoiced, inForce, waiting] = await Promise.all([
            this.invoices.exists({ where: { parent: { id: profileId } } }),
            this.enrolmentsInForce([profileId]),
            this.openWaitlist([profileId]),
        ]);
        return !invoiced && (inForce.get(profileId) ?? 0) === 0 && (waiting.get(profileId) ?? 0) === 0;
    }

    /**
     * Whether a family on file vouches for the lead's address — then the lead is theirs.
     *
     * The query only finds the candidates; `claimsLead` decides, so this pass and the erasure that
     * would later take the lead cannot disagree about whose it is. A family that merely typed the
     * number would otherwise keep somebody else's enquiry past its term, and then — since the
     * erasure does not count it as theirs either — keep it for good.
     */
    private async answersToAFamily(lead: Lead): Promise<boolean> {
        const clauses = [
            ...(lead.parentEmail ? [{ email: lead.parentEmail, erasedAt: IsNull() }] : []),
            ...(lead.parentPhone ? [{ phone: lead.parentPhone, erasedAt: IsNull() }] : []),
        ];
        if (clauses.length === 0) return false;
        const candidates = await this.profiles.find({ where: clauses, relations: { user: true } });
        return candidates.some((family) => claimsLead(family, lead));
    }

    /** Enrolments in force per family, for the families asked about. */
    private async enrolmentsInForce(profileIds: number[]): Promise<Map<number, number>> {
        const rows = await this.enrollments
            .createQueryBuilder('enrollment')
            .innerJoin('enrollment.child', 'child')
            .select('child.parent_id', 'parentId')
            .addSelect('COUNT(*)', 'count')
            .andWhere('child.parent_id IN (:...profileIds)', { profileIds })
            .andWhere('enrollment.status IN (:...inForce)', { inForce: [...IN_FORCE_STATUSES] })
            .groupBy('child.parent_id')
            .getRawMany<{ parentId: number; count: string }>();
        return new Map(rows.map((row) => [Number(row.parentId), Number(row.count)]));
    }

    /** Invoices per family still on their way to SmartBill — the `fiscal_in_progress` hold. */
    private async invoicesOnTheirWayToSmartBill(profileIds: number[]): Promise<Map<number, number>> {
        const rows = await this.invoices
            .createQueryBuilder('invoice')
            .select('invoice.parent_id', 'parentId')
            .addSelect('COUNT(*)', 'count')
            .andWhere('invoice.parent_id IN (:...profileIds)', { profileIds })
            .andWhere('invoice.fiscalStatus IN (:...outstanding)', { outstanding: [...FISCAL_WORK_OUTSTANDING] })
            .groupBy('invoice.parent_id')
            .getRawMany<{ parentId: number; count: string }>();
        return new Map(rows.map((row) => [Number(row.parentId), Number(row.count)]));
    }

    /** Waiting-list places still open per family — waiting, or offered and not yet answered. */
    private async openWaitlist(profileIds: number[]): Promise<Map<number, number>> {
        const rows = await this.waitlist
            .createQueryBuilder('entry')
            .innerJoin('entry.child', 'child')
            .select('child.parent_id', 'parentId')
            .addSelect('COUNT(*)', 'count')
            .andWhere('child.parent_id IN (:...profileIds)', { profileIds })
            .andWhere('entry.status IN (:...open)', { open: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] })
            .groupBy('child.parent_id')
            .getRawMany<{ parentId: number; count: string }>();
        return new Map(rows.map((row) => [Number(row.parentId), Number(row.count)]));
    }
}
