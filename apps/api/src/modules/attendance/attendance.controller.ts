import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, Request, Patch, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceService } from './attendance.service';
import { markAttendanceDto } from './dto/markAttendance.dto';
import { UpsertMarkDto } from './dto/upsertMark.dto';
import { AnnounceAbsenceDto } from './dto/announceAbsence.dto';
import { AbsenceNoticeService } from './absence-notice.service';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('attendance')
export class AttendanceController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly absenceNoticeService: AbsenceNoticeService,
    ) {}

    /**
     * The path is `session/:classSessionId`, not `:groupId`.
     *
     * The change of shape is deliberate rather than a rename: had the parameter kept its position,
     * a client still sending a group id would have gone on succeeding and written the register
     * against whichever session happened to carry that number. A different path 404s instead.
     */
    @Post('session/:classSessionId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Attendance record created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 400, description: 'Bad Request: malformed body, a child of the group is missing, or the session is cancelled' })
    @ApiResponse({ status: 404, description: 'Not Found' })
    @ApiResponse({ status: 409, description: 'Conflict: Attendance record already exists' })
    async createAttendance(@Param('classSessionId', ParseIntPipe) classSessionId: number, @Body() markAttendanceDto: markAttendanceDto) {
        return this.attendanceService.createAttendance(classSessionId, markAttendanceDto);
    }

    /**
     * The whole register of one class, in one payload: session, children, existing marks, and the
     * parent's phone per child. One request because the caller is a phone in a classroom — E12/S6.
     */
    @Get('session/:classSessionId/register')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'The register: session, entries with marks and parent phones' })
    @ApiResponse({ status: 404, description: 'No such class session' })
    async sessionRegister(@Param('classSessionId', ParseIntPipe) classSessionId: number) {
        return this.attendanceService.sessionRegister(classSessionId);
    }

    /**
     * One tap, one mark — idempotent upsert, unlike the bulk POST above. The phone screen saves on
     * every tap and retries from a local queue, so the same mark may arrive twice and a changed
     * mind arrives as a second write; a duplicate here is a no-op, not a 409.
     */
    @Put('session/:classSessionId/child/:childId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Mark written' })
    @ApiResponse({ status: 400, description: 'The session is cancelled' })
    @ApiResponse({ status: 404, description: 'No such session or child' })
    async upsertMark(
        @Param('classSessionId', ParseIntPipe) classSessionId: number,
        @Param('childId', ParseIntPipe) childId: number,
        @Body() dto: UpsertMarkDto,
    ) {
        return this.attendanceService.upsertMark(classSessionId, childId, dto.present);
    }

    /**
     * A parent announcing that their child will miss a class — E12/S3. Not a guard's job to
     * restrict: the service checks the child is theirs, because that is a fact about rows.
     */
    @Post('absences')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 201, description: 'Notice recorded, with whether it arrived in time' })
    @ApiResponse({ status: 400, description: 'CHILD_NOT_IN_SESSION_GROUP' })
    @ApiResponse({ status: 404, description: 'No such child of yours, or no such session' })
    @ApiResponse({ status: 409, description: 'CLASS_SESSION_CANCELLED or ATTENDANCE_ALREADY_MARKED' })
    async announceAbsence(@Body() dto: AnnounceAbsenceDto, @Request() req: AuthenticatedRequest) {
        return this.absenceNoticeService.announce(dto, req.user.role, req.user.sub);
    }

    /** What has been announced for classes still to come. Admin sees the school, a parent their own. */
    @Get('absences')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Upcoming announced absences, soonest first' })
    async upcomingAbsences(@Request() req: AuthenticatedRequest) {
        return this.absenceNoticeService.upcoming(req.user.role, req.user.sub);
    }

    /** The child is coming after all. */
    @Delete('absences/:id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Notice withdrawn' })
    async withdrawAbsence(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.absenceNoticeService.withdraw(id, req.user.role, req.user.sub);
    }

    @Get('child/:childId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Attendance records retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getAttendanceByChild(@Param('childId', ParseIntPipe) childId: number, @Request() req: AuthenticatedRequest) {
        return this.attendanceService.getAttendanceByChild(childId, req.user.role, req.user.sub);
    }

    @Patch(':attendanceId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiQuery({ name: 'status', required: true, type: Boolean, description: 'Attendance status to be updated' })
    @ApiResponse({ status: 200, description: 'Attendance record updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Not Found' })
    async updateAttendance(@Param('attendanceId', ParseIntPipe) attendanceId: number, @Query('status') status: boolean) {
        return this.attendanceService.updateAttendanceStatus(attendanceId, status);
    }
}
