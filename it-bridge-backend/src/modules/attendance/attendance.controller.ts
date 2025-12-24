import { Body, Controller, Get, Param, Post, UseGuards, Request, Put, Patch, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceService } from './attendance.service';
import { markAttendanceDto } from './dto/markAttendance.dto';

@Controller('attendance')
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) {}
    @Post('/:groupId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Attendance record created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 404, description: 'Not Found' })
    @ApiResponse({ status: 409, description: 'Conflict: Attendance record already exists' })
    async createAttendance(@Param('groupId', ParseIntPipe) groupId: number, @Body() markAttendanceDto: markAttendanceDto) {
        return this.attendanceService.createAttendance(groupId, markAttendanceDto);
    }

    @Get('child/:childId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Attendance records retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getAttendanceByChild(@Param('childId', ParseIntPipe) childId: number, @Request() req) {
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
