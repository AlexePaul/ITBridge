import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SCHOOL_TIME_ZONE } from 'src/common/school-clock';
import { RetentionService } from './retention.service';

/**
 * 03:45 on the school's clock, when nobody is working — which matters more than it seems: an erasure
 * is one transaction per family, and the office's screens read the same rows. What it deletes lives
 * on in the daily backups for as long as they are kept, thirty days, which is what the privacy note
 * says in so many words; the order against the backup's own cron does not change that.
 */
const NIGHTLY_AT_03_45 = '45 3 * * *';

/**
 * The clock for E22/S3, and nothing else — the work is `RetentionService.run`, which the tests call
 * directly, like every other scheduled job in the codebase.
 *
 * Daily rather than monthly for the reason the timetable horizon is: the term is measured from a
 * day, so a pass once a month would keep a family up to a month past the promise, and a pass that
 * finds nothing due costs a few indexed reads.
 */
@Injectable()
export class RetentionJob {
    private readonly logger = new Logger('Retention');

    constructor(private readonly retention: RetentionService) {}

    /** `disabled` under `NODE_ENV=test`, like every `@Cron` here: jest builds the real `AppModule`. */
    @Cron(NIGHTLY_AT_03_45, {
        name: 'retention',
        timeZone: SCHOOL_TIME_ZONE,
        disabled: process.env.NODE_ENV === 'test',
    })
    async runScheduled(): Promise<void> {
        try {
            await this.retention.run();
        } catch (error: unknown) {
            // An unhandled rejection out of a timer callback takes the process down, and the outbox
            // dispatcher with it. Tomorrow's pass asks the same question; nothing is lost by waiting.
            this.logger.error(`The retention pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
