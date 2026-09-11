import { Test, TestingModule } from '@nestjs/testing';
import { ClassSessionService, DEFAULT_HORIZON_WEEKS } from './class-session.service';
import { TimetableHorizonJob } from './timetable-horizon.job';

/**
 * The job that keeps the eight-week horizon eight weeks deep.
 *
 * Everything it knows how to do belongs to `generateSessions`, so what is worth asserting is not the
 * writing — that has its own suite — but the *asking*: every active group, the full horizon, and a
 * failure that does not take the process down. The cron expression is not tested; it is a constant,
 * and a test of it would only restate it.
 */
describe('TimetableHorizonJob', () => {
    let job: TimetableHorizonJob;
    let classSessions: { generateSessions: jest.Mock };

    const summary = (over: Partial<{ groups: number; created: number; skipped: number }> = {}) => ({
        from: '2026-03-02',
        to: '2026-04-26',
        groups: 3,
        created: 0,
        existing: 24,
        skipped: 0,
        sessions: [],
        ...over,
    });

    beforeEach(async () => {
        classSessions = { generateSessions: jest.fn().mockResolvedValue(summary()) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [TimetableHorizonJob, { provide: ClassSessionService, useValue: classSessions }],
        }).compile();

        job = module.get(TimetableHorizonJob);
    });

    /**
     * The one that matters. Passing a `groupId` would top up a single group and let every other
     * timetable run out — and it would do it silently, because the pass would still report success.
     */
    it('asks for every active group, not one of them', async () => {
        await job.topUp();

        expect(classSessions.generateSessions).toHaveBeenCalledTimes(1);
        const dto = classSessions.generateSessions.mock.calls[0][0] as { groupId?: number; weeks?: number };
        expect(dto.groupId).toBeUndefined();
    });

    /**
     * The horizon is a promise about depth, so the job has to ask for the whole of it every time.
     * Asking for one week would keep the timetable one week deep, which is worse than not running:
     * it looks like the job is working.
     */
    it('asks for the full horizon, not a week of it', async () => {
        await job.topUp();

        const dto = classSessions.generateSessions.mock.calls[0][0] as { weeks?: number };
        expect(dto.weeks).toBe(DEFAULT_HORIZON_WEEKS);
    });

    /**
     * `generateSessions` defaults `from` to `startOfToday()`, which reads the server's local
     * components — so on a UTC host the job's own firing hour decides which day the horizon starts
     * on. It works at 04:30 by arithmetic alone; it would be a day short at 01:00. Naming the day
     * removes the dependency, and this is what stops somebody restoring the default.
     */
    it("starts the horizon on the school's day, not the server's", async () => {
        await job.topUp();

        const dto = classSessions.generateSessions.mock.calls[0][0] as { from?: string };
        const schoolToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
        expect(dto.from).toBe(schoolToday);
    });

    it('reports what it wrote', async () => {
        classSessions.generateSessions.mockResolvedValue(summary({ groups: 4, created: 6, skipped: 2 }));

        await expect(job.topUp()).resolves.toEqual({ groups: 4, created: 6, skipped: 2 });
    });

    /** The ordinary morning: everything is already there, so nothing is written and nothing is said. */
    it('writes nothing when the horizon is already full', async () => {
        await expect(job.topUp()).resolves.toMatchObject({ created: 0 });
    });

    /**
     * An unhandled rejection out of a timer callback ends the Node process, and this process is also
     * the outbox dispatcher — so a database blip during the top-up would stop every queued message
     * from going out. Swallowed and logged; tomorrow's pass writes whatever this one missed, because
     * generation is idempotent.
     */
    it('survives a failed pass rather than taking the process with it', async () => {
        classSessions.generateSessions.mockRejectedValue(new Error('connection terminated'));

        await expect(job.runScheduled()).resolves.toBeUndefined();
    });
});
