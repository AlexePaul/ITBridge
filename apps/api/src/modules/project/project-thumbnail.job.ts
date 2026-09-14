import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProjectService, ThumbnailOutcome } from './project.service';

/**
 * The pictures that cannot be made in the request that uploads. E14/S3b.
 *
 * Two kinds of file arrive without one: a video, whose bytes go straight to the bucket through a
 * signed URL and never pass through this process at all, and a `.sb3`, which costs a ZIP and up to
 * two dozen composites. S3b is explicit that the extraction belongs in a queued job rather than in
 * the request — a synchronous one would hold the event loop on every upload, and the upload is what
 * a teacher is waiting on at the end of a class.
 *
 * **The queue is `ProjectService.thumbnailBacklog`, not a table.** "No thumbnail, and nobody has
 * tried" is a question the two columns on `projects` already answer; a rows-to-process table beside
 * them would be a second answer that drifts from the first the moment a project is deleted.
 *
 * **The cron decides when, the service decides what** — the same split as every other job here, so
 * `drain()` can be driven directly by a test at any hour.
 *
 * **This must run in exactly one instance.** Two PM2 cluster workers would both wake on the tick and
 * both start on the same oldest project; the second's work would be thrown away rather than doubled
 * — the outcome is one thumbnail either way — but it would be an ffmpeg subprocess for nothing. The
 * pin is `instances: 1` plus `exec_mode: 'fork'` in `/srv/itbridge/ecosystem.config.js` on the
 * instance, which is not in this repository.
 */

/** Every five minutes, the cadence of `late-register.job.ts`. An admin reviews a group hours later, not seconds. */
export const EVERY_FIVE_MINUTES = '*/5 * * * *';

/**
 * How many projects one pass takes on.
 *
 * Small on purpose. Each of these is an ffmpeg subprocess or a stack of composites, and the process
 * doing it is also serving the group screen the admin is looking at. A class that uploads thirty
 * videos at once is drained over the following half hour instead of stalling one tick for all of it.
 */
export const BATCH_SIZE = 5;

export interface ThumbnailDrainResult {
    /**
     * How many projects the pass actually took on — not how many were waiting.
     *
     * The two differ whenever a deferral ends the pass early, and the smaller number is the honest
     * one: the projects behind the deferral were never looked at, and a log line that counted them
     * would report work nobody did.
     */
    attempted: number;
    made: number;
    /** Asked and answered no: a video with no readable frame, a `.sb3` with an empty stage. */
    none: number;
    /** Nothing was decided — no ffmpeg on the host, or the object could not be read. Tried again next tick. */
    deferred: number;
}

@Injectable()
export class ProjectThumbnailJob {
    private readonly logger = new Logger('ProjectThumbnails');

    /** One pass at a time. A slow decode must not let ticks pile up on top of each other. */
    private running = false;

    constructor(private readonly projectService: ProjectService) {}

    @Cron(EVERY_FIVE_MINUTES, {
        name: 'project-thumbnails',
        disabled: process.env.NODE_ENV === 'test',
    })
    async runScheduled(): Promise<void> {
        try {
            await this.drain();
        } catch (error: unknown) {
            // A pass that throws is a database or bucket problem, not a picture problem. The rows are
            // untouched and the next tick tries again; what must not happen is an unhandled rejection
            // taking the process down and with it the queue, the timetable job and the outbox.
            this.logger.error(`Thumbnail pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async drain(): Promise<ThumbnailDrainResult> {
        const result: ThumbnailDrainResult = { attempted: 0, made: 0, none: 0, deferred: 0 };
        if (this.running) return result;

        this.running = true;
        try {
            const backlog = await this.projectService.thumbnailBacklog(BATCH_SIZE);

            for (const candidate of backlog) {
                const outcome: ThumbnailOutcome = await this.projectService.makeDeferredThumbnail(candidate);
                result.attempted++;
                if (outcome === 'made') result.made++;
                else if (outcome === 'none') result.none++;
                else result.deferred++;

                // The first deferral ends the pass. Every candidate left is about to meet the same
                // missing ffmpeg or the same unreachable bucket, and finding that out four more times
                // costs four more downloads to say the same thing.
                if (outcome === 'deferred') break;
            }

            // Silent when there was nothing to do, which is most ticks — a line every five minutes
            // saying "nothing happened" is how a log stops being read.
            if (result.attempted > 0) {
                this.logger.log(`Thumbnails: ${result.made} made, ${result.none} without one, ${result.deferred} left for later.`);
            }
        } finally {
            this.running = false;
        }

        return result;
    }
}
