import { Test, TestingModule } from '@nestjs/testing';
import { EarlySignalsJob, SIGNALS_DIGEST_PREFIX } from './early-signals.job';
import { EarlySignals, EarlySignalsService } from './early-signals.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { composeSignalsDigest } from './signals-mail';

/**
 * The Monday digest — E21/S7. What is held: silence when there is nothing to say, one message per
 * school day otherwise, and the wording of the message itself.
 */
describe('EarlySignalsJob', () => {
    let job: EarlySignalsJob;
    let signals: { build: jest.Mock };
    let outbox: { queue: jest.Mock };

    const empty = (): EarlySignals => ({
        asOf: '2026-03-30',
        lookbackFrom: '2025-12-30',
        generatedOn: '2026-03-30',
        thresholds: {
            childAbsenceStreak: 3,
            staleStreakAfterDays: 21,
            groupAttendanceWindow: 3,
            groupAttendanceDrop: 0.2,
            familyOverdueInvoices: 2,
            occupancy: 0.6,
        },
        children: [],
        groups: [],
        families: [],
        underfilled: [],
        totals: { children: 0, groups: 0, families: 0, underfilled: 0, all: 0 },
        basis: { marksRead: 0, childrenWithMarks: 0, sessionsWithRegister: 0, groupsWithHistory: 0, occupancyAsOfToday: true },
    });

    const busy = (): EarlySignals => {
        const base = empty();
        return {
            ...base,
            children: [
                {
                    childId: 100,
                    childName: 'Ana Pop',
                    groupId: 7,
                    groupName: 'Scratch',
                    parentId: 20,
                    parentName: 'Maria Pop',
                    phone: '+40700000001',
                    email: null,
                    streak: 3,
                    since: '2026-03-09',
                    lastMarkOn: '2026-03-23',
                    announced: 1,
                },
            ],
            groups: [
                {
                    groupId: 8,
                    groupName: 'Python',
                    locationName: 'Drumul Taberei',
                    recentRate: 0.33,
                    previousRate: 0.92,
                    drop: 0.59,
                    sessions: 6,
                    lastSessionOn: '2026-03-23',
                },
            ],
            families: [{ parentId: 21, parentName: 'Ion Ion', email: null, phone: null, invoices: 2, outstanding: 700, oldestDaysOverdue: 45 }],
            underfilled: [{ groupId: 9, groupName: 'Robotică', locationName: 'Străulești', taken: 4, capacity: 10, free: 6, waiting: 0, fillRate: 0.4 }],
            totals: { children: 1, groups: 1, families: 1, underfilled: 1, all: 4 },
        };
    };

    // A Monday, 08:00 in Bucharest.
    const MONDAY = new Date('2026-03-30T05:00:00Z');

    beforeEach(async () => {
        signals = { build: jest.fn().mockResolvedValue(empty()) };
        outbox = { queue: jest.fn().mockResolvedValue({ id: 5 }) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [EarlySignalsJob, { provide: EarlySignalsService, useValue: signals }, { provide: OutboxService, useValue: outbox }],
        }).compile();
        job = module.get(EarlySignalsJob);
    });

    it('says nothing on a week with nothing to flag', async () => {
        const result = await job.digestFor(MONDAY);

        expect(result).toEqual({ asOf: '2026-03-30', queued: false, all: 0 });
        expect(outbox.queue).not.toHaveBeenCalled();
    });

    it('queues one message to the office, keyed on the school day', async () => {
        signals.build.mockResolvedValue(busy());

        const result = await job.digestFor(MONDAY);

        expect(result).toEqual({ asOf: '2026-03-30', queued: true, all: 4 });
        expect(signals.build).toHaveBeenCalledWith(MONDAY);
        expect(outbox.queue).toHaveBeenCalledTimes(1);
        const queued = outbox.queue.mock.calls[0][0] as { to: string; subject: string; dedupeKey: string };
        expect(queued.to).toBe('office@itbridgeschool.com');
        expect(queued.dedupeKey).toBe(`${SIGNALS_DIGEST_PREFIX}2026-03-30`);
    });

    it('reports a refused duplicate as not queued, without failing', async () => {
        signals.build.mockResolvedValue(busy());
        outbox.queue.mockResolvedValue(null);

        const result = await job.digestFor(MONDAY);

        expect(result).toEqual({ asOf: '2026-03-30', queued: false, all: 4 });
    });

    describe('the wording', () => {
        it('names every list with its count in the subject, and only the lists that have something', () => {
            const { subject } = composeSignalsDigest(busy());

            expect(subject).toBe('Semnale timpurii, 30.03.2026: 1 copil, 1 grupă, 1 familie, 1 grupă sub prag');
            expect(composeSignalsDigest({ ...busy(), children: [], totals: { children: 0, groups: 1, families: 1, underfilled: 1, all: 3 } }).subject).toBe(
                'Semnale timpurii, 30.03.2026: 1 grupă, 1 familie, 1 grupă sub prag',
            );
        });

        it('says, for each child, how long, since when, how much was announced, and whom to ring', () => {
            const { bodyText } = composeSignalsDigest(busy());

            expect(bodyText).toContain('Copii care au lipsit de 3 ori la rând sau mai mult (1):');
            expect(bodyText).toContain('- Ana Pop (Scratch) — 3 absențe din 09.03.2026, 1 anunțată · Maria Pop, +40700000001');
        });

        it('says how far a group fell, and what a family owes', () => {
            const { bodyText } = composeSignalsDigest(busy());

            expect(bodyText).toContain('- Python (Drumul Taberei) — de la 92% la 33% pe ultimele 3 ședințe');
            expect(bodyText).toContain('- Ion Ion — 2 facturi, 700 lei, cea mai veche de 45 zile');
            expect(bodyText).toContain('- Robotică (Străulești) — 4 din 10 locuri (40%)');
            expect(bodyText).toContain('/admin/rapoarte?tab=semnale');
        });

        it('leaves out an empty section rather than printing a heading with nothing under it', () => {
            const { bodyText } = composeSignalsDigest({
                ...busy(),
                families: [],
                underfilled: [],
                totals: { children: 1, groups: 1, families: 0, underfilled: 0, all: 2 },
            });

            expect(bodyText).not.toContain('facturi restante');
            expect(bodyText).not.toContain('pragul de ocupare');
        });
    });
});
