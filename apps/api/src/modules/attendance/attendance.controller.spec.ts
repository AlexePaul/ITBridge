import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AbsenceNoticeService } from './absence-notice.service';
import { MakeUpCreditService } from './make-up-credit.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('AttendanceController', () => {
    const build = () =>
        buildController(
            AttendanceController,
            AttendanceService,
            {
                createAttendance: jest.fn().mockResolvedValue([]),
                getAttendanceByChild: jest.fn().mockResolvedValue([]),
                updateAttendanceStatus: jest.fn().mockResolvedValue({ id: 1 }),
            },
            [
                { provide: AbsenceNoticeService, useValue: absenceNotices },
                { provide: MakeUpCreditService, useValue: makeUpCredits },
            ],
        );

    /** E12/S3's service, shared by the whole file so a test can assert what it was handed. */
    const absenceNotices = {
        announce: jest.fn().mockResolvedValue({ id: 1 }),
        upcoming: jest.fn().mockResolvedValue([]),
        withdraw: jest.fn().mockResolvedValue({ message: '' }),
        forSession: jest.fn().mockResolvedValue(new Map()),
    };

    /** E12/S4's service — the controller only forwards to it. */
    const makeUpCredits = {
        listFor: jest.fn().mockResolvedValue([]),
        optionsFor: jest.fn().mockResolvedValue([]),
        book: jest.fn().mockResolvedValue({ id: 1 }),
        cancelBooking: jest.fn().mockResolvedValue({ id: 1 }),
    };

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

    it('announceAbsence carries the role and user id, so the service can check whose child it is', async () => {
        const { controller } = await build();
        await controller.announceAbsence({ childId: 5, classSessionId: 9, reason: 'Răcit' }, requestOf(Role.PARENT, 42));
        expect(absenceNotices.announce.mock.calls[0].slice(-2)).toEqual([Role.PARENT, 42]);
    });

    it('bookMakeUp forwards the session from the body and the caller from the token', async () => {
        const { controller } = await build();
        await controller.bookMakeUp(4, { classSessionId: 12 }, requestOf(Role.PARENT, 42));
        expect(makeUpCredits.book).toHaveBeenCalledWith(4, 12, Role.PARENT, 42);
    });
});
