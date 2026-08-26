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
         * Testele astea fixează valorile scrise în coloana `type`. Există pentru că sunt ușor de
         * dedus greșit: default-ul coloanei din entitate e `'normal'`, iar exemplul din
         * `@ApiProperty` spune `'catch-up'` — dar serviciul nu scrie niciodată niciuna dintre ele.
         * Frontend-ul își cheia etichetele pe valorile de aici, deci o divergență lasă coloana
         * „Tip Sesiune" goală.
         */
        it("scrie 'regular' pentru un copil din grupa lui", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([7]));

            expect(saved[0].type).toBe('regular');
        });

        it("scrie 'make-up' pentru un copil care nu e în grupă, adică vine în recuperare", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [] });
            childRepo.findByIds!.mockResolvedValue([{ id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([9]));

            expect(saved[0].type).toBe('make-up');
        });

        it("nu scrie niciodată 'normal' sau 'catch-up'", async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }, { id: 9 }]);
            attendanceRepo.find!.mockResolvedValue([]);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            const saved = await service.createAttendance(1, dto([7, 9]));

            expect(saved.map((r) => r.type)).not.toContain('normal');
            expect(saved.map((r) => r.type)).not.toContain('catch-up');
        });

        it('respinge o grupă inexistentă', async () => {
            groupRepo.findOne!.mockResolvedValue(null);
            await expect(service.createAttendance(99, dto([7]))).rejects.toThrow(NotFoundException);
        });

        it('cere ca toți copiii din grupă să apară în cerere', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }, { id: 8 }] });

            await expect(service.createAttendance(1, dto([7]))).rejects.toThrow(BadRequestException);
        });

        it('respinge un copil care nu există', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [] });
            childRepo.findByIds!.mockResolvedValue([]);

            await expect(service.createAttendance(1, dto([99]))).rejects.toThrow(NotFoundException);
        });

        it('respinge marcarea de două ori a aceleiași ședințe', async () => {
            groupRepo.findOne!.mockResolvedValue({ id: 1, children: [{ id: 7 }] });
            childRepo.findByIds!.mockResolvedValue([{ id: 7 }]);
            attendanceRepo.find!.mockResolvedValue([{ id: 1, child: { id: 7 } }]);

            await expect(service.createAttendance(1, dto([7]))).rejects.toThrow(ConflictException);
            expect(attendanceRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('getAttendanceByChild', () => {
        it('interzice părintelui prezența copilului altcuiva', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 999 } } });

            await expect(service.getAttendanceByChild(1, 'PARENT', 5)).rejects.toThrow(ForbiddenException);
        });

        it('lasă părintele să vadă prezența propriului copil', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 5 } } });
            attendanceRepo.find!.mockResolvedValue([]);

            await expect(service.getAttendanceByChild(1, 'PARENT', 5)).resolves.toEqual([]);
        });

        it('lasă adminul să vadă prezența oricui', async () => {
            childRepo.findOne!.mockResolvedValue({ id: 1, parent: { user: { id: 999 } } });
            attendanceRepo.find!.mockResolvedValue([]);

            await expect(service.getAttendanceByChild(1, 'ADMIN', 5)).resolves.toEqual([]);
        });

        it('respinge un copil inexistent', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.getAttendanceByChild(99, 'ADMIN', 5)).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateAttendanceStatus', () => {
        it('schimbă prezența', async () => {
            const record = { id: 1, present: false };
            attendanceRepo.findOne!.mockResolvedValue(record);
            attendanceRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));

            await service.updateAttendanceStatus(1, true);

            expect(record.present).toBe(true);
        });

        it('respinge o înregistrare inexistentă', async () => {
            attendanceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateAttendanceStatus(99, true)).rejects.toThrow(NotFoundException);
        });
    });
});
