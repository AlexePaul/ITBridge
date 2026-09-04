import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { LeadProgressModule } from 'src/modules/lead/lead-progress.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

/**
 * `MailModule` because a freed seat has to reach the family waiting for it — S3's acceptance is a
 * notification sent, not a row updated. `OutboxService` is what gets injected, so a provider outage
 * can never fail the enrolment change that released the seat.
 *
 * Exported, because `ChildService` delegates its two group endpoints here rather than writing
 * `Child.group` behind this service's back.
 */
@Module({
    imports: [EntitiesModule, MailModule, LeadProgressModule, JwtModule.register({})],
    controllers: [EnrollmentController],
    providers: [EnrollmentService, AuthGuard, RolesGuard],
    exports: [EnrollmentService],
})
export class EnrollmentModule {}
