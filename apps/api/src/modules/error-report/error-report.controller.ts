import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { ErrorSource } from 'src/enum/error-source.enum';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { ErrorReportService } from './error-report.service';
import { QueryErrorReportsDto } from './dto/query-error-reports.dto';
import { ClientErrorDto } from './dto/client-error.dto';
import { ORIGIN_MAX_LENGTH, clip } from './error-report.rules';

/**
 * The error record — E06 S1: `/admin/erori` reads it, and a browser adds to it.
 *
 * `summary` and `client` are declared before `:id/resolve` out of habit rather than need — the depths
 * differ — so the order reads the way `ProjectController` asks for.
 */
@Controller('errors')
export class ErrorReportController {
    constructor(private readonly errorReports: ErrorReportService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'What broke, newest first',
        description:
            'The open reports by default. `?ref=` finds the report behind the code a screen showed — fixed or not, since whoever reads it out does not know. ADMIN only: the stack traces name the code, and the occurrences name the accounts.',
    })
    @ApiResponse({ status: 200, description: 'Matching reports, newest first' })
    async list(@Query() query: QueryErrorReportsDto) {
        return this.errorReports.list(query);
    }

    @Get('summary')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'How many reports are open — the number in the menu' })
    async summary() {
        return this.errorReports.summary();
    }

    /**
     * Any signed-in account, because the screens that break are the families' as much as the office's.
     * Throttled per address: the body is the caller's choice, and so is how often it is sent.
     */
    @Post('client')
    @UseGuards(AuthGuard)
    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'A screen broke in this browser', description: 'Recorded after the answer; the answer says nothing about the row.' })
    @ApiResponse({ status: 202, description: 'Taken' })
    async reportFromBrowser(@Request() req: AuthenticatedRequest, @Body() dto: ClientErrorDto): Promise<{ accepted: true }> {
        if (!(await this.errorReports.takesBrowserReport(req.user.sub))) return { accepted: true };
        this.errorReports.record({
            source: ErrorSource.BROWSER,
            origin: clip(dto.component ? `${dto.route} · ${dto.component}` : dto.route, ORIGIN_MAX_LENGTH),
            errorName: dto.name,
            message: dto.message,
            stack: dto.stack ?? null,
            code: dto.kind,
            ref: dto.reference ?? null,
            userId: req.user.sub,
            path: dto.path ?? null,
        });
        return { accepted: true };
    }

    @Post(':id/resolve')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Mark a report fixed',
        description: 'The row stays until its term. The same fault coming back afterwards opens a new report: it is news.',
    })
    async resolve(@Param('id', ParseIntPipe) id: number) {
        return this.errorReports.resolve(id);
    }
}
