import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ClassSessionModule } from 'src/modules/class-session/class-session.module';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { LeadModule } from 'src/modules/lead/lead.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { ProjectModule } from 'src/modules/project/project.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { ReportsController } from './reports.controller';
import { FinanceReportService } from './finance-report.service';
import { OccupancyReportService } from './occupancy-report.service';
import { EarlySignalsService } from './early-signals.service';
import { EarlySignalsJob } from './early-signals.job';

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
    // `MailModule` for the Monday digest of E21/S7 — the one thing this module writes, and it
    // writes it through the outbox like every other message the backend sends.
    imports: [EntitiesModule, JwtModule.register({}), ClassSessionModule, EnrollmentModule, InvoiceModule, ProjectModule, LeadModule, MailModule],
    controllers: [OverviewController, ReportsController],
    providers: [OverviewService, FinanceReportService, OccupancyReportService, EarlySignalsService, EarlySignalsJob, AuthGuard, RolesGuard],
})
export class DashboardModule {}
