import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceController } from './attendance.controller';
import { MailModule } from 'src/modules/mail/mail.module';
import { LeadProgressModule } from 'src/modules/lead/lead-progress.module';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';
import { AttendanceService } from './attendance.service';
import { AbsenceNoticeService } from './absence-notice.service';
import { MakeUpCreditService } from './make-up-credit.service';
import { ParentNotificationsJob } from './parent-notifications.job';

@Module({
    imports: [EntitiesModule, JwtModule.register({}), MailModule, LeadProgressModule, EnrollmentModule],
    controllers: [AttendanceController],
    providers: [AttendanceService, AbsenceNoticeService, MakeUpCreditService, ParentNotificationsJob, AuthGuard, RolesGuard],
    // Exported for the timetable: a cancelled class can hand every child in the group a make-up,
    // and that write belongs to the service that owns the ledger, not to whoever cancelled.
    exports: [MakeUpCreditService],
})
export class AttendanceModule {}
