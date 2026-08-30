import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentDto } from './dto/createEnrollment.dto';
import { CloseEnrollmentDto } from './dto/closeEnrollment.dto';
import { CreateWaitlistEntryDto } from './dto/createWaitlistEntry.dto';
import { RemoveWaitlistEntryDto } from './dto/removeWaitlistEntry.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

/**
 * Enrolments and the waiting list — E11/S1 and S3.
 *
 * **Every handler here is admin-only, including the reads.** D2 is the reason: the school decides
 * who is in which group, and a parent has no decision to make here and nothing to see that
 * `GET /children` does not already give them, scoped to their own family. The authorization matrix
 * in `apps/api/src/authorization.spec.ts` enumerates these handlers on its own, so an endpoint
 * added here without `@Roles` shows up there without anyone writing a test.
 */
@Controller('enrollments')
export class EnrollmentController {
    constructor(private readonly enrollmentService: EnrollmentService) {}

    @Get('child/:childId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Istoricul înscrierilor unui copil',
        description: 'Răspunde la „în ce grupă era copilul pe 15 octombrie" — întrebarea pe care cheia străină de pe Child nu o putea răspunde.',
    })
    @ApiResponse({ status: 200, description: 'Enrollment history, newest first' })
    async historyFor(@Param('childId', ParseIntPipe) childId: number) {
        return this.enrollmentService.historyFor(childId);
    }

    @Get('group/:groupId/members')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Cine era în grupă la o dată anume' })
    @ApiResponse({ status: 200, description: 'Enrollments covering that date' })
    async membersOn(@Param('groupId', ParseIntPipe) groupId: number, @Query('date') date?: string) {
        return this.enrollmentService.membersOn(groupId, date ?? new Date().toISOString().slice(0, 10));
    }

    @Get('group/:groupId/occupancy')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Locuri ocupate și libere',
        description: 'Ocupate = înscrieri în vigoare, adică active plus probe programate. Niciodată doar primele — vezi D7.',
    })
    @ApiResponse({ status: 200, description: 'Seats taken, free, and the length of the queue' })
    async occupancy(@Param('groupId', ParseIntPipe) groupId: number) {
        return this.enrollmentService.occupancyOf(groupId);
    }

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Înscrie un copil într-o grupă, activ sau la probă' })
    @ApiResponse({ status: 201, description: 'Enrolled' })
    @ApiResponse({ status: 409, description: 'CHILD_ALREADY_ENROLLED, GROUP_FULL, GROUP_INACTIVE or PARENT_ACCOUNT_NOT_ACTIVE' })
    async enrol(@Body() createEnrollmentDto: CreateEnrollmentDto, @Request() req: AuthenticatedRequest) {
        return this.enrollmentService.enrol(createEnrollmentDto, req.user.sub);
    }

    @Put(':id/close')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Închide o înscriere și eliberează locul',
        description: 'Locul eliberat e oferit imediat primei familii de pe lista de așteptare, în aceeași tranzacție.',
    })
    @ApiResponse({ status: 200, description: 'Closed' })
    @ApiResponse({ status: 409, description: 'ENROLLMENT_ALREADY_CLOSED' })
    async close(@Param('id', ParseIntPipe) id: number, @Body() closeEnrollmentDto: CloseEnrollmentDto) {
        return this.enrollmentService.close(id, closeEnrollmentDto);
    }

    @Get('waitlist/group/:groupId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lista de așteptare a unei grupe, în ordinea în care s-a cerut' })
    @ApiResponse({ status: 200, description: 'Open waitlist entries, oldest first' })
    async waitlist(@Param('groupId', ParseIntPipe) groupId: number) {
        return this.enrollmentService.waitlistFor(groupId);
    }

    @Post('waitlist')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Pune un copil pe lista de așteptare a unei grupe' })
    @ApiResponse({ status: 201, description: 'Added' })
    @ApiResponse({ status: 409, description: 'ALREADY_ON_WAITLIST' })
    async addToWaitlist(@Body() createWaitlistEntryDto: CreateWaitlistEntryDto) {
        return this.enrollmentService.addToWaitlist(createWaitlistEntryDto);
    }

    @Delete('waitlist/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Scoate o cerere de pe listă',
        description: 'Dacă cererea avea un loc oferit, locul trece imediat la următoarea familie.',
    })
    @ApiResponse({ status: 200, description: 'Removed' })
    async removeFromWaitlist(@Param('id', ParseIntPipe) id: number, @Body() removeWaitlistEntryDto: RemoveWaitlistEntryDto) {
        return this.enrollmentService.removeFromWaitlist(id, removeWaitlistEntryDto.status);
    }
}
