import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Attendance } from 'src/entities/attendance.entity';
import { Group } from 'src/entities/group.entity';
import { Child } from 'src/entities/child.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('AttendanceService', () => {
    let service: AttendanceService;
    let attendanceRepo: MockRepository;
    let groupRepo: MockRepository;
    let childRepo: MockRepository;

    const dto = (childIds: number[]) => ({
        childrenAttendance: childIds.map((childId) => ({ childId, present: true })),
        date: '2026-03-10',
        startTime: '09:00',
    });

    beforeEach(async () => {
        attendanceRepo = createMockRepository();
        attendanceRepo.findByIds = jest.fn();
        groupRepo = createMockRepository();
        childRepo = createMockRepository();
        childRepo.findByIds = jest.fn();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AttendanceService,
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(Group, groupRepo),
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
         */
        it("writes 'regular' for a child who belongs to the group", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([7]));

            expect(saved[0].type).toBe('regular');
        });

        it("writes 'make-up' for a child outside the group, i.e. attending a catch-up session", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [] });
            childRepo.findByIds!.mockResolvedValue([{ id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([9]));

            expect(saved[0].type).toBe('make-up');
        });

        it("never writes 'normal' or 'catch-up'", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }, { id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([7, 9]));

            expect(saved.map((r) => r.type)).not.toContain('normal');
            expect(saved.map((r) => r.type)).not.toContain('catch-up');
        });

        it('rejects a group that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue(null);
            await expect(service.createAttendance(99, dto([7]))).rejects.toThrow(NotFoundException);
        });

        it('requires every child in the group to appear in the request', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }, { id: 8 }] });

            await expect(service.createAttendance(1, dto([7]))).rejects.toThrow(BadRequestException);
        });

        it('rejects a child that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [] });
            childRepo.findByIds!.mockResolvedValue([]);

            await expect(service.createAttendance(1, dto([99]))).rejects.toThrow(NotFoundException);
        });

        it('rejects marking the same session twice', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([{ id: 1, child: { id: 7 } }]);

            await expect(service.createAttendance(1, dto([7]))).rejects.toThrow(ConflictException);
            expect(attendanceRepo.save).not.toHaveBeenCalled();
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
