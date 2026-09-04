import { Test, TestingModule } from '@nestjs/testing';
import { Lead } from 'src/entities/lead.entity';
import { LeadChannel, LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { hasReached, LeadFunnelService } from './lead-funnel.service';

/**
 * The funnel — E20/S4.
 *
 * The behaviour worth pinning is that a funnel counts **passage, not occupancy**: a family who came
 * to a trial and then enrolled has been through „probă ținută", and a report that dropped them from
 * that line the moment they enrolled would fall exactly as the school got better at its job.
 */
describe('LeadFunnelService', () => {
    let service: LeadFunnelService;
    let leadRepo: MockRepository<Lead>;

    /**
     * A `date` column comes back from the driver as a string, not a `Date`, which is what these
     * fixtures imitate — so the overrides are looser than the entity's own types.
     */
    const lead = (overrides: Partial<Record<keyof Lead, unknown>> = {}): Lead =>
        ({
            id: 1,
            status: LeadStatus.NEW,
            source: LeadSource.TRIAL_FORM,
            channel: null,
            noSeats: false,
            childBirthDate: '2016-04-04',
            trialSession: null,
            enrollment: null,
            trialHeldAt: null,
            decidedAt: null,
            location: null,
            ...overrides,
        }) as Lead;

    beforeEach(async () => {
        leadRepo = createMockRepository<Lead>();
        const module: TestingModule = await Test.createTestingModule({
            providers: [LeadFunnelService, provideMockRepository(Lead, leadRepo)],
        }).compile();
        service = module.get(LeadFunnelService);
    });

    const range = { from: '2026-01-01', to: '2026-03-31' };

    describe('hasReached', () => {
        it('counts an enrolled family in every stage they passed through', () => {
            const enrolled = lead({
                status: LeadStatus.ENROLLED,
                trialHeldAt: new Date('2026-03-01T15:00:00Z'),
                trialSession: { id: 4 },
            });

            expect(hasReached(enrolled, LeadStatus.TRIAL_SCHEDULED)).toBe(true);
            expect(hasReached(enrolled, LeadStatus.TRIAL_HELD)).toBe(true);
            expect(hasReached(enrolled, LeadStatus.ENROLLED)).toBe(true);
        });

        it('judges a lost lead on the marks it left, not on where it ended', () => {
            // Somebody who came to a trial and then said no has still been to a trial. Leaving says
            // nothing about how far they got, which is why `lost` is outside the order.
            const lost = lead({ status: LeadStatus.LOST, trialHeldAt: new Date('2026-02-01T15:00:00Z'), trialSession: { id: 4 } });

            expect(hasReached(lost, LeadStatus.TRIAL_HELD)).toBe(true);
            expect(hasReached(lost, LeadStatus.ENROLLED)).toBe(false);
        });

        it('does not credit a trial to somebody who never had one booked', () => {
            expect(hasReached(lead({ status: LeadStatus.CONTACTED }), LeadStatus.TRIAL_SCHEDULED)).toBe(false);
        });
    });

    it('computes the rate that matters — trial held to enrolment', async () => {
        leadRepo.find?.mockResolvedValue([
            lead({ id: 1, status: LeadStatus.ENROLLED, trialSession: { id: 1 }, trialHeldAt: new Date('2026-02-01T15:00:00Z') }),
            lead({ id: 2, status: LeadStatus.LOST, trialSession: { id: 2 }, trialHeldAt: new Date('2026-02-02T15:00:00Z') }),
            lead({ id: 3, status: LeadStatus.TRIAL_SCHEDULED, trialSession: { id: 3 } }),
            lead({ id: 4, status: LeadStatus.NEW }),
        ]);

        const funnel = await service.funnel(range);

        expect(funnel.stages).toMatchObject({ requests: 4, trialsScheduled: 3, trialsHeld: 2, enrolled: 1 });
        expect(funnel.rates.attendanceToEnrolment).toBe(50);
        expect(funnel.rates.requestToTrial).toBe(75);
    });

    it('reports the median days from the trial to a decision, and null when nothing is decided', async () => {
        leadRepo.find?.mockResolvedValue([
            lead({ id: 1, status: LeadStatus.ENROLLED, trialHeldAt: new Date('2026-02-01T15:00:00Z'), decidedAt: new Date('2026-02-03T15:00:00Z') }),
            lead({ id: 2, status: LeadStatus.LOST, trialHeldAt: new Date('2026-02-01T15:00:00Z'), decidedAt: new Date('2026-02-09T15:00:00Z') }),
        ]);

        expect((await service.funnel(range)).medianDaysToDecision).toBe(5);

        leadRepo.find?.mockResolvedValue([lead({ id: 3, status: LeadStatus.TRIAL_HELD, trialHeldAt: new Date('2026-02-01T15:00:00Z') })]);
        expect((await service.funnel(range)).medianDaysToDecision).toBeNull();
    });

    it('counts the families nobody could seat, by address and age band', async () => {
        const titan = { id: 1, name: 'Titan' } as Lead['location'];
        leadRepo.find?.mockResolvedValue([
            lead({ id: 1, noSeats: true, location: titan, childBirthDate: '2018-01-01' }),
            lead({ id: 2, noSeats: true, location: titan, childBirthDate: '2018-06-01' }),
            lead({ id: 3, noSeats: false, location: titan }),
        ]);

        const funnel = await service.funnel(range);

        expect(funnel.stages.noSeats).toBe(2);
        expect(funnel.unmetByBand).toHaveLength(1);
        expect(funnel.unmetByBand[0]).toMatchObject({ locationName: 'Titan', count: 2 });
        // They are outside every conversion rate, which is the whole reason the figure exists: a
        // parent who found no free hour never entered the funnel to be converted.
        expect(funnel.rates.requestToTrial).toBe(0);
    });

    it('groups by the channel the family named, and calls an unstated one what it is', async () => {
        leadRepo.find?.mockResolvedValue([
            lead({ id: 1, channel: LeadChannel.FRIEND, status: LeadStatus.ENROLLED }),
            lead({ id: 2, channel: LeadChannel.FRIEND }),
            lead({ id: 3, channel: null }),
        ]);

        const funnel = await service.funnel(range);

        expect(funnel.byChannel[0]).toEqual({ key: 'friend', requests: 2, enrolled: 1 });
        expect(funnel.byChannel[1]).toEqual({ key: 'unspecified', requests: 1, enrolled: 0 });
    });

    it('answers zero rather than dividing by nothing when a month was quiet', async () => {
        leadRepo.find?.mockResolvedValue([]);
        const funnel = await service.funnel(range);
        expect(funnel.rates).toEqual({ requestToTrial: 0, trialToAttendance: 0, attendanceToEnrolment: 0 });
    });
});
