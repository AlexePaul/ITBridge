import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { Lead } from 'src/entities/lead.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { officeAddress } from 'src/modules/mail/office-address';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { schoolDay } from 'src/common/school-clock';
import { LeadService } from './lead.service';
import { composeNoShowFollowUp, composeOfficeDigest, composeTrialReminder, officeDigestIsEmpty, TrialDetails } from './lead-mail';

/**
 * The three things E20/S3 says have to happen without anybody remembering them.
 *
 * All three follow the shape this codebase settled on for scheduled work: the cron decides *when*
 * and nothing else, while the selection is a plain public method that takes the time as an argument.
 * A `@Cron` never fires under `NODE_ENV=test`, so a job whose logic lived inside the decorator would
 * be a job with no tests — see `unmarked-attendance.job.ts`, which learned this first.
 *
 * **Only one instance may run this.** Two PM2 workers would both wake and both compose the same
 * messages; `dedupeKey` turns the second into a refused insert rather than a second email, so the
 * failure mode is a wasted query. The single-instance pin belongs in the ecosystem file from
 * E01/S4, which does not exist yet.
 */

/** 09:00, school time — before the office starts ringing people. */
export const DIGEST_AT_NINE = '0 9 * * *';

/** 18:00, school time. Late enough to be tomorrow's reminder, early enough to be read. */
export const REMINDERS_AT_SIX = '0 18 * * *';

export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

export const DIGEST_PREFIX = 'lead-follow-up:';
export const TRIAL_REMINDER_PREFIX = 'trial-reminder:';
export const NO_SHOW_PREFIX = 'trial-no-show:';

@Injectable()
export class LeadRemindersJob {
    private readonly logger = new Logger('LeadReminders');

    constructor(
        @InjectRepository(Lead) private readonly leadRepository: Repository<Lead>,
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        private readonly leads: LeadService,
        private readonly outbox: OutboxService,
    ) {}

    @Cron(DIGEST_AT_NINE, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async sendDigest(): Promise<void> {
        await this.digestFor(new Date());
    }

    @Cron(REMINDERS_AT_SIX, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async sendTrialReminders(): Promise<void> {
        await this.remindTrialsOn(new Date());
        await this.followUpNoShows(new Date());
    }

    /**
     * One message a day to the office, or none at all — E20/S3.
     *
     * Nothing to say means nothing sent. A reminder that arrives on the quiet days too is a reminder
     * people filter, and then it is not there on the day it mattered; the daily attendance reminder
     * made the same choice for the same reason.
     */
    async digestFor(now: Date): Promise<{ sent: boolean; counts: { undecided: number; noSeats: number; stale: number; unassigned: number } }> {
        const followUp = await this.leads.followUp(now);
        const digest = {
            undecided: followUp.undecided.map(({ lead, days }) => ({ id: lead.id, parentName: lead.parentName, childFirstName: lead.childFirstName, days })),
            noSeats: followUp.noSeats.map(({ lead, days }) => ({ id: lead.id, parentName: lead.parentName, childFirstName: lead.childFirstName, days })),
            stale: followUp.stale.map(({ lead, days }) => ({
                id: lead.id,
                parentName: lead.parentName,
                childFirstName: lead.childFirstName,
                days,
                status: lead.status,
            })),
            unassigned: followUp.unassigned,
        };

        const counts = { undecided: digest.undecided.length, noSeats: digest.noSeats.length, stale: digest.stale.length, unassigned: digest.unassigned };
        if (officeDigestIsEmpty(digest)) {
            return { sent: false, counts };
        }

        await this.outbox.queue({ to: officeAddress(), ...composeOfficeDigest(digest), dedupeKey: `${DIGEST_PREFIX}${schoolDay(now)}` });
        this.logger.log(`Lead follow-up digest queued for ${schoolDay(now)}.`);
        return { sent: true, counts };
    }

    /**
     * Tomorrow's trials, reminded today — E20/S3, and not a refinement.
     *
     * The epic is blunt about it: without a reminder, no-shows at a **free** trial run to a third.
     * The seat is real, so a family who has forgotten costs the school a chair somebody else would
     * have sat in.
     */
    async remindTrialsOn(now: Date): Promise<number> {
        const tomorrow = toIsoDate(addDays(parseIsoDate(schoolDay(now)), 1));
        const leads = await this.leadRepository.find({
            where: { status: LeadStatus.TRIAL_SCHEDULED },
            relations: { trialSession: { group: { room: { location: true } } } },
        });

        let queued = 0;
        for (const lead of leads) {
            const session = lead.trialSession;
            if (!session || session.status !== ClassSessionStatus.SCHEDULED) continue;
            if (toIsoDate(new Date(session.date)) !== tomorrow) continue;

            await this.outbox.queueOrRecord(
                { email: lead.parentEmail },
                { ...composeTrialReminder(detailsOf(lead)), dedupeKey: `${TRIAL_REMINDER_PREFIX}${lead.id}` },
            );
            queued += 1;
        }
        return queued;
    }

    /**
     * The class happened and the child was not there — E20/S3's "recontacted automatically".
     *
     * **An unmarked register is not an absence.** The check needs the session to have been marked at
     * all before it concludes anything: if nobody took the register that afternoon, telling a family
     * they missed a class they may well have attended is worse than saying nothing, and the
     * unmarked-register reminders in E12/S7 already chase the other half of that problem.
     */
    async followUpNoShows(now: Date): Promise<number> {
        const today = schoolDay(now);
        const leads = await this.leads.awaitingNoShowFollowUp();

        let queued = 0;
        for (const lead of leads) {
            const session = lead.trialSession;
            if (!session || !lead.child) continue;
            if (toIsoDate(new Date(session.date)) >= today) continue;
            if (session.status === ClassSessionStatus.CANCELLED) continue;

            const marked = await this.attendanceRepository.count({ where: { classSession: { id: session.id } } });
            if (marked === 0) continue;

            const attended = await this.attendanceRepository.count({
                where: { classSession: { id: session.id }, child: { id: lead.child.id }, present: true },
            });
            if (attended > 0) continue;

            await this.outbox.queueOrRecord(
                { email: lead.parentEmail },
                { ...composeNoShowFollowUp(detailsOf(lead)), dedupeKey: `${NO_SHOW_PREFIX}${lead.id}` },
            );
            queued += 1;
        }
        return queued;
    }
}

/** What the messages need out of a lead, once its session is loaded. */
function detailsOf(lead: Lead): TrialDetails {
    const session = lead.trialSession;
    const location = session?.group?.room?.location;
    return {
        childFirstName: lead.childFirstName,
        groupName: session?.group?.name ?? '',
        locationName: location?.name ?? '',
        address: location ? `${location.street}, ${location.city}` : '',
        date: session ? toIsoDate(new Date(session.date)) : '',
        startTime: session?.startTime ?? '',
    };
}
