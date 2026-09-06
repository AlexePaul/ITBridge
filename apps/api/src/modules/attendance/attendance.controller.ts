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
import { ReplacementService } from './replacement.service';
import { PlaceReplacementDto } from './dto/placeReplacement.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('attendance')
export class AttendanceController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly absenceNoticeService: AbsenceNoticeService,
        private readonly replacementService: ReplacementService,
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
     * Recording that a child will miss a class — E12/S3, and **the office does it**.
     *
     * It used to be the parent's, from a button in the portal, and the guard was deliberately open
     * with the row-level check left to the service. The school changed the shape of the thing:
     * families ring, message or email, and somebody here writes it down along with the reason. The
     * button is gone from `/user/absente`, and leaving the endpoint reachable would have made the
     * rule true only of the screen — which is the same as not being true.
     */
    @Post('absences')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Notice recorded, with whether it arrived in time' })
    @ApiResponse({ status: 400, description: 'CHILD_NOT_IN_SESSION_GROUP' })
    @ApiResponse({ status: 403, description: 'Only the office records absences' })
    @ApiResponse({ status: 404, description: 'No such child, or no such session' })
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

    /**
     * The child is coming after all.
     *
     * Admin too, and for the same reason: withdrawing an announcement is the same act as making
     * one, and it comes back down the same phone line.
     */
    @Delete('absences/:id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Notice withdrawn' })
    @ApiResponse({ status: 403, description: 'Only the office records absences' })
    async withdrawAbsence(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.absenceNoticeService.withdraw(id, req.user.role, req.user.sub);
    }

    /**
     * This week's announced absences nobody has placed yet — the office's Monday list, E12/S4.
     *
     * Admin only, and not because the data is secret: it is a worklist, and a parent has nothing to
     * do with it. The question it answers used to be asked of families by an expiry reminder, which
     * was addressed to somebody who could not act on it.
     */
    @Get('replacements/unplaced')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Announced absences in the current week with no replacement class yet' })
    async unplacedReplacements() {
        return this.replacementService.unplaced();
    }

    /** The classes this child could be moved into: same week, other group, right age, a free seat. */
    @Get('absences/:id/replacement-options')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Compatible sessions, soonest first' })
    @ApiResponse({ status: 404, description: 'No such absence notice' })
    async replacementOptions(@Param('id', ParseIntPipe) id: number) {
        return this.replacementService.optionsFor(id);
    }

    /**
     * Records the move and writes to the family — E12/S4. Everything the options list filtered on is
     * re-checked, because a seat can go between reading it and pressing the button.
     */
    @Put('absences/:id/replacement')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Moved; the family has been written to' })
    @ApiResponse({ status: 400, description: 'REPLACEMENT_SAME_GROUP' })
    @ApiResponse({
        status: 409,
        description: 'CLASS_SESSION_CANCELLED, REPLACEMENT_OUT_OF_WEEK, REPLACEMENT_SESSION_STARTED, REPLACEMENT_AGE_MISMATCH or REPLACEMENT_SESSION_FULL',
    })
    async placeReplacement(@Param('id', ParseIntPipe) id: number, @Body() dto: PlaceReplacementDto) {
        return this.replacementService.place(id, dto.classSessionId);
    }

    /** Undoes the move. Silent by design — see the service. */
    @Delete('absences/:id/replacement')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'The move is cleared; the absence stands' })
    async clearReplacement(@Param('id', ParseIntPipe) id: number) {
        return this.replacementService.clear(id);
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
