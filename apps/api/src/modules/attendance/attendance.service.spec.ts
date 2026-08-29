import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('AttendanceService', () => {
    let service: AttendanceService;
    let attendanceRepo: MockRepository;
    let classSessionRepo: MockRepository;
    let childRepo: MockRepository;

    /**
     * The body no longer carries a date or an hour — the class is the `classSessionId` in the path.
     * These tests used to build `{ childrenAttendance, date: '2026-03-10', startTime: '09:00' }`;
     * the date and the hour now belong to the session the first argument names.
     */
    const dto = (childIds: number[]) => ({
        childrenAttendance: childIds.map((childId) => ({ childId, present: true })),
    });

    /** A scheduled session for group 1, with whichever children the test wants enrolled. */
    const sessionWith = (children: { id: number }[], overrides: Record<string, unknown> = {}) => ({
        id: 3,
        status: ClassSessionStatus.SCHEDULED,
        date: '2026-03-10',
        startTime: '16:00',
        group: { id: 1, children },
        ...overrides,
    });

    beforeEach(async () => {
        attendanceRepo = createMockRepository();
        attendanceRepo.findByIds = jest.fn();
        classSessionRepo = createMockRepository();
        childRepo = createMockRepository();
        childRepo.findByIds = jest.fn();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AttendanceService,
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(ClassSession, classSessionRepo),
                provideMockRepository(Child, childRepo),
            ],
        }).compile();

        service = module.get(AttendanceService);
    });

    describe('createAttendance', () => {
        /**
         * These tests pin down the values written into the `type` column. They exist because the
         * values are easy to get wrong by inference: the entity's column default is `'normal'` and
         * the `@ApiProperty` example says `'catch-up'` — yet the service writes neither. The
         * frontend keys its labels off the values below, so any divergence leaves the session-type
         * column blank.
         *
         * The membership question is still asked of the group, but the group is now read off the
         * session rather than fetched separately: a child is on catch-up when they were not
         * enrolled in the group whose class this was.
         */
        it("writes 'regular' for a child who belongs to the group", async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }]));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(3, dto([7]));

            expect(saved[0].type).toBe('regular');
        });

        it("writes 'make-up' for a child outside the group, i.e. attending a catch-up session", async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([]));
            childRepo.findByIds!.mockResolvedValue([{ id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(3, dto([9]));

            expect(saved[0].type).toBe('make-up');
        });

        it("never writes 'normal' or 'catch-up'", async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }]));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }, { id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(3, dto([7, 9]));

            expect(saved.map((r) => r.type)).not.toContain('normal');
            expect(saved.map((r) => r.type)).not.toContain('catch-up');
        });

        it('attaches every record to the session it was posted for', async () => {
            const session = sessionWith([{ id: 7 }]);
            classSessionRepo.findOne!.mockResolvedValue(session);
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(3, dto([7]));

            expect(saved[0].classSession).toBe(session);
            // Still written, and still the session's own group — see the comment on the column.
            expect(saved[0].group).toBe(session.group);
        });

        it('rejects a class session that does not exist', async () => {
            classSessionRepo.findOne!.mockResolvedValue(null);

            await expect(service.createAttendance(99, dto([7]))).rejects.toThrow(NotFoundException);
        });

        it('refuses to mark a cancelled session', async () => {
            // A class that did not happen has neither present nor absent children. The session is
            // the thing that is wrong here, so it is the thing that has to be corrected first.
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }], { status: ClassSessionStatus.CANCELLED }));

            await expect(service.createAttendance(3, dto([7]))).rejects.toThrow(BadRequestException);
            expect(attendanceRepo.save).not.toHaveBeenCalled();
        });

        it('marks a session that has already been held, so a correction can be added', async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }], { status: ClassSessionStatus.HELD }));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await expect(service.createAttendance(3, dto([7]))).resolves.toHaveLength(1);
        });

        it('requires every child in the group to appear in the request', async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }, { id: 8 }]));

            await expect(service.createAttendance(3, dto([7]))).rejects.toThrow(BadRequestException);
        });

        it('rejects a child that does not exist', async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([]));
            childRepo.findByIds!.mockResolvedValue([]);

            await expect(service.createAttendance(3, dto([99]))).rejects.toThrow(NotFoundException);
        });

        it('rejects marking the same session twice', async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }]));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([{ id: 1, child: { id: 7 } }]);

            await expect(service.createAttendance(3, dto([7]))).rejects.toThrow(ConflictException);
            expect(attendanceRepo.save).not.toHaveBeenCalled();
        });

        it('looks for duplicates within the session, not across a date and an hour', async () => {
            // This is `@Unique(['child', 'classSession'])` restated as a query. The old check asked
            // for `{ child, date, startTime }`, which meant two groups could not both be marked at
            // 16:00 without the check reasoning about hours that were only ever a description.
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }]));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.createAttendance(3, dto([7]));

            const where = attendanceRepo.find!.mock.calls[0][0].where as Record<string, unknown>;
            expect(where.classSession).toEqual({ id: 3 });
            expect(where).not.toHaveProperty('date');
            expect(where).not.toHaveProperty('startTime');
        });
    });

    describe('getAttendanceByChild', () => {
        it("forbids a parent from seeing another child's attendance", async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 999 } } });

            await expect(service.getAttendanceByChild(1, 'PARENT', 5)).rejects.toThrow(ForbiddenException);
        });

        it("lets a parent see their own child's attendance", async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 5 } } });
            attendanceRepo.find!.mockResolvedValue([]);

            await expect(service.getAttendanceByChild(1, 'PARENT', 5)).resolves.toEqual([]);
        });

        it("lets an admin see anyone's attendance", async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 999 } } });
            attendanceRepo.find!.mockResolvedValue([]);

            await expect(service.getAttendanceByChild(1, 'ADMIN', 5)).resolves.toEqual([]);
        });

        it('rejects a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.getAttendanceByChild(99, 'ADMIN', 5)).rejects.toThrow(NotFoundException);
        });

        it('loads the session with the record, since the date and the hours are only there now', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 5 } } });
            attendanceRepo.find!.mockResolvedValue([]);

            await service.getAttendanceByChild(1, 'PARENT', 5);

            const options = attendanceRepo.find!.mock.calls[0][0] as Record<string, Record<string, unknown>>;
            expect(options.relations.classSession).toBeTruthy();
            // Still scoped to the one child, which is what the authorization check above is for.
            expect(options.where).toEqual({ child: { id: 1 } });
        });
    });

    describe('updateAttendanceStatus', () => {
        it('changes the presence flag', async () => {
            const record = { id: 1, present: false };
            attendanceRepo.findOne!.mockResolvedValue(record);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.updateAttendanceStatus(1, true);

            expect(record.present).toBe(true);
        });

        it('rejects a record that does not exist', async () => {
            attendanceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateAttendanceStatus(99, true)).rejects.toThrow(NotFoundException);
        });
    });
});
