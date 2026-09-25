import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { NonTeachingPeriod } from 'src/entities/non-teaching-period.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Location } from 'src/entities/location.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { ReplacementService } from 'src/modules/attendance/replacement.service';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';

describe('NonTeachingPeriodService', () => {
    let service: NonTeachingPeriodService;
    let periodRepo: MockRepository;
    let sessionRepo: MockRepository;
    let locationRepo: MockRepository;
    let manager: MockEntityManager;
    let replacements: { clearOn: jest.Mock };

    beforeEach(async () => {
        replacements = { clearOn: jest.fn().mockResolvedValue(0) };
        periodRepo = createMockRepository();
        sessionRepo = createMockRepository();
        locationRepo = createMockRepository();
        manager = createMockEntityManager();
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 1, ...data }));
        // `create` writes through the query builder, so the manager needs one too.
        manager.createQueryBuilder = jest.fn(() => {
            const qb: Record<string, jest.Mock> = {};
            for (const method of ['update', 'set', 'whereInIds']) qb[method] = jest.fn(() => qb);
            qb.execute = jest.fn().mockResolvedValue({ affected: 0 });
            return qb;
        }) as never;

        periodRepo.find!.mockResolvedValue([]);
        periodRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [], one: null }));
        sessionRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [] }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NonTeachingPeriodService,
                provideMockRepository(NonTeachingPeriod, periodRepo),
                provideMockRepository(ClassSession, sessionRepo),
                provideMockRepository(Location, locationRepo),
                provideMockDataSource(manager),
                // A class the calendar cancels lets go of the children placed in it, like one
                // cancelled by hand. Asserted below; the release itself is the replacements suite.
                { provide: ReplacementService, useValue: replacements },
            ],
        }).compile();

        service = module.get(NonTeachingPeriodService);
    });

    const responseOf = (error: unknown) => (error as { getResponse(): { error?: string } }).getResponse();

    describe('datesIn', () => {
        it('expands a period into every day it covers, both ends included', async () => {
            periodRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ startDate: '2026-12-21', endDate: '2026-12-24', location: null }] as never[] }),
            );

            const dates = await service.datesIn(new Date('2026-12-01'), new Date('2027-01-01'));

            expect([...dates].sort()).toEqual(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24']);
        });

        it('treats a single day as a period of one', async () => {
            periodRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ startDate: '2026-12-01', endDate: '2026-12-01', location: null }] as never[] }),
            );

            await expect(service.datesIn(new Date('2026-11-01'), new Date('2027-01-01'))).resolves.toEqual(new Set(['2026-12-01']));
        });

        it('is empty when nothing overlaps', async () => {
            await expect(service.datesIn(new Date('2026-03-01'), new Date('2026-04-01'))).resolves.toEqual(new Set());
        });
    });

    describe('impactOf', () => {
        it('groups the sessions it would cancel, biggest group first', async () => {
            sessionRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({
                    many: [
                        { id: 1, date: '2026-12-21', group: { id: 5, name: 'Scratch' } },
                        { id: 2, date: '2026-12-28', group: { id: 5, name: 'Scratch' } },
                        { id: 3, date: '2026-12-24', group: { id: 7, name: 'Python' } },
                    ] as never[],
                }),
            );

            const impact = await service.impactOf({ startDate: '2026-12-21', endDate: '2027-01-07' });

            // A mistyped date has to be legible as a number before anything is written.
            expect(impact.affected).toHaveLength(3);
            expect(impact.byGroup[0]).toMatchObject({ groupName: 'Scratch', count: 2, dates: ['2026-12-21', '2026-12-28'] });
            expect(impact.byGroup[1]).toMatchObject({ groupName: 'Python', count: 1 });
        });

        it('refuses a period that ends before it starts', async () => {
            await expect(service.impactOf({ startDate: '2026-12-21', endDate: '2026-12-01' })).rejects.toThrow(BadRequestException);
        });
    });

    describe('create', () => {
        it('cancels the sessions the period covers, rather than deleting them', async () => {
            sessionRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ id: 1, date: '2026-12-21', group: { id: 5, name: 'Scratch' } }] as never[] }),
            );

            const result = await service.create({ name: 'Vacanța de iarnă', startDate: '2026-12-21', endDate: '2027-01-07' });

            // A class that was on the timetable and did not happen is a fact about the term.
            // Deleting the row would leave the history saying the week simply had one fewer class.
            expect(result.cancelled).toBe(1);
            expect(sessionRepo.delete).not.toHaveBeenCalled();
        });

        /**
         * A child moved into one of these classes for the week is released, as a class cancelled by
         * hand releases them. Before, the placement kept pointing at a class that was not going to
         * happen, and the child never came back among the ones to place.
         */
        it('releases the children placed in the classes it cancels, in its transaction', async () => {
            sessionRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({
                    many: [
                        { id: 1, date: '2026-12-21', group: { id: 5, name: 'Scratch' } },
                        { id: 2, date: '2026-12-22', group: { id: 6, name: 'Python' } },
                    ] as never[],
                }),
            );
            await service.create({ name: 'Vacanța de iarnă', startDate: '2026-12-21', endDate: '2027-01-07' });

            expect(replacements.clearOn).toHaveBeenCalledWith(1, manager);
            expect(replacements.clearOn).toHaveBeenCalledWith(2, manager);
        });

        /** A class with marks happened; the calendar changing its mind about the day does not undo it. */
        it('leaves out the classes that already have marks', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            sessionRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.impactOf({ startDate: '2026-12-21', endDate: '2027-01-07' });

            expect(qb.andWhereCalls.map(([condition]) => condition)).toContain(
                'NOT EXISTS (SELECT 1 FROM attendances marked WHERE marked.class_session_id = session.id)',
            );
        });

        it('writes the period name into the cancelled session, so the reason survives', async () => {
            sessionRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ id: 1, date: '2026-12-21', group: { id: 5, name: 'Scratch' } }] as never[] }),
            );
            const qb = { update: jest.fn(), set: jest.fn(), whereInIds: jest.fn(), execute: jest.fn().mockResolvedValue({ affected: 1 }) };
            qb.update.mockReturnValue(qb);
            qb.set.mockReturnValue(qb);
            qb.whereInIds.mockReturnValue(qb);
            manager.createQueryBuilder = jest.fn(() => qb) as never;

            await service.create({ name: 'Vacanța de iarnă', startDate: '2026-12-21', endDate: '2027-01-07' });

            expect(qb.set).toHaveBeenCalledWith(
                expect.objectContaining({ status: ClassSessionStatus.CANCELLED, notes: expect.stringContaining('Vacanța de iarnă') }),
            );
        });

        it('refuses an overlapping period, naming the one already there', async () => {
            periodRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ one: { name: 'Vacanța de iarnă', startDate: '2026-12-21', endDate: '2027-01-07' } as never }),
            );

            const error = await service.create({ name: 'Altceva', startDate: '2026-12-24', endDate: '2026-12-26' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('PERIOD_OVERLAPS');
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('refuses a location that does not exist, before writing anything', async () => {
            locationRepo.findOne!.mockResolvedValue(null);

            await expect(service.create({ name: 'X', startDate: '2026-12-01', endDate: '2026-12-01', locationId: 99 })).rejects.toThrow(NotFoundException);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('accepts a period covering no sessions at all', async () => {
            const result = await service.create({ name: '1 Decembrie', startDate: '2026-12-01', endDate: '2026-12-01' });
            expect(result.cancelled).toBe(0);
        });
    });

    describe('remove', () => {
        it('leaves the cancelled sessions cancelled', async () => {
            periodRepo.delete!.mockResolvedValue({ affected: 1 });

            const result = await service.remove(1);

            // Reinstating automatically would be a guess: a class cancelled for the holiday and one
            // cancelled because the teacher was ill look identical afterwards.
            expect(result.message).toContain('rămân anulate');
            expect(sessionRepo.update).not.toHaveBeenCalled();
        });

        it('404s on a period that is not there', async () => {
            periodRepo.delete!.mockResolvedValue({ affected: 0 });
            await expect(service.remove(99)).rejects.toThrow(NotFoundException);
        });
    });
});
