import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Lead } from 'src/entities/lead.entity';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { createMockEntityManager, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { LeadProgressService } from './lead-progress.service';

/**
 * The lead following the facts — E20/S1 and S3.
 *
 * Every assertion here is about the `where` clause rather than the value written, because the `where`
 * is the rule: which leads may move, and which are already past the point where the register or an
 * enrolment has anything to say about them.
 */
describe('LeadProgressService', () => {
    let service: LeadProgressService;
    let leadRepo: MockRepository<Lead>;
    const now = new Date('2026-03-17T15:30:00Z');

    beforeEach(async () => {
        leadRepo = createMockRepository<Lead>();
        leadRepo.update?.mockResolvedValue({ affected: 1 });
        const module: TestingModule = await Test.createTestingModule({
            providers: [LeadProgressService, provideMockRepository(Lead, leadRepo)],
        }).compile();
        service = module.get(LeadProgressService);
    });

    describe('a trial held', () => {
        const booked = { id: 42, date: '2026-03-17', startTime: '17:00:00' };
        let sessionRepo: MockRepository<ClassSession>;
        let manager: ReturnType<typeof createMockEntityManager>;

        beforeEach(() => {
            sessionRepo = createMockRepository<ClassSession>();
            manager = createMockEntityManager(
                new Map<unknown, MockRepository>([
                    [Lead, leadRepo],
                    [ClassSession, sessionRepo],
                ]),
            );
            leadRepo.find?.mockResolvedValue([{ id: 9, status: LeadStatus.TRIAL_SCHEDULED, trialSession: booked }]);
        });

        it('moves only a lead still waiting for its trial, for that child in that group', async () => {
            sessionRepo.findOne?.mockResolvedValue({ ...booked, group: { id: 3 } });

            await service.markTrialHeld(4, 42, now, manager as unknown as EntityManager);

            expect(leadRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { child: { id: 4 }, group: { id: 3 }, status: LeadStatus.TRIAL_SCHEDULED } }),
            );
            expect(leadRepo.update).toHaveBeenCalledWith(
                { id: 9, status: LeadStatus.TRIAL_SCHEDULED },
                expect.objectContaining({ status: LeadStatus.TRIAL_HELD, trialHeldAt: now, lastActivityAt: now, trialSession: { id: 42 } }),
            );
        });

        /**
         * The review of 25 September 2026: the no-show message invites the family to another class,
         * and the trial sits in every class of the group until it is decided — so a child who came
         * the week after was a trial held that the funnel never counted.
         */
        it('counts a later class of the group, and takes it as the class the trial was held at', async () => {
            sessionRepo.findOne?.mockResolvedValue({ id: 50, date: '2026-03-24', startTime: '17:00:00', group: { id: 3 } });

            await service.markTrialHeld(4, 50, now, manager as unknown as EntityManager);

            expect(leadRepo.update).toHaveBeenCalledWith(
                { id: 9, status: LeadStatus.TRIAL_SCHEDULED },
                expect.objectContaining({ status: LeadStatus.TRIAL_HELD, trialSession: { id: 50 } }),
            );
        });

        it('does not count a class before the booked one', async () => {
            sessionRepo.findOne?.mockResolvedValue({ id: 30, date: '2026-03-10', startTime: '17:00:00', group: { id: 3 } });

            await service.markTrialHeld(4, 30, now, manager as unknown as EntityManager);

            expect(leadRepo.update).not.toHaveBeenCalled();
        });
    });

    it('puts a mistapped mark back, the way a mistapped make-up credit is revoked', async () => {
        await service.revertTrialHeld(4, 42);

        expect(leadRepo.update).toHaveBeenCalledWith(
            { child: { id: 4 }, trialSession: { id: 42 }, status: LeadStatus.TRIAL_HELD },
            expect.objectContaining({ status: LeadStatus.TRIAL_SCHEDULED, trialHeldAt: null }),
        );
    });

    it('records an enrolment as the decision, with the moment it was made', async () => {
        await service.settleForEnrollment(11, { enrolled: true }, now);

        const [, changes] = leadRepo.update?.mock.calls[0] as [unknown, Record<string, unknown>];
        expect(changes).toMatchObject({ status: LeadStatus.ENROLLED, lostReason: null, decidedAt: now });
    });

    it('records a closed trial as lost, carrying the reason the admin gave', async () => {
        await service.settleForEnrollment(11, { enrolled: false, reason: 'Nu i-a plăcut' }, now);

        const [, changes] = leadRepo.update?.mock.calls[0] as [unknown, Record<string, unknown>];
        expect(changes).toMatchObject({ status: LeadStatus.LOST, lostReason: 'Nu i-a plăcut' });
    });

    it('never overwrites a decision already made — a late register correction must not reopen it', async () => {
        await service.settleForEnrollment(11, { enrolled: true }, now);

        const [where] = leadRepo.update?.mock.calls[0] as [{ status: { _value?: unknown } }, unknown];
        // The `In(...)` excludes `enrolled` and `lost`, which is what makes this idempotent.
        expect(JSON.stringify(where)).not.toContain(LeadStatus.ENROLLED);
    });

    /** The review of 25 September 2026: a trial moved to another group took nothing of its lead along. */
    describe('a trial that moves group', () => {
        let sessionRepo: MockRepository<ClassSession>;
        let manager: ReturnType<typeof createMockEntityManager>;
        const follow = () => service.followTransfer(9, { enrollmentId: 12, groupId: 5 }, now, manager as unknown as EntityManager);

        beforeEach(() => {
            sessionRepo = createMockRepository<ClassSession>();
            manager = createMockEntityManager(
                new Map<unknown, MockRepository>([
                    [Lead, leadRepo],
                    [ClassSession, sessionRepo],
                ]),
            );
            leadRepo.count?.mockResolvedValue(1);
        });

        it('points the lead at the new enrolment and the new group, so the decision on it settles the lead', async () => {
            sessionRepo.find?.mockResolvedValue([]);

            await follow();

            expect(leadRepo.update).toHaveBeenCalledWith(
                { enrollment: { id: 9 } },
                expect.objectContaining({ enrollment: { id: 12 }, group: { id: 5 }, lastActivityAt: now }),
            );
        });

        // `now` is 17:30 in Bucharest on the 17th: that day's 17:00 class has started.
        it('gives a trial still ahead the new group’s next class that has not started', async () => {
            sessionRepo.find?.mockResolvedValue([
                { id: 40, date: '2026-03-17', startTime: '17:00:00' },
                { id: 41, date: '2026-03-19', startTime: '10:00:00' },
            ]);

            await follow();

            expect(leadRepo.update).toHaveBeenCalledWith({ enrollment: { id: 9 }, status: LeadStatus.TRIAL_SCHEDULED }, { trialSession: { id: 41 } });
        });

        it('leaves a trial with no class when the new group has none ahead', async () => {
            sessionRepo.find?.mockResolvedValue([]);

            await follow();

            expect(leadRepo.update).toHaveBeenCalledWith({ enrollment: { id: 9 }, status: LeadStatus.TRIAL_SCHEDULED }, { trialSession: null });
        });

        it('keeps the class of a trial already held — that is where it was held', async () => {
            leadRepo.count?.mockResolvedValue(0);

            await follow();

            expect(sessionRepo.find).not.toHaveBeenCalled();
            expect(leadRepo.update).toHaveBeenCalledTimes(1);
            expect(leadRepo.update).toHaveBeenCalledWith({ enrollment: { id: 9 } }, expect.not.objectContaining({ trialSession: expect.anything() }));
        });
    });
});
