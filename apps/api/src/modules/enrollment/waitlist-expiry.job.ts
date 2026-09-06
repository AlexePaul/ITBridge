import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EnrollmentService } from './enrollment.service';

/**
 * The sweeper the waiting list was missing — E11/S3.
 *
 * `WaitlistEntry.respondBy` has always been in the offer mail, so families were told there was a
 * clock. Nothing was watching it: an offer nobody answered kept its seat indefinitely, and the next
 * family on the list was never asked. The entity said as much in a comment, deferring the sweeper
 * until "anything actually runs" — but every other scheduled thing in this codebase is already
 * written and waiting on the same deploy (E01/S4), and being written is what makes it testable.
 *
 * **Hourly, not by the minute.** The window is 48 hours; an offer that lapses at 14:03 and is swept
 * at 15:00 costs the next family fifty-seven minutes of a two-day clock. Checking every minute
 * would buy nothing and put sixty times the queries behind it.
 *
 * **The selection is not here.** `EnrollmentService.expireLapsedOffers` does the work and this
 * decides only the hour — `@Cron` never fires under `NODE_ENV=test`, so logic living inside one
 * would be logic no test could reach.
 *
 * **One instance only**, like the rest: two would both sweep the same entry, and the second would
 * find nothing to do rather than double-offering, but the mail for the next family is not deduped.
 * The fix belongs to the ecosystem file in E01/S4, with the other schedulers.
 */

/** Every hour, on the hour, on the school's clock. */
export const HOURLY = '0 * * * *';
export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

@Injectable()
export class WaitlistExpiryJob {
    private readonly logger = new Logger('WaitlistExpiryJob');

    constructor(private readonly enrollments: EnrollmentService) {}

    @Cron(HOURLY, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async run(): Promise<void> {
        const { expired } = await this.enrollments.expireLapsedOffers();
        if (expired > 0) {
            this.logger.log(`Swept ${expired} lapsed waitlist offer(s).`);
        }
    }
}
