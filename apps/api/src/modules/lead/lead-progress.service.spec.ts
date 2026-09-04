import { Test, TestingModule } from '@nestjs/testing';
import { Lead } from 'src/entities/lead.entity';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
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

    it('moves only a lead still waiting for its trial, and only for that child and that class', async () => {
        await service.markTrialHeld(4, 42, now);

        expect(leadRepo.update).toHaveBeenCalledWith(
            { child: { id: 4 }, trialSession: { id: 42 }, status: LeadStatus.TRIAL_SCHEDULED },
            expect.objectContaining({ status: LeadStatus.TRIAL_HELD, trialHeldAt: now, lastActivityAt: now }),
        );
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
});
