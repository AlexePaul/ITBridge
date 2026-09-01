import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AbsenceNoticeService } from './absence-notice.service';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('AbsenceNoticeService', () => {
    let service: AbsenceNoticeService;
    let noticeRepo: MockRepository;
    let sessionRepo: MockRepository;
    let childRepo: MockRepository;
    let attendanceRepo: MockRepository;

    /** A 16:00 class on 2026-09-07, and a child of user 42 who is in its group. */
    const CHILD = { id: 5, parent: { user: { id: 42 } } };
    const SESSION = {
        id: 9,
        date: new Date(2026, 8, 7),
        startTime: '16:00:00',
        status: ClassSessionStatus.SCHEDULED,
        group: { id: 3, children: [{ id: 5 }] },
    };
    /** 09:00 school time on the day of the class. */
    const MORNING = new Date('2026-09-07T06:00:00.000Z');

    beforeEach(async () => {
        noticeRepo = createMockRepository();
        sessionRepo = createMockRepository();
        childRepo = createMockRepository();
        attendanceRepo = createMockRepository();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AbsenceNoticeService,
                provideMockRepository(AbsenceNotice, noticeRepo),
                provideMockRepository(ClassSession, sessionRepo),
                provideMockRepository(Child, childRepo),
                provideMockRepository(Attendance, attendanceRepo),
            ],
        }).compile();
        service = module.get(AbsenceNoticeService);

        childRepo.findOne!.mockResolvedValue({ ...CHILD });
        sessionRepo.findOne!.mockResolvedValue({ ...SESSION });
        attendanceRepo.findOne!.mockResolvedValue(null);
        noticeRepo.findOne!.mockResolvedValue(null);
        noticeRepo.save!.mockImplementation((row: unknown) => Promise.resolve(row));
    });

    const announce = (now = MORNING, role = Role.PARENT, userId = 42) =>
        service.announce({ childId: 5, classSessionId: 9, reason: 'Răcit' }, role, userId, now);

    const responseOf = (error: unknown) => (error as { getResponse(): { error?: string } }).getResponse();

    describe('announcing', () => {
        it('records the reason and freezes that it arrived in time', async () => {
            const notice = await announce();

            expect(notice.reason).toBe('Răcit');
            expect(notice.inTime).toBe(true);
        });

        it('after the class has begun, the notice still stands but is not in time', async () => {
            // 17:00 school time, an hour into a 16:00 class. Refusing it outright would lose the
            // reason, which the school still wants; what it loses is eligibility.
            const notice = await announce(new Date('2026-09-07T14:00:00.000Z'));
            expect(notice.inTime).toBe(false);
        });

        it('records who announced it', async () => {
            const notice = await announce();
            expect(notice.announcedBy).toEqual({ id: 42 });
        });

        it('amends the existing notice rather than adding a second absence', async () => {
            const existing = { id: 7, reason: 'Vechi', inTime: false };
            noticeRepo.findOne!.mockResolvedValue(existing);

            const notice = await announce();

            expect(notice.id).toBe(7);
            expect(notice.reason).toBe('Răcit');
            // Re-judged: the amendment is itself an act with a moment.
            expect(notice.inTime).toBe(true);
        });

        it("refuses another family's child by pretending it does not exist", async () => {
            childRepo.findOne!.mockResolvedValue({ id: 5, parent: { user: { id: 999 } } });

            // 404 rather than 403: a parent has no business learning that this id is somebody's.
            await expect(announce()).rejects.toThrow(NotFoundException);
            expect(noticeRepo.save).not.toHaveBeenCalled();
        });

        it('lets an admin announce for anyone — they took the phone call', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 5, parent: { user: { id: 999 } } });
            await expect(announce(MORNING, Role.ADMIN, 1)).resolves.toBeDefined();
        });

        it('survives a child whose family has no account at all', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 5, parent: {} });
            // `?.` on the user, or this is a TypeError instead of a refusal.
            await expect(announce()).rejects.toThrow(NotFoundException);
        });

        it('refuses a class the child is not in the group for', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...SESSION, group: { id: 3, children: [{ id: 99 }] } });

            const error = await announce().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(BadRequestException);
            expect(responseOf(error).error).toBe('CHILD_NOT_IN_SESSION_GROUP');
        });

        it('refuses a cancelled class — nobody can be absent from one that is not happening', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...SESSION, status: ClassSessionStatus.CANCELLED });

            const error = await announce().catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('CLASS_SESSION_CANCELLED');
        });

        it('refuses once the register is taken — what happened is already written down', async () => {
            attendanceRepo.findOne!.mockResolvedValue({ id: 31 });

            const error = await announce().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ConflictException);
            expect(responseOf(error).error).toBe('ATTENDANCE_ALREADY_MARKED');
        });
    });

    describe('withdrawing', () => {
        it('deletes the notice for the family it belongs to', async () => {
            noticeRepo.findOne!.mockResolvedValue({ id: 7, child: { parent: { user: { id: 42 } } } });

            await service.withdraw(7, Role.PARENT, 42);

            expect(noticeRepo.delete).toHaveBeenCalledWith(7);
        });

        it("refuses another family's notice", async () => {
            noticeRepo.findOne!.mockResolvedValue({ id: 7, child: { parent: { user: { id: 999 } } } });

            await expect(service.withdraw(7, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
            expect(noticeRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('the upcoming list', () => {
        it('narrows nothing for an ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            noticeRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.upcoming(Role.ADMIN, 42);

            expect(isScopedToUser(qb, 42)).toBe(false);
        });

        it('narrows to the authenticated parent', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            noticeRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.upcoming(Role.PARENT, 42);

            expect(qb.andWhereCalls.some(([c, p]) => c.includes('user.id') && p?.userId === 42)).toBe(true);
        });

        it('leaves the past out — this list answers "who is missing this week"', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            noticeRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.upcoming(Role.ADMIN, 42);

            expect(qb.andWhereCalls.some(([c]) => c.includes('session.date >='))).toBe(true);
        });
    });

    describe('forSession', () => {
        it('keys the notices by child, which is how the register reads them', async () => {
            noticeRepo.find!.mockResolvedValue([{ id: 1, reason: 'Răcit', inTime: true, child: { id: 5 } }]);

            const byChild = await service.forSession(9);

            expect(byChild.get(5)).toMatchObject({ reason: 'Răcit' });
            expect(byChild.has(99)).toBe(false);
        });
    });
});
