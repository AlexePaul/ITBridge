import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { Lead } from 'src/entities/lead.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { splitParentName, TrialBookingService } from './trial-booking.service';

/**
 * The public booking flow — E20/S2.
 *
 * Two properties carry the whole story and both are asserted here: **no account is ever created**,
 * and **a family is never lost**. Everything else — which hours are offered, what happens when the
 * last seat goes — is in service of the second.
 */
describe('TrialBookingService', () => {
    let service: TrialBookingService;
    let leadRepo: MockRepository<Lead>;
    let groupRepo: MockRepository<Group>;
    let sessionRepo: MockRepository<ClassSession>;
    let manager: MockEntityManager;
    let enrollments: { enrol: jest.Mock; occupancyOf: jest.Mock };
    let outbox: { queueOrRecord: jest.Mock };

    const now = new Date('2026-03-10T09:00:00Z');

    const location = { id: 1, name: 'Titan', street: 'Strada Rotundă 12', city: 'București', isActive: true };
    const group = (overrides: Partial<Record<keyof Group, unknown>> = {}) =>
        ({
            id: 5,
            name: 'Scratch Începători',
            weekday: 2,
            startTime: '17:00:00',
            endTime: '18:30:00',
            minAge: 8,
            maxAge: 10,
            isActive: true,
            capacity: 10,
            room: { id: 2, location },
            ...overrides,
        }) as unknown as Group;

    const session = (overrides: Partial<Record<keyof ClassSession, unknown>> = {}) =>
        ({
            id: 42,
            date: '2026-03-17',
            startTime: '17:00:00',
            endTime: '18:30:00',
            status: ClassSessionStatus.SCHEDULED,
            group: group(),
            ...overrides,
        }) as unknown as ClassSession;

    const booking = {
        parentName: 'Ioana Popescu',
        parentEmail: 'ioana@example.com',
        childFirstName: 'Matei',
        childLastName: 'Popescu',
        childBirthDate: '2017-05-05',
        classSessionId: 42,
    };

    beforeEach(async () => {
        leadRepo = createMockRepository<Lead>();
        groupRepo = createMockRepository<Group>();
        sessionRepo = createMockRepository<ClassSession>();
        manager = createMockEntityManager();
        manager.save = jest.fn((_entity: unknown, data?: unknown) => Promise.resolve({ id: 7, ...(data ?? {}) }));
        enrollments = { enrol: jest.fn().mockResolvedValue({ id: 11 }), occupancyOf: jest.fn().mockResolvedValue({ free: 3 }) };
        outbox = { queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
        leadRepo.findOne?.mockResolvedValue(null);
        leadRepo.save?.mockImplementation((data: object) => Promise.resolve({ id: 9, ...data }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TrialBookingService,
                provideMockRepository(Lead, leadRepo),
                provideMockRepository(Group, groupRepo),
                provideMockRepository(ClassSession, sessionRepo),
                { provide: EnrollmentService, useValue: enrollments },
                { provide: OutboxService, useValue: outbox },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(TrialBookingService);
    });

    describe('what is offered', () => {
        it('leaves out a group with no free seat, however well the age fits', async () => {
            groupRepo.find?.mockResolvedValue([group()]);
            sessionRepo.find?.mockResolvedValue([session()]);
            enrollments.occupancyOf.mockResolvedValue({ free: 0 });

            expect(await service.slots({ birthDate: '2017-05-05' }, now)).toEqual([]);
        });

        it('leaves out a group with room but no classes in the horizon', async () => {
            groupRepo.find?.mockResolvedValue([group()]);
            sessionRepo.find?.mockResolvedValue([]);

            expect(await service.slots({ birthDate: '2017-05-05' }, now)).toEqual([]);
        });

        it('offers the group with its upcoming classes when both hold', async () => {
            groupRepo.find?.mockResolvedValue([group()]);
            sessionRepo.find?.mockResolvedValue([session(), session({ id: 43, date: '2026-03-24' })]);

            const slots = await service.slots({ birthDate: '2017-05-05' }, now);

            expect(slots).toHaveLength(1);
            expect(slots[0]).toMatchObject({ groupId: 5, groupName: 'Scratch Începători', locationName: 'Titan', address: 'Strada Rotundă 12, București' });
            expect(slots[0].sessions.map((entry) => entry.date)).toEqual(['2026-03-17', '2026-03-24']);
        });

        it('counts seats through the enrolment service rather than counting rows itself', async () => {
            groupRepo.find?.mockResolvedValue([group()]);
            sessionRepo.find?.mockResolvedValue([session()]);

            await service.slots({ birthDate: '2017-05-05' }, now);

            expect(enrollments.occupancyOf).toHaveBeenCalledWith(5);
        });
    });

    describe('booking', () => {
        beforeEach(() => {
            sessionRepo.findOne?.mockResolvedValue(session());
        });

        it('refuses a request with no way to reach the family', async () => {
            await expect(service.book({ ...booking, parentEmail: undefined }, now)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('creates a family with no account, and no email or phone on the profile', async () => {
            await service.book(booking, now);

            const savedProfile = manager.save.mock.calls.find(([entity]) => entity?.name === 'Profile')?.[1] as Record<string, unknown>;
            expect(savedProfile).toMatchObject({ firstName: 'Ioana', lastName: 'Popescu' });
            // The two unique columns stay empty: a public form must never be able to write into
            // another family's row, or to attach a child to one.
            expect(savedProfile).not.toHaveProperty('email');
            expect(savedProfile).not.toHaveProperty('phone');
            expect(savedProfile).not.toHaveProperty('user');
        });

        it('takes the seat through the enrolment service, as a trial, inside the transaction', async () => {
            await service.book(booking, now);

            expect(enrollments.enrol).toHaveBeenCalledWith(expect.objectContaining({ groupId: 5, status: EnrollmentStatus.TRIAL }), null, manager);
        });

        it('queues the confirmation in the same transaction as the booking', async () => {
            await service.book(booking, now);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                { email: 'ioana@example.com' },
                expect.objectContaining({ subject: expect.stringContaining('Matei') }),
                manager,
            );
        });

        it('keeps the family as a lead when they found no hour to pick', async () => {
            const result = await service.book({ ...booking, classSessionId: undefined }, now);

            expect(result.status).toBe('no_seats');
            expect(leadRepo.save).toHaveBeenCalledWith(expect.objectContaining({ noSeats: true, status: LeadStatus.NEW }));
        });

        it('keeps the family as a lead when the last seat went while they were typing', async () => {
            enrollments.enrol.mockRejectedValue(new ConflictException({ message: 'Grupa este plină', error: 'GROUP_FULL' }));

            const result = await service.book(booking, now);

            // Not an error page: the worst outcome of a race is a family who leaves without the
            // school knowing they came.
            expect(result.status).toBe('no_seats');
            expect(leadRepo.save).toHaveBeenCalledWith(expect.objectContaining({ noSeats: true }));
        });

        it('lets any other refusal through rather than swallowing it as "no seats"', async () => {
            enrollments.enrol.mockRejectedValue(new ConflictException({ message: 'Grupa este inactivă', error: 'GROUP_INACTIVE' }));

            await expect(service.book(booking, now)).rejects.toBeInstanceOf(ConflictException);
        });

        it('refuses a class the child is too young for, which the list would never have offered', async () => {
            await expect(service.book({ ...booking, childBirthDate: '2021-01-01' }, now)).rejects.toMatchObject({ response: { error: 'TRIAL_AGE_MISMATCH' } });
        });

        it('refuses a class that has been cancelled since the page loaded', async () => {
            sessionRepo.findOne?.mockResolvedValue(session({ status: ClassSessionStatus.CANCELLED }));

            await expect(service.book(booking, now)).rejects.toMatchObject({ response: { error: 'TRIAL_SESSION_UNAVAILABLE' } });
        });

        it('answers a second press of the same form with the first booking, not a second child', async () => {
            leadRepo.findOne?.mockResolvedValue({ id: 9, noSeats: false, trialSession: { id: 42 } });
            sessionRepo.findOne?.mockResolvedValue(session());

            const result = await service.book(booking, now);

            expect(result).toMatchObject({ status: 'booked', leadId: 9 });
            expect(enrollments.enrol).not.toHaveBeenCalled();
        });
    });

    describe('splitParentName', () => {
        it('takes the last word as the surname', () => {
            expect(splitParentName('Ioana Maria Popescu')).toEqual({ firstName: 'Ioana Maria', lastName: 'Popescu' });
        });

        it('leaves the surname empty rather than repeating the first name', () => {
            // An empty field reads as "not asked" to whoever fills the family in later; „Ioana Ioana"
            // would read as data.
            expect(splitParentName('Ioana')).toEqual({ firstName: 'Ioana', lastName: '' });
        });
    });
});
