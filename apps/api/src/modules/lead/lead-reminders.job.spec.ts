import { Test, TestingModule } from '@nestjs/testing';
import { Attendance } from 'src/entities/attendance.entity';
import { Lead } from 'src/entities/lead.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { LeadRemindersJob, NO_SHOW_PREFIX, TRIAL_REMINDER_PREFIX } from './lead-reminders.job';
import { LeadService } from './lead.service';

/**
 * The three reminders — E20/S3.
 *
 * A `@Cron` never fires under `NODE_ENV=test`, so every case here calls the plain method the cron
 * would have called. That separation is the reason these can be tested at all, and it is the
 * convention `unmarked-attendance.job.ts` established.
 */
describe('LeadRemindersJob', () => {
    let job: LeadRemindersJob;
    let leadRepo: MockRepository<Lead>;
    let attendanceRepo: MockRepository<Attendance>;
    let leads: { followUp: jest.Mock; awaitingNoShowFollowUp: jest.Mock };
    let outbox: { queue: jest.Mock; queueOrRecord: jest.Mock };

    const now = new Date('2026-03-16T18:00:00Z');

    const session = (overrides: Record<string, unknown> = {}) => ({
        id: 42,
        date: '2026-03-17',
        startTime: '17:00:00',
        status: ClassSessionStatus.SCHEDULED,
        group: { name: 'Scratch Începători', room: { location: { name: 'Titan', street: 'Strada Rotundă 12', city: 'București' } } },
        ...overrides,
    });

    const emptyFollowUp = { stale: [], undecided: [], noSeats: [], due: [], unassigned: 0 };

    beforeEach(async () => {
        leadRepo = createMockRepository<Lead>();
        attendanceRepo = createMockRepository<Attendance>();
        leads = { followUp: jest.fn().mockResolvedValue(emptyFollowUp), awaitingNoShowFollowUp: jest.fn().mockResolvedValue([]) };
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LeadRemindersJob,
                provideMockRepository(Lead, leadRepo),
                provideMockRepository(Attendance, attendanceRepo),
                { provide: LeadService, useValue: leads },
                { provide: OutboxService, useValue: outbox },
            ],
        }).compile();

        job = module.get(LeadRemindersJob);
    });

    describe('the daily message to the office', () => {
        it('sends nothing on a quiet day, so it is still read on a loud one', async () => {
            const result = await job.digestFor(now);

            expect(result.sent).toBe(false);
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('sends one message, keyed on the day, so a restart does not send a second', async () => {
            leads.followUp.mockResolvedValue({ ...emptyFollowUp, unassigned: 2 });

            await job.digestFor(now);

            expect(outbox.queue).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'lead-follow-up:2026-03-16' }));
        });
    });

    describe('the reminder the day before', () => {
        it('reminds a family whose trial is tomorrow', async () => {
            leadRepo.find?.mockResolvedValue([
                {
                    id: 9,
                    status: LeadStatus.TRIAL_SCHEDULED,
                    parentEmail: 'ioana@example.com',
                    childFirstName: 'Matei',
                    trialSession: session(),
                },
            ]);

            expect(await job.remindTrialsOn(now)).toBe(1);
            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                { email: 'ioana@example.com' },
                expect.objectContaining({ dedupeKey: `${TRIAL_REMINDER_PREFIX}9` }),
            );
        });

        it('leaves alone a trial that is next week, and one that has been cancelled', async () => {
            leadRepo.find?.mockResolvedValue([
                {
                    id: 9,
                    status: LeadStatus.TRIAL_SCHEDULED,
                    parentEmail: 'a@example.com',
                    childFirstName: 'Matei',
                    trialSession: session({ date: '2026-03-24' }),
                },
                {
                    id: 10,
                    status: LeadStatus.TRIAL_SCHEDULED,
                    parentEmail: 'b@example.com',
                    childFirstName: 'Ana',
                    trialSession: session({ status: ClassSessionStatus.CANCELLED }),
                },
            ]);

            expect(await job.remindTrialsOn(now)).toBe(0);
        });
    });

    describe('the no-show follow-up', () => {
        const missed = {
            id: 9,
            status: LeadStatus.TRIAL_SCHEDULED,
            parentEmail: 'ioana@example.com',
            childFirstName: 'Matei',
            child: { id: 4 },
            trialSession: session({ date: '2026-03-10' }),
        } as unknown as Lead;

        it('writes to a family whose class was marked and who was not in it', async () => {
            leads.awaitingNoShowFollowUp.mockResolvedValue([missed]);
            attendanceRepo.count?.mockResolvedValueOnce(8).mockResolvedValueOnce(0);

            expect(await job.followUpNoShows(now)).toBe(1);
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'ioana@example.com' }, expect.objectContaining({ dedupeKey: `${NO_SHOW_PREFIX}9` }));
        });

        it('says nothing when nobody took the register — an unmarked class is not an absence', async () => {
            // Telling a family they missed a class they may well have attended is worse than saying
            // nothing; the unmarked register is chased separately, in E12/S7.
            leads.awaitingNoShowFollowUp.mockResolvedValue([missed]);
            attendanceRepo.count?.mockResolvedValue(0);

            expect(await job.followUpNoShows(now)).toBe(0);
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('says nothing to a family who came', async () => {
            leads.awaitingNoShowFollowUp.mockResolvedValue([missed]);
            attendanceRepo.count?.mockResolvedValueOnce(8).mockResolvedValueOnce(1);

            expect(await job.followUpNoShows(now)).toBe(0);
        });

        it('says nothing about a class that has not happened yet', async () => {
            leads.awaitingNoShowFollowUp.mockResolvedValue([{ ...missed, trialSession: session({ date: '2026-03-20' }) }]);

            expect(await job.followUpNoShows(now)).toBe(0);
        });
    });
});
