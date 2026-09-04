import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { LeadProgressModule } from './lead-progress.module';
import { LeadController } from './lead.controller';
import { LeadFunnelService } from './lead-funnel.service';
import { LeadRemindersJob } from './lead-reminders.job';
import { LeadService } from './lead.service';
import { TrialBookingService } from './trial-booking.service';
import { TrialController } from './trial.controller';

/**
 * Acquisition — E20/S1 to S4.
 *
 * `EnrollmentModule` because a trial booking takes a seat, and the only thing allowed to write that
 * is `EnrollmentService`: the capacity rule, the one-enrolment-in-force rule and `Child.group` all
 * live there, and a public form that opened its own path into `enrollments` would be a second set of
 * rules for the same table. `MailModule` for the confirmations and the reminders, through the outbox
 * like everything else — a booking must not fail because a mail provider is down.
 *
 * `LeadProgressModule` is imported rather than provided here on purpose: enrolment and attendance
 * need it too, and if it lived in this module they would import a module that imports them back.
 *
 * `LeadFunnelService` is exported for the reports controller in `dashboard/`. E21's rule is that a
 * report asks the service owning the question rather than counting rows itself, and leads are owned
 * here.
 */
@Module({
    imports: [EntitiesModule, MailModule, EnrollmentModule, LeadProgressModule, JwtModule.register({})],
    controllers: [LeadController, TrialController],
    providers: [LeadService, TrialBookingService, LeadFunnelService, LeadRemindersJob, AuthGuard, RolesGuard],
    exports: [LeadService, LeadFunnelService],
})
export class LeadModule {}
