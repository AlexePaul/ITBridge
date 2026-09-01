import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ClassSessionModule } from 'src/modules/class-session/class-session.module';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

/**
 * The overview — E21/S1.
 *
 * It imports the three modules whose services own the definitions it shows, rather than reading
 * their tables itself. That is the whole architectural point of the module existing: a screen that
 * re-derives "unmarked" or "overdue" is a second definition, and the second one drifts.
 */
@Module({
    imports: [EntitiesModule, JwtModule.register({}), ClassSessionModule, EnrollmentModule, InvoiceModule],
    controllers: [OverviewController],
    providers: [OverviewService, AuthGuard, RolesGuard],
})
export class DashboardModule {}
