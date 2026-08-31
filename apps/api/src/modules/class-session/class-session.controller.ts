import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { ClassSessionService } from './class-session.service';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { CancelClassSessionDto } from './dto/cancelClassSession.dto';
import { CreateNonTeachingPeriodDto } from './dto/nonTeachingPeriod.dto';
import { FilterClassSessionDto } from './dto/filterClassSession.dto';
import { GenerateClassSessionsDto } from './dto/generateClassSessions.dto';
import { UnmarkedClassSessionsDto } from './dto/unmarkedClassSessions.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('class-sessions')
export class ClassSessionController {
    constructor(
        private readonly classSessionService: ClassSessionService,
        private readonly nonTeachingPeriodService: NonTeachingPeriodService,
    ) {}

    @Post('generate')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Write the next weeks of timetable from the group schedule',
        description:
            'Idempotent: a session that already exists for a group on a day is left untouched, whatever its status, so re-running never resurrects a cancelled class. ' +
            'There is no holiday calendar yet (E12/S2), so sessions are generated on every week including school holidays; cancel those by hand.',
    })
    @ApiResponse({ status: 201, description: 'Sessions generated; the response says how many were created and how many were already there' })
    @ApiResponse({ status: 404, description: 'Group not found' })
    @ApiResponse({ status: 409, description: 'The group is inactive' })
    async generateSessions(@Body() generateClassSessionsDto: GenerateClassSessionsDto) {
        return this.classSessionService.generateSessions(generateClassSessionsDto);
    }

    /**
     * Readable by any authenticated user, but not the same rows for everyone: an admin gets the
     * whole school's timetable, a parent gets only the groups their own children are in. The
     * narrowing is in the service, off `req.user`, which is the only place identity may come from —
     * a group id in the query string is a request, not a claim.
     *
     * No `@Roles`, therefore, and no 403 for a parent asking about somebody else's group: the
     * answer is an empty list, because the rows are simply not theirs to see. `hasAttendance` stays
     * a boolean about the class, never about a named child.
     */
    /**
     * The days the school does not teach — E12/S2.
     *
     * Declared above the parameter routes: Nest matches in declaration order, and a literal placed
     * after `:id` would be parsed as an id.
     */
    @Get('non-teaching')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Vacanțele și zilele libere, în ordine cronologică' })
    @ApiResponse({ status: 200, description: 'Every non-teaching period, soonest first' })
    async nonTeachingPeriods() {
        return this.nonTeachingPeriodService.findAll();
    }

    @Get('non-teaching/impact')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Ce ar anula un interval, înainte să fie adăugat',
        description: 'Plasa de siguranță a ecranului: o dată tastată greșit se vede ca „grupa de luni pierde 8 ședințe", nu ca un gol descoperit în ianuarie.',
    })
    @ApiResponse({ status: 200, description: 'Scheduled sessions the period would cancel, grouped' })
    async nonTeachingImpact(@Query('startDate') startDate: string, @Query('endDate') endDate: string, @Query('locationId') locationId?: string) {
        return this.nonTeachingPeriodService.impactOf({ startDate, endDate, locationId: locationId ? Number(locationId) : null });
    }

    @Post('non-teaching')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Adaugă un interval fără curs și anulează ședințele din el',
        description: 'Anulează, nu șterge: o ședință care era în orar și nu s-a ținut e un fapt despre trimestru.',
    })
    @ApiResponse({ status: 201, description: 'Period added, with how many sessions it cancelled' })
    @ApiResponse({ status: 409, description: 'PERIOD_OVERLAPS' })
    async createNonTeachingPeriod(@Body() dto: CreateNonTeachingPeriodDto) {
        return this.nonTeachingPeriodService.create(dto);
    }

    @Delete('non-teaching/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Șterge un interval',
        description: 'Ședințele pe care le-a anulat rămân anulate — reactivarea e o decizie per ședință, prin ruta ei.',
    })
    @ApiResponse({ status: 200, description: 'Removed' })
    async removeNonTeachingPeriod(@Param('id', ParseIntPipe) id: number) {
        return this.nonTeachingPeriodService.remove(id);
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({
        summary: 'The timetable, filtered',
        description:
            'ADMIN sees every group. PARENT sees only sessions of groups their own children belong to; anything else is absent from the list rather than refused.',
    })
    @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
    @ApiResponse({ status: 400, description: 'The interval is reversed, or a date is not a real day' })
    async getSessions(@Query() filters: FilterClassSessionDto, @Request() req: AuthenticatedRequest) {
        return this.classSessionService.findSessions(filters, req.user.role, req.user.sub);
    }

    /**
     * ADMIN, unlike the list above, and deliberately so. "Which classes did nobody take the register
     * for" is an operations report about staff, not timetable information a parent needs; the daily
     * reminder built on it goes to the school office for the same reason.
     *
     * Nothing shadows this route today, because there is no `GET /class-sessions/:id`. If one is
     * ever added it has to be declared *after* this handler, or `unmarked` arrives at `ParseIntPipe`.
     */
    @Get('unmarked')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Scheduled sessions in the interval with no attendance recorded',
        description: 'Cancelled and already-held sessions are excluded. Both ends of the interval are inclusive.',
    })
    @ApiResponse({ status: 200, description: 'Unmarked sessions retrieved successfully' })
    @ApiResponse({ status: 400, description: 'The interval is reversed, or a date is not a real day' })
    async getUnmarkedSessions(@Query() range: UnmarkedClassSessionsDto) {
        return this.classSessionService.findUnmarkedSessions(range);
    }

    @Put(':id/cancel')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Call off one class, with the reason' })
    @ApiResponse({ status: 200, description: 'Session cancelled' })
    @ApiResponse({ status: 404, description: 'Class session not found' })
    @ApiResponse({ status: 409, description: 'Already cancelled, or attendance has already been recorded for it' })
    async cancelSession(@Param('id', ParseIntPipe) id: number, @Body() cancelClassSessionDto: CancelClassSessionDto) {
        return this.classSessionService.cancelSession(id, cancelClassSessionDto);
    }

    @Put(':id/reinstate')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Put back a class that was called off',
        description:
            'For the cancellation made by mistake, or the class taught anyway. Without it the mistake is a dead end: attendance refuses a cancelled session, and generation is idempotent so it never resurrects one. The session returns to `scheduled`, not `held` — reinstating says the class exists again, not that anyone has confirmed it happened.',
    })
    @ApiResponse({ status: 200, description: 'Session reinstated' })
    @ApiResponse({ status: 404, description: 'Class session not found' })
    @ApiResponse({ status: 409, description: 'The session is not cancelled' })
    async reinstateSession(@Param('id', ParseIntPipe) id: number) {
        return this.classSessionService.reinstateSession(id);
    }
}
