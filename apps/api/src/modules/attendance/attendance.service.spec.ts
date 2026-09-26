import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AbsenceNoticeService } from './absence-notice.service';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
import { Lead } from 'src/entities/lead.entity';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';

describe('AttendanceService', () => {
    let service: AttendanceService;
    let attendanceRepo: MockRepository;
    let classSessionRepo: MockRepository;
    let childRepo: MockRepository;
    let leadRepo: MockRepository;
    /** Who was in the group on the class's day (E11); nobody unless a test says so. */
    const membersOnMock = jest.fn();

    /**
     * The body no longer carries a date or an hour — the class is the `classSessionId` in the path.
     * These tests used to build `{ childrenAttendance, date: '2026-03-10', startTime: '09:00' }`;
     * the date and the hour now belong to the session the first argument names.
     */
    const dto = (childIds: number[]) => ({
        childrenAttendance: childIds.map((childId) => ({ childId, present: true })),
    });

    /**
     * A scheduled session for group 1, with whichever children the test wants enrolled — on the
     * class's day, which is what the register asks since the review of 26 September 2026
     * (`EnrollmentService.membersOn`), not the group's roster today.
     */
    const sessionWith = (children: { id: number }[], overrides: Record<string, unknown> = {}) => {
        membersOnMock.mockResolvedValue(children.map((child) => ({ status: EnrollmentStatus.ACTIVE, trialUntil: null, child })));
        return {
            id: 3,
            status: ClassSessionStatus.SCHEDULED,
            date: '2026-03-10',
            startTime: '16:00',
            group: { id: 1 },
            ...overrides,
        };
    };

    /** The school calendar of announced absences; empty unless a test says otherwise. */
    const forSessionMock = jest.fn();
    /** The children the office moved into a class for the week (E12/S4); none unless a test says so. */
    const placedInMock = jest.fn();
    /** E20/S3: the register is what moves a trial lead. Asserted for real in the lead suites. */
    const leadProgress = {
        markTrialHeld: jest.fn().mockResolvedValue(undefined),
        revertTrialHeld: jest.fn().mockResolvedValue(undefined),
        settleForEnrollment: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        forSessionMock.mockResolvedValue(new Map());
        placedInMock.mockResolvedValue([]);
        leadProgress.markTrialHeld.mockClear();
        leadProgress.revertTrialHeld.mockClear();
        attendanceRepo = createMockRepository();
        attendanceRepo.findByIds = jest.fn();
        classSessionRepo = createMockRepository();
        childRepo = createMockRepository();
        childRepo.findByIds = jest.fn();
        leadRepo = createMockRepository();
        leadRepo.find!.mockResolvedValue([]);
        membersOnMock.mockResolvedValue([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AttendanceService,
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(ClassSession, classSessionRepo),
                provideMockRepository(Child, childRepo),
                provideMockRepository(Lead, leadRepo),
                { provide: EnrollmentService, useValue: { membersOn: membersOnMock } },
                { provide: AbsenceNoticeService, useValue: { forSession: forSessionMock, placedIn: placedInMock } },
                // E20/S3 hangs off marking; it runs with a double that does nothing, so a register
                // test never becomes a lead test by accident. E12/S4 used to hang off the same
                // mark and no longer does — a make-up is a placement the office records before the
                // class, not a consequence the register works out afterwards.
                { provide: LeadProgressService, useValue: leadProgress },
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

        it("asks for the group as it was on the class's day, not as it is today", async () => {
            classSessionRepo.findOne!.mockResolvedValue(sessionWith([{ id: 7 }]));
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.createAttendance(3, dto([7]));

            expect(membersOnMock).toHaveBeenCalledWith(1, '2026-03-10');
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

    describe('sessionRegister', () => {
        const child = (id: number, first: string, last: string, phone: string | null = '0712345678') => ({
            id,
            firstName: first,
            lastName: last,
            parent: phone === null ? {} : { phone },
        });

        /** The group on the class's day: its enrolments, and the children the register loads for them. */
        const groupOnTheDay = (...children: ReturnType<typeof child>[]) => {
            membersOnMock.mockResolvedValue(children.map((c) => ({ status: EnrollmentStatus.ACTIVE, trialUntil: null, child: { id: c.id } })));
            childRepo.find!.mockResolvedValue(children);
        };

        beforeEach(() => {
            classSessionRepo.findOne!.mockResolvedValue({
                id: 9,
                date: '2026-09-07',
                startTime: '16:00:00',
                endTime: '17:30:00',
                status: ClassSessionStatus.SCHEDULED,
                group: { id: 5, name: 'Scratch' },
            });
            groupOnTheDay(child(2, 'Ana', 'Pop'), child(1, 'Vlad', 'Ionescu'));
            attendanceRepo.find!.mockResolvedValue([]);
        });

        it("lists the group on the class's day, read from the enrolments", async () => {
            await service.sessionRegister(9);

            expect(membersOnMock).toHaveBeenCalledWith(5, '2026-09-07');
        });

        it('lists nobody the enrolments did not have in the group that day, unless they have a mark', async () => {
            groupOnTheDay();

            expect((await service.sessionRegister(9)).entries).toEqual([]);
        });

        it('lists every child of the group, sorted by name, with no mark as null', async () => {
            const register = await service.sessionRegister(9);

            expect(register.entries.map((entry) => entry.lastName)).toEqual(['Ionescu', 'Pop']);
            // Three-valued on purpose: "nobody has said yet" is a different fact from absent.
            expect(register.entries[0]).toMatchObject({ present: null, attendanceId: null, parentPhone: '0712345678' });
        });

        it('carries the existing marks, so a half-marked register reopens as it was left', async () => {
            attendanceRepo.find!.mockResolvedValue([{ id: 31, present: false, type: AttendanceType.REGULAR, child: child(2, 'Ana', 'Pop') }]);

            const register = await service.sessionRegister(9);

            const ana = register.entries.find((entry) => entry.childId === 2);
            expect(ana).toMatchObject({ present: false, attendanceId: 31 });
        });

        it('includes a make-up child who is marked here but not in the group', async () => {
            attendanceRepo.find!.mockResolvedValue([{ id: 32, present: true, type: AttendanceType.MAKE_UP, child: child(7, 'Dan', 'Radu') }]);

            const register = await service.sessionRegister(9);

            // Dropping the row would hide a mark the bulk endpoint wrote.
            expect(register.entries.find((entry) => entry.childId === 7)).toMatchObject({ type: AttendanceType.MAKE_UP, present: true });
        });

        /**
         * The end-to-end testing of 25 September 2026: a child the office moved here for the week
         * appeared only once somebody had marked them — and the phone screen offers no way to add
         * anybody, so nobody could.
         */
        it('lists a child the office moved here for the week before anybody has marked them, and says from where', async () => {
            placedInMock.mockResolvedValue([{ child: { ...child(7, 'Dan', 'Radu'), group: { id: 6, name: 'Python' } } }]);

            const register = await service.sessionRegister(9);

            expect(register.entries.find((entry) => entry.childId === 7)).toMatchObject({
                type: AttendanceType.MAKE_UP,
                present: null,
                attendanceId: null,
                visitingFrom: 'Python',
            });
            // The group's own are not visitors.
            expect(register.entries.find((entry) => entry.childId === 2)?.visitingFrom).toBeNull();
        });

        it('lists a moved child once, however many ways they come to be on it', async () => {
            const dan = { ...child(7, 'Dan', 'Radu'), group: { id: 6, name: 'Python' } };
            attendanceRepo.find!.mockResolvedValue([{ id: 33, present: true, type: AttendanceType.MAKE_UP, child: dan }]);
            placedInMock.mockResolvedValue([{ child: dan }]);

            const register = await service.sessionRegister(9);

            expect(register.entries.filter((entry) => entry.childId === 7)).toEqual([
                expect.objectContaining({ present: true, attendanceId: 33, visitingFrom: 'Python' }),
            ]);
        });

        it('answers null for a family with no phone, not a button that dials nowhere', async () => {
            groupOnTheDay(child(2, 'Ana', 'Pop', null));

            const register = await service.sessionRegister(9);
            expect(register.entries[0].parentPhone).toBeNull();
        });

        /**
         * The review of 26 September 2026: a child booked on `/proba` belongs to a shell profile with
         * no phone, by design — the number the family typed is on the lead. The register read the
         * profile alone, so the call button was missing for exactly the family the teacher knows least.
         */
        it('fills in the number a /proba family left on the booking when the profile has none', async () => {
            groupOnTheDay(child(2, 'Ana', 'Pop', null), child(1, 'Vlad', 'Ionescu'));
            leadRepo.find!.mockResolvedValue([{ child: { id: 2 }, parentPhone: '+40722333444' }]);

            const register = await service.sessionRegister(9);

            expect(register.entries.find((entry) => entry.childId === 2)?.parentPhone).toBe('+40722333444');
            // The profile's own number still wins where there is one.
            expect(register.entries.find((entry) => entry.childId === 1)?.parentPhone).toBe('0712345678');
        });

        it('marks a child on a trial that day, as the desktop register does', async () => {
            membersOnMock.mockResolvedValue([
                { status: EnrollmentStatus.TRIAL, trialUntil: null, child: { id: 2 } },
                { status: EnrollmentStatus.ACTIVE, trialUntil: null, child: { id: 1 } },
            ]);

            const register = await service.sessionRegister(9);

            expect(membersOnMock).toHaveBeenCalledWith(5, '2026-09-07');
            expect(register.entries.find((entry) => entry.childId === 2)?.trial).toBe(true);
            expect(register.entries.find((entry) => entry.childId === 1)?.trial).toBe(false);
        });

        it('still marks a trial that was decided after the class — the day was the trial', async () => {
            membersOnMock.mockResolvedValue([{ status: EnrollmentStatus.ACTIVE, trialUntil: '2026-09-10', child: { id: 2 } }]);

            const register = await service.sessionRegister(9);

            expect(register.entries.find((entry) => entry.childId === 2)?.trial).toBe(true);
        });

        it('carries what the family announced, so the teacher knows before the lesson', async () => {
            forSessionMock.mockResolvedValue(new Map([[2, { reason: 'Răcit', inTime: true }]]));

            const register = await service.sessionRegister(9);

            expect(register.entries.find((entry) => entry.childId === 2)?.announcedAbsence).toEqual({ reason: 'Răcit', inTime: true });
            // Silence is a different fact from an announcement, and reads as null rather than as
            // an empty reason.
            expect(register.entries.find((entry) => entry.childId === 1)?.announcedAbsence).toBeNull();
        });

        it('404s on a session that does not exist', async () => {
            classSessionRepo.findOne!.mockResolvedValue(null);
            await expect(service.sessionRegister(99)).rejects.toThrow(NotFoundException);
        });
    });

    describe('upsertMark', () => {
        beforeEach(() => {
            classSessionRepo.findOne!.mockResolvedValue({
                id: 9,
                date: '2026-09-07',
                status: ClassSessionStatus.SCHEDULED,
                group: { id: 5 },
            });
            membersOnMock.mockResolvedValue([{ status: EnrollmentStatus.ACTIVE, trialUntil: null, child: { id: 2 } }]);
            childRepo.findOne!.mockResolvedValue({ id: 2 });
            attendanceRepo.findOne!.mockResolvedValue(null);
            attendanceRepo.save!.mockImplementation((record: unknown) => Promise.resolve(record));
        });

        it('creates the mark on the first tap, as a regular one for a group child', async () => {
            await service.upsertMark(9, 2, true);

            expect(attendanceRepo.save).toHaveBeenCalledWith(expect.objectContaining({ present: true, type: AttendanceType.REGULAR }));
        });

        it('rewrites the same row on a changed mind, instead of refusing a duplicate', async () => {
            const existing = { id: 31, present: true };
            attendanceRepo.findOne!.mockResolvedValue(existing);

            await service.upsertMark(9, 2, false);

            // The phone screen retries from a local queue, so the same mark may arrive twice; a
            // 409 here would turn every retry into an error.
            expect(existing.present).toBe(false);
            expect(attendanceRepo.save).toHaveBeenCalledWith(existing);
        });

        it('writes a make-up for a child outside the group', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 7 });

            await service.upsertMark(9, 7, true);

            expect(attendanceRepo.save).toHaveBeenCalledWith(expect.objectContaining({ type: AttendanceType.MAKE_UP }));
        });

        it('refuses a cancelled session — the class did not happen', async () => {
            classSessionRepo.findOne!.mockResolvedValue({ id: 9, status: ClassSessionStatus.CANCELLED, group: { children: [] } });

            await expect(service.upsertMark(9, 2, true)).rejects.toThrow(BadRequestException);
            expect(attendanceRepo.save).not.toHaveBeenCalled();
        });

        it('404s on a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.upsertMark(9, 99, true)).rejects.toThrow(NotFoundException);
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
            const record = { id: 1, present: false, child: { id: 4 }, classSession: { id: 42 } };
            attendanceRepo.findOne!.mockResolvedValue(record);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.updateAttendanceStatus(1, true);

            expect(record.present).toBe(true);
        });

        /**
         * The third way to write a mark (review of 25 September 2026). The other two settle the
         * trial's lead; a correction through this one left it where it was.
         */
        it('settles the lead the way the register does, both ways', async () => {
            const record = { id: 1, present: false, child: { id: 4 }, classSession: { id: 42 } };
            attendanceRepo.findOne!.mockResolvedValue(record);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.updateAttendanceStatus(1, true);
            expect(leadProgress.markTrialHeld).toHaveBeenCalledWith(4, 42);

            await service.updateAttendanceStatus(1, false);
            expect(leadProgress.revertTrialHeld).toHaveBeenCalledWith(4, 42);
        });

        it('rejects a record that does not exist', async () => {
            attendanceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateAttendanceStatus(99, true)).rejects.toThrow(NotFoundException);
        });
    });
});
