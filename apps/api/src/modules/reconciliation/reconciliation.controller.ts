import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { actorFrom } from 'src/modules/audit/actor';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { ReconciliationService } from './reconciliation.service';
import { ImportStatementDto } from './dto/importStatement.dto';
import { MatchStatementLineDto } from './dto/matchStatementLine.dto';
import { FilterStatementLinesDto } from './dto/filterStatementLines.dto';

/**
 * The bank statement against the platform's records — E16/S8. Admin only, every route: a statement
 * is the school's account, with every family's transfers on it.
 */
@Controller('reconciliation')
export class ReconciliationController {
    constructor(private readonly reconciliation: ReconciliationService) {}

    @Post('statements')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Importă un extras bancar (CSV)', description: 'Păstrează doar intrările; o linie deja importată nu se adaugă a doua oară.' })
    @ApiResponse({ status: 400, description: 'STATEMENT_UNREADABLE — no header with a date and an amount column' })
    async importStatement(@Body() dto: ImportStatementDto) {
        return this.reconciliation.importStatement(dto.content);
    }

    @Get('lines')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Liniile extrasului: de decis, potrivite sau ignorate',
        description: 'Cele de decis vin cu propunerea de factură, dacă o regulă o susține.',
    })
    async lines(@Query() filter: FilterStatementLinesDto) {
        return this.reconciliation.lines(filter.state ?? 'waiting');
    }

    /** Declared before `lines/:id/…`: the word would not survive `ParseIntPipe`. */
    @Post('lines/confirm-suggested')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Confirmă toate potrivirile după referința facturii' })
    async confirmSuggested(@Request() req: AuthenticatedRequest) {
        return this.reconciliation.confirmSure(req.user.sub, actorFrom(req));
    }

    @Post('lines/:id/match')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 409, description: 'STATEMENT_LINE_ALREADY_MATCHED' })
    async match(@Param('id', ParseIntPipe) id: number, @Body() dto: MatchStatementLineDto, @Request() req: AuthenticatedRequest) {
        return this.reconciliation.match(id, dto.invoiceId, req.user.sub, actorFrom(req));
    }

    @Post('lines/:id/ignore')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async ignore(@Param('id', ParseIntPipe) id: number) {
        return this.reconciliation.ignore(id);
    }

    @Post('lines/:id/reopen')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async reopen(@Param('id', ParseIntPipe) id: number) {
        return this.reconciliation.reopen(id);
    }
}
