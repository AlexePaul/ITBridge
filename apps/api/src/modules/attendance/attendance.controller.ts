import { Body, Controller, Get, Param, Post, UseGuards, Request, Patch, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceService } from './attendance.service';
import { markAttendanceDto } from './dto/markAttendance.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('attendance')
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) {}

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
