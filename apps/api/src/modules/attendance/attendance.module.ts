import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceController } from './attendance.controller';
import { MailModule } from 'src/modules/mail/mail.module';
import { AttendanceService } from './attendance.service';
import { AbsenceNoticeService } from './absence-notice.service';
import { MakeUpCreditService } from './make-up-credit.service';
import { ParentNotificationsJob } from './parent-notifications.job';

@Module({
    imports: [EntitiesModule, JwtModule.register({}), MailModule],
    controllers: [AttendanceController],
    providers: [AttendanceService, AbsenceNoticeService, MakeUpCreditService, ParentNotificationsJob, AuthGuard, RolesGuard],
})
export class AttendanceModule {}
