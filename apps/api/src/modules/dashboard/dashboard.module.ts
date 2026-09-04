import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ClassSessionModule } from 'src/modules/class-session/class-session.module';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { LeadModule } from 'src/modules/lead/lead.module';
import { ProjectModule } from 'src/modules/project/project.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { ReportsController } from './reports.controller';
import { FinanceReportService } from './finance-report.service';
import { OccupancyReportService } from './occupancy-report.service';

/**
 * The overview — E21/S1 — and the reports — E21/S2 and S4.
 *
 * It imports the four modules whose services own the definitions it shows, rather than reading
 * their tables itself. That is the whole architectural point of the module existing: a screen that
 * re-derives "unmarked" or "overdue" is a second definition, and the second one drifts. The reports
 * follow the same rule — ageing is asked of `ArrearsService`, seats of `EnrollmentService`, and
 * what is waiting to be sent of `ProjectService`, and the funnel of `LeadFunnelService` — and only
 * sum what they are handed.
 */
@Module({
    imports: [EntitiesModule, JwtModule.register({}), ClassSessionModule, EnrollmentModule, InvoiceModule, ProjectModule, LeadModule],
    controllers: [OverviewController, ReportsController],
    providers: [OverviewService, FinanceReportService, OccupancyReportService, AuthGuard, RolesGuard],
})
export class DashboardModule {}
