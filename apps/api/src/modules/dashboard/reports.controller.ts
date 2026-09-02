import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { FinanceReportQueryDto } from './dto/financeReportQuery.dto';
import { FinanceReportService } from './finance-report.service';
import { OccupancyReportService } from './occupancy-report.service';
import { DEFAULT_FINANCE_MONTHS, addMonths, defaultFinanceRange } from './reports.rules';

/**
 * The reports — E21/S2 and S4. Admin only, like the overview: money and every seat in the school.
 *
 * Read-only. Nothing here writes, schedules or sends; the two endpoints are two questions.
 */
@Controller('reports')
export class ReportsController {
    constructor(
        private readonly finance: FinanceReportService,
        private readonly occupancy: OccupancyReportService,
    ) {}

    @Get('finance')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Facturat față de încasat, lună de lună',
        description:
            'Două calendare, amândouă afișate: încasat pentru lună (plățile pe facturile lunii, oricând au venit) și încasat în lună (plățile datate în lună, pentru orice factură). Doar plățile reușite sunt bani. Restanțele vin de la ecranul de restanțe, nu se rederivă.',
    })
    @ApiResponse({ status: 200, description: 'One row per month in the range, totals, current arrears by age, and what it was all computed from' })
    async financeReport(@Query() query: FinanceReportQueryDto) {
        const today = new Date();
        const fallback = defaultFinanceRange(today);
        // One end given: the other follows from it, twelve months apart, so "from September" reads
        // as a year from September rather than as September alone.
        const from = query.from ?? (query.to ? addMonths(query.to, -(DEFAULT_FINANCE_MONTHS - 1)) : fallback.from);
        const to = query.to ?? (query.from ? addMonths(query.from, DEFAULT_FINANCE_MONTHS - 1) : fallback.to);
        return this.finance.build(from, to, today);
    }

    @Get('occupancy')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Locuri ocupate față de capacitate, pe grupă, sală și locație',
        description:
            'Ocupat înseamnă înscrieri în vigoare, probele incluse (D7), cerute de la înscrieri. Grupele sub prag, cu venitul pierdut estimat la prețul de listă, și orele în care o sală stă goală cât timp alta predă.',
    })
    @ApiResponse({ status: 200, description: 'Every active group least full first, every active room with its dead hours, the roll-up by address' })
    async occupancyReport() {
        return this.occupancy.build();
    }
}
