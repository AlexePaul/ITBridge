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

    it('createAttendance passes the class session id from the path, and a body with nothing else in it', async () => {
        // The path parameter used to be a group id and the body carried the date and the hour. Both
        // moved: the session is the class, and it is named rather than described.
        const { controller, service } = await build();
        const body = { childrenAttendance: [{ childId: 7, present: true }] };

        await controller.createAttendance(3, body);

        expect((service.createAttendance as jest.Mock).mock.calls[0]).toEqual([3, body]);
    });
});
