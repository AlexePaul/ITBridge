import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Lead } from 'src/entities/lead.entity';
import { LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { LeadService } from './lead.service';

/**
 * The office's side of the funnel — E20/S1 and S3.
 *
 * The rules worth pinning are the ones that keep the numbers honest: no screen may declare a family
 * enrolled, and no lead may leave the follow-up lists without somebody writing down why.
 */
describe('LeadService', () => {
    let service: LeadService;
    let leadRepo: MockRepository<Lead>;

    const now = new Date('2026-03-20T09:00:00Z');

    /** As above: a `date` column arrives from the driver as a string, and the fixtures say so. */
    const lead = (overrides: Partial<Record<keyof Lead, unknown>> = {}): Lead =>
        ({
            id: 1,
            status: LeadStatus.NEW,
            source: LeadSource.TRIAL_FORM,
            channel: null,
            parentName: 'Ioana Popescu',
            parentEmail: 'ioana@example.com',
            parentPhone: null,
            childFirstName: 'Matei',
            childLastName: 'Popescu',
            childBirthDate: '2017-05-05',
            experience: null,
            noSeats: false,
            lostReason: null,
            notes: null,
            nextActionAt: null,
            lastActivityAt: new Date('2026-03-19T09:00:00Z'),
            trialHeldAt: null,
            decidedAt: null,
            createdAt: new Date('2026-03-19T09:00:00Z'),
            location: null,
            group: null,
            trialSession: null,
            assignedTo: null,
            ...overrides,
        }) as Lead;

    beforeEach(async () => {
        leadRepo = createMockRepository<Lead>();
        leadRepo.update?.mockResolvedValue({ affected: 1 });
        const module: TestingModule = await Test.createTestingModule({
            providers: [LeadService, provideMockRepository(Lead, leadRepo)],
        }).compile();
        service = module.get(LeadService);
    });

    describe('what a screen may say', () => {
        it('refuses to mark a lead contacted twice, because the later states come from facts', async () => {
            leadRepo.findOne?.mockResolvedValue(lead({ status: LeadStatus.CONTACTED }));

            await expect(service.markContacted(1, now)).rejects.toMatchObject({ response: { error: 'LEAD_NOT_NEW' } });
        });

        it('refuses to close an enrolled family as lost — that is an enrolment to end, not a request', async () => {
            leadRepo.findOne?.mockResolvedValue(lead({ status: LeadStatus.ENROLLED }));

            await expect(service.markLost(1, { reason: 'S-au răzgândit' }, now)).rejects.toMatchObject({ response: { error: 'LEAD_ALREADY_ENROLLED' } });
        });

        it('writes the reason and the moment when a lead is closed', async () => {
            leadRepo.findOne?.mockResolvedValue(lead({ status: LeadStatus.TRIAL_HELD }));

            await service.markLost(1, { reason: 'Prea departe de casă' }, now);

            expect(leadRepo.update).toHaveBeenCalledWith(
                { id: 1 },
                expect.objectContaining({ status: LeadStatus.LOST, lostReason: 'Prea departe de casă', decidedAt: now }),
            );
        });

        it('refuses an update that both assigns and unassigns', async () => {
            leadRepo.findOne?.mockResolvedValue(lead());

            await expect(service.update(1, { assignedToId: 3, unassign: true }, now)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('stamps every human touch, so being reminded about cannot make a lead look fresh', async () => {
            leadRepo.findOne?.mockResolvedValue(lead());

            await service.update(1, { notes: 'A sunat, revine în aprilie' }, now);

            expect(leadRepo.update).toHaveBeenCalledWith({ id: 1 }, expect.objectContaining({ lastActivityAt: now }));
        });

        it('answers 404 for a lead that is not there', async () => {
            leadRepo.findOne?.mockResolvedValue(null);
            await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('creating one from a phone call', () => {
        it('needs a way to reach the family', async () => {
            await expect(
                service.create(
                    { parentName: 'Ioana', childFirstName: 'Matei', childLastName: 'Popescu', childBirthDate: '2017-05-05', source: LeadSource.PHONE },
                    3,
                    now,
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('gives it to the admin who wrote it down, which is the one moment there is no guessing', async () => {
            leadRepo.save?.mockResolvedValue({ id: 4 });
            leadRepo.findOne?.mockResolvedValue(lead({ id: 4 }));

            await service.create(
                {
                    parentName: 'Ioana',
                    parentPhone: '0712345678',
                    childFirstName: 'Matei',
                    childLastName: 'Popescu',
                    childBirthDate: '2017-05-05',
                    source: LeadSource.PHONE,
                },
                3,
                now,
            );

            expect(leadRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: { id: 3 }, lastActivityAt: now }));
        });
    });

    describe('the follow-up lists', () => {
        it('sorts the four cases apart, and counts the unowned', async () => {
            leadRepo.find?.mockResolvedValue([
                lead({ id: 1, status: LeadStatus.TRIAL_HELD, trialHeldAt: new Date('2026-03-16T15:00:00Z') }),
                lead({ id: 2, noSeats: true, lastActivityAt: new Date('2026-03-18T09:00:00Z') }),
                lead({ id: 3, status: LeadStatus.CONTACTED, lastActivityAt: new Date('2026-03-01T09:00:00Z') }),
                lead({
                    id: 4,
                    status: LeadStatus.CONTACTED,
                    nextActionAt: '2026-03-20',
                    lastActivityAt: new Date('2026-03-19T09:00:00Z'),
                    assignedTo: { id: 2, username: 'ana' },
                }),
            ]);

            const followUp = await service.followUp(now);

            expect(followUp.undecided.map(({ lead: row }) => row.id)).toEqual([1]);
            expect(followUp.undecided[0].days).toBe(4);
            expect(followUp.noSeats.map(({ lead: row }) => row.id)).toEqual([2]);
            expect(followUp.stale.map(({ lead: row }) => row.id)).toEqual([3]);
            expect(followUp.due.map(({ lead: row }) => row.id)).toEqual([4]);
            // Three of the four have nobody's name on them.
            expect(followUp.unassigned).toBe(3);
        });

        it('does not call a lead stale twice by also counting a trial nobody decided', async () => {
            // A trial held eight days ago is on the undecided list, which is the sharper of the two.
            // Listing it as "no movement" as well would double every number in the daily message.
            leadRepo.find?.mockResolvedValue([
                lead({ id: 1, status: LeadStatus.TRIAL_HELD, trialHeldAt: new Date('2026-03-12T15:00:00Z'), lastActivityAt: new Date('2026-03-12T15:00:00Z') }),
            ]);

            const followUp = await service.followUp(now);

            expect(followUp.undecided).toHaveLength(1);
            expect(followUp.stale).toHaveLength(0);
        });
    });

    describe('the list', () => {
        it('leaves settled leads out unless asked, and narrows to the unowned when asked', async () => {
            const qb = createMockQueryBuilder<Lead>({ many: [] });
            leadRepo.createQueryBuilder?.mockReturnValue(qb);

            await service.list({ unassigned: true });

            const conditions = qb.andWhereCalls.map(([clause]) => clause);
            expect(conditions).toContain('lead.status NOT IN (:...settled)');
            expect(conditions).toContain('lead.assigned_to_id IS NULL');
        });
    });
});
