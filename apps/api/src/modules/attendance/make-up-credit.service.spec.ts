import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MakeUpCreditService } from './make-up-credit.service';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { MakeUpStatus } from 'src/enum/make-up-status.enum';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';

describe('MakeUpCreditService', () => {
    let service: MakeUpCreditService;
    let creditRepo: MockRepository;
    let noticeRepo: MockRepository;
    let sessionRepo: MockRepository;
    let enrollmentRepo: MockRepository;
    /**
     * D7's owner since E20/S2: seats at a class are counted in `EnrollmentService`, so this suite
     * states the answer rather than the rows behind it. The counting itself is tested there.
     */
    let enrollments: { freeSeatsAt: jest.Mock; freeSeatsAtSessions: jest.Mock };

    /** "Today" for every test, so nothing depends on the day the suite runs. */
    const NOW = new Date(2026, 8, 10);
    const MISSED = { id: 9, date: new Date(2026, 8, 7), group: { id: 3 } };

    beforeEach(async () => {
        creditRepo = createMockRepository();
        noticeRepo = createMockRepository();
        sessionRepo = createMockRepository();
        enrollmentRepo = createMockRepository();
        enrollments = { freeSeatsAt: jest.fn().mockResolvedValue(10), freeSeatsAtSessions: jest.fn().mockResolvedValue(new Map()) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MakeUpCreditService,
                provideMockRepository(MakeUpCredit, creditRepo),
                provideMockRepository(AbsenceNotice, noticeRepo),
                provideMockRepository(ClassSession, sessionRepo),
                provideMockRepository(Enrollment, enrollmentRepo),
                { provide: EnrollmentService, useValue: enrollments },
            ],
        }).compile();
        service = module.get(MakeUpCreditService);

        creditRepo.create!.mockImplementation((row: unknown) => row);
        creditRepo.save!.mockImplementation((row: unknown) => Promise.resolve(row));
        creditRepo.findOne!.mockResolvedValue(null);
        creditRepo.count!.mockResolvedValue(0);
        enrollmentRepo.count!.mockResolvedValue(0);
        sessionRepo.findOne!.mockResolvedValue(MISSED);
    });

    const responseOf = (error: unknown) => (error as { getResponse(): { error?: string } }).getResponse();

    describe('earning one — the definition of "eligible"', () => {
        it('an in-time notice plus a genuine absence earns a credit', async () => {
            noticeRepo.findOne!.mockResolvedValue({ inTime: true });

            const credit = await service.earnFor(5, 9, false);

            expect(credit).not.toBeNull();
            // The Sunday closing the week of the class that was missed, frozen at this moment.
            // 7 September 2026 is a Monday, so the window shuts on the 13th.
            expect(credit!.expiresOn).toEqual(new Date(2026, 8, 13));
        });

        it('a child who was present earns nothing, however early they announced', async () => {
            noticeRepo.findOne!.mockResolvedValue({ inTime: true });

            // Announcing and then turning up is being present. Neither half alone is enough,
            // which is the whole content of "eligible".
            await expect(service.earnFor(5, 9, true)).resolves.toBeNull();
            expect(creditRepo.save).not.toHaveBeenCalled();
        });

        it('an absence with no notice at all earns nothing', async () => {
            noticeRepo.findOne!.mockResolvedValue(null);
            await expect(service.earnFor(5, 9, false)).resolves.toBeNull();
        });

        it('a notice that arrived late earns nothing', async () => {
            noticeRepo.findOne!.mockResolvedValue({ inTime: false });
            await expect(service.earnFor(5, 9, false)).resolves.toBeNull();
        });

        it('re-marking the same absence does not earn a second credit', async () => {
            noticeRepo.findOne!.mockResolvedValue({ inTime: true });
            const existing = { id: 4 };
            creditRepo.findOne!.mockResolvedValue(existing);

            await expect(service.earnFor(5, 9, false)).resolves.toBe(existing);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('granting them because the school called the class off', () => {
        const withChildren = { ...MISSED, group: { id: 3, children: [{ id: 5 }, { id: 6 }, { id: 7 }] } };

        beforeEach(() => {
            sessionRepo.findOne!.mockResolvedValue(withChildren);
            creditRepo.find!.mockResolvedValue([]);
        });

        it('gives every child in the group one, dated from the class that did not happen', async () => {
            const granted = await service.grantForCancellation(9);

            expect(granted).toBe(3);
            const written = creditRepo.save!.mock.calls[0][0] as { child: { id: number }; expiresOn: Date }[];
            expect(written.map((credit) => credit.child.id)).toEqual([5, 6, 7]);
            expect(written[0].expiresOn).toEqual(new Date(2026, 8, 13));
        });

        // No notice is looked for, and that is the difference from `earnFor`: nobody was absent
        // from anything, because there was nothing to be absent from.
        it('asks for no absence notice at all', async () => {
            await service.grantForCancellation(9);

            expect(noticeRepo.findOne).not.toHaveBeenCalled();
        });

        it('skips a child who already holds one for that class, so cancelling twice mints nothing', async () => {
            creditRepo.find!.mockResolvedValue([{ child: { id: 6 } }]);

            const granted = await service.grantForCancellation(9);

            expect(granted).toBe(2);
            const written = creditRepo.save!.mock.calls[0][0] as { child: { id: number } }[];
            expect(written.map((credit) => credit.child.id)).toEqual([5, 7]);
        });

        it('writes nothing when everybody already holds one', async () => {
            creditRepo.find!.mockResolvedValue([{ child: { id: 5 } }, { child: { id: 6 } }, { child: { id: 7 } }]);

            expect(await service.grantForCancellation(9)).toBe(0);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });

        it('writes nothing for an empty group, and nothing for a session that is not there', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...MISSED, group: { id: 3, children: [] } });
            expect(await service.grantForCancellation(9)).toBe(0);

            sessionRepo.findOne!.mockResolvedValue(null);
            expect(await service.grantForCancellation(99)).toBe(0);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('releasing the bookings on a cancelled class', () => {
        it('unbooks every unspent credit booked into it, and keeps the credits', async () => {
            creditRepo.find!.mockResolvedValue([
                { id: 4, bookedSession: { id: 9 }, consumedAttendance: null },
                { id: 5, bookedSession: { id: 9 }, consumedAttendance: null },
            ]);

            expect(await service.releaseBookingsOn(9)).toBe(2);

            expect(creditRepo.find).toHaveBeenCalledWith({ where: { bookedSession: { id: 9 }, consumedAttendance: expect.anything() } });
            const saved = creditRepo.save!.mock.calls[0][0] as { id: number; bookedSession: unknown }[];
            expect(saved.map((credit) => credit.bookedSession)).toEqual([null, null]);
            expect(creditRepo.delete).not.toHaveBeenCalled();
        });

        it('writes nothing when nobody was booked', async () => {
            creditRepo.find!.mockResolvedValue([]);

            expect(await service.releaseBookingsOn(9)).toBe(0);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('revoking one a mistap earned', () => {
        it('withdraws an unspent, unbooked credit', async () => {
            creditRepo.findOne!.mockResolvedValue({ id: 4, consumedAttendance: null, bookedSession: null });

            await service.revokeFor(5, 9);

            expect(creditRepo.delete).toHaveBeenCalledWith(4);
        });

        it('leaves a booked one alone — the family has already made a plan on it', async () => {
            creditRepo.findOne!.mockResolvedValue({ id: 4, consumedAttendance: null, bookedSession: { id: 12 } });
            await service.revokeFor(5, 9);
            expect(creditRepo.delete).not.toHaveBeenCalled();
        });

        it('leaves a spent one alone — no correction elsewhere undoes a class sat in on', async () => {
            creditRepo.findOne!.mockResolvedValue({ id: 4, consumedAttendance: { id: 31 }, bookedSession: null });
            await service.revokeFor(5, 9);
            expect(creditRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('the derived state', () => {
        const credit = (over: Record<string, unknown> = {}) =>
            ({ expiresOn: new Date(2026, 9, 7), bookedSession: null, consumedAttendance: null, ...over }) as unknown as MakeUpCredit;

        it('unbooked and unexpired is available', () => {
            expect(service.statusOf(credit(), NOW)).toBe(MakeUpStatus.AVAILABLE);
        });

        it('booked is booked', () => {
            expect(service.statusOf(credit({ bookedSession: { id: 12 } }), NOW)).toBe(MakeUpStatus.BOOKED);
        });

        it('spent beats everything, including expired', () => {
            const spent = credit({ consumedAttendance: { id: 31 }, bookedSession: { id: 12 } });
            expect(service.statusOf(spent, new Date(2027, 0, 1))).toBe(MakeUpStatus.CONSUMED);
        });

        it('expired is the calendar having moved, and is never a column', () => {
            expect(service.statusOf(credit(), new Date(2026, 9, 8))).toBe(MakeUpStatus.EXPIRED);
        });
    });

    describe('booking', () => {
        const own = {
            id: 4,
            expiresOn: new Date(2026, 9, 7),
            bookedSession: null,
            consumedAttendance: null,
            child: { id: 5, birthDate: '2016-01-01', parent: { user: { id: 42 } } },
            originSession: { id: 9, group: { id: 3 } },
        };
        /** A different group, right age band, inside the window. */
        const host = {
            id: 12,
            date: new Date(2026, 8, 16),
            status: ClassSessionStatus.SCHEDULED,
            group: { id: 7, name: 'Python', minAge: 5, maxAge: 18, capacity: 10 },
        };

        beforeEach(() => {
            creditRepo.findOne!.mockResolvedValue({ ...own });
            sessionRepo.findOne!.mockResolvedValue(host);
        });

        it('books the chosen class', async () => {
            const booked = await service.book(4, 12, Role.PARENT, 42, NOW);
            expect(booked.bookedSession).toBe(host);
        });

        it("refuses another family's credit as a 404", async () => {
            creditRepo.findOne!.mockResolvedValue({ ...own, child: { ...own.child, parent: { user: { id: 999 } } } });
            await expect(service.book(4, 12, Role.PARENT, 42, NOW)).rejects.toThrow(NotFoundException);
        });

        it('refuses the child’s own group — that is not a make-up, it is their lesson', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...host, group: { ...host.group, id: 3 } });
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_SAME_GROUP');
        });

        it('refuses an expired credit, and says when it died', async () => {
            const error = await service.book(4, 12, Role.PARENT, 42, new Date(2026, 9, 8)).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_EXPIRED');
        });

        it('refuses a spent one', async () => {
            creditRepo.findOne!.mockResolvedValue({ ...own, consumedAttendance: { id: 31 } });
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_ALREADY_CONSUMED');
        });

        it('refuses a class past the credit’s last day', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...host, date: new Date(2026, 9, 20) });
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_SESSION_OUT_OF_WINDOW');
        });

        it('refuses a group whose age band the child is outside', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...host, group: { ...host.group, minAge: 15, maxAge: 18 } });
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_AGE_MISMATCH');
        });

        it('refuses a full class — a visitor needs a real chair, like a trial does', async () => {
            enrollments.freeSeatsAt.mockResolvedValue(0);
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_SESSION_FULL');
        });

        it('asks about the class, not the group — a visitor already booked fills the last chair', async () => {
            // Nine enrolled and one make-up already booked onto this very hour is a full class even
            // though the group still has headroom; the arithmetic is asserted in the enrolment suite.
            enrollments.freeSeatsAt.mockResolvedValue(0);
            const error = await service.book(4, 12, Role.PARENT, 42, NOW).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('MAKE_UP_SESSION_FULL');
        });

        it('cancelling a booking leaves the credit available', async () => {
            creditRepo.findOne!.mockResolvedValue({ ...own, bookedSession: host });
            const freed = await service.cancelBooking(4, Role.PARENT, 42);
            expect(freed.bookedSession).toBeNull();
        });
    });

    describe('spending it', () => {
        it('turning up at the booked class consumes the credit', async () => {
            const credit = { id: 4, consumedAttendance: null };
            creditRepo.findOne!.mockResolvedValue(credit);
            const mark = { id: 31 } as unknown as Attendance;

            await service.consumeFor(5, 12, mark, true);

            expect(credit.consumedAttendance).toBe(mark);
        });

        it('not turning up spends nothing — the credit lives out its window', async () => {
            await service.consumeFor(5, 12, { id: 31 } as unknown as Attendance, false);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });

        it('a second mark at the same class does not re-spend it', async () => {
            creditRepo.findOne!.mockResolvedValue({ id: 4, consumedAttendance: { id: 30 } });
            await service.consumeFor(5, 12, { id: 31 } as unknown as Attendance, true);
            expect(creditRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('listing', () => {
        it('narrows to the authenticated parent, and not for an admin', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            creditRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.listFor(Role.PARENT, 42);
            expect(qb.andWhereCalls.some(([c, p]) => c.includes('user.id') && p?.userId === 42)).toBe(true);

            const adminQb = createMockQueryBuilder({ many: [] });
            creditRepo.createQueryBuilder!.mockReturnValue(adminQb);
            await service.listFor(Role.ADMIN, 42);
            expect(adminQb.andWhereCalls.some(([c]) => c.includes('user.id'))).toBe(false);
        });
    });
});
