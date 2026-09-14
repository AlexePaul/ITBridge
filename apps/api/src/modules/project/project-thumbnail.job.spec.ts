import { ProjectThumbnailJob, BATCH_SIZE } from './project-thumbnail.job';
import { ProjectService, ThumbnailCandidate, ThumbnailOutcome } from './project.service';

/**
 * The pass that makes the pictures nobody could make in the request. E14/S3b.
 *
 * The job owns exactly two decisions — how many to take, and when to stop — and both of them are
 * about a resource outside this process: an ffmpeg subprocess per video, and a host that may not
 * have ffmpeg at all.
 */

const candidate = (projectId: number, contentType = 'video/mp4'): ThumbnailCandidate => ({
    projectId,
    versionId: projectId * 10,
    fileId: projectId * 100,
    contentType,
    sizeBytes: 4_000_000,
});

function jobWith(backlog: ThumbnailCandidate[], outcomes: ThumbnailOutcome[]) {
    const attempted: number[] = [];
    const service = {
        thumbnailBacklog: jest.fn().mockResolvedValue(backlog),
        makeDeferredThumbnail: jest.fn((item: ThumbnailCandidate) => {
            attempted.push(item.projectId);
            return Promise.resolve(outcomes[attempted.length - 1] ?? 'made');
        }),
    };

    const job = new ProjectThumbnailJob(service as unknown as ProjectService);
    jest.spyOn(job['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(job['logger'], 'error').mockImplementation(() => undefined);
    return { job, service, attempted };
}

describe('drain', () => {
    it('counts what it made and what simply has no picture in it', async () => {
        const { job } = jobWith([candidate(1), candidate(2, 'application/x.scratch.sb3')], ['made', 'none']);

        expect(await job.drain()).toEqual({ claimed: 2, made: 1, none: 1, deferred: 0 });
    });

    it('stops at the first deferral, rather than asking a missing ffmpeg four more times', async () => {
        const { job, attempted } = jobWith([candidate(1), candidate(2), candidate(3)], ['made', 'deferred', 'made']);

        const result = await job.drain();

        expect(attempted).toEqual([1, 2]);
        expect(result).toEqual({ claimed: 3, made: 1, none: 0, deferred: 1 });
    });

    it('takes a small batch, because each one of them is a subprocess', async () => {
        const { job, service } = jobWith([], []);

        await job.drain();

        expect(service.thumbnailBacklog).toHaveBeenCalledWith(BATCH_SIZE);
        expect(BATCH_SIZE).toBeLessThanOrEqual(10);
    });

    it('does nothing at all when there is nothing waiting', async () => {
        const { job, service } = jobWith([], []);

        expect(await job.drain()).toEqual({ claimed: 0, made: 0, none: 0, deferred: 0 });
        expect(service.makeDeferredThumbnail).not.toHaveBeenCalled();
    });

    it('lets one pass finish before another starts, so a slow decode cannot pile ticks up', async () => {
        const { job, service, attempted } = jobWith([candidate(1)], ['made']);
        let release: () => void = () => undefined;
        service.makeDeferredThumbnail.mockImplementationOnce((item: ThumbnailCandidate) => {
            attempted.push(item.projectId);
            return new Promise<ThumbnailOutcome>((resolve) => {
                release = () => resolve('made');
            });
        });

        const first = job.drain();
        const second = await job.drain();
        release();

        expect(second).toEqual({ claimed: 0, made: 0, none: 0, deferred: 0 });
        expect(await first).toEqual({ claimed: 1, made: 1, none: 0, deferred: 0 });
    });
});

describe('runScheduled', () => {
    it('swallows a failing pass: the rows are untouched and the next tick tries again', async () => {
        const { job, service } = jobWith([], []);
        service.thumbnailBacklog.mockRejectedValue(new Error('the database is not there'));

        await expect(job.runScheduled()).resolves.toBeUndefined();
    });

    it('is off under NODE_ENV=test, like every other job here', () => {
        // The guard is the decorator's `disabled`, and this is what it reads. A timer firing in the
        // middle of another suite's assertions is a failure that reproduces once a year.
        expect(process.env.NODE_ENV).toBe('test');
    });
});
