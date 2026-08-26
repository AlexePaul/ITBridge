import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('AttendanceController', () => {
    const build = () =>
        buildController(AttendanceController, AttendanceService, {
            createAttendance: jest.fn().mockResolvedValue([]),
            getAttendanceByChild: jest.fn().mockResolvedValue([]),
            updateAttendanceStatus: jest.fn().mockResolvedValue({ id: 1 }),
        });

    it('getAttendanceByChild receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.getAttendanceByChild(7, requestOf(Role.PARENT, 42));
        expect((service.getAttendanceByChild as jest.Mock).mock.calls[0].slice(-2)).toEqual([Role.PARENT, 42]);
    });
});
