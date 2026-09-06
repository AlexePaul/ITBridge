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
import { ReplacementService } from './replacement.service';

@Module({
    imports: [EntitiesModule, JwtModule.register({}), MailModule, LeadProgressModule, EnrollmentModule],
    controllers: [AttendanceController],
    providers: [AttendanceService, AbsenceNoticeService, ReplacementService, AuthGuard, RolesGuard],
    // Exported for the timetable: cancelling a class has to let go of the children the office moved
    // into it, and that write belongs to the service that owns the placement, not to whoever
    // cancelled.
    exports: [ReplacementService],
})
export class AttendanceModule {}
