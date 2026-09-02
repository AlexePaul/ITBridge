import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailModule } from 'src/modules/mail/mail.module';
import { ClassSessionController } from './class-session.controller';
import { ClassSessionService } from './class-session.service';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { UnmarkedAttendanceJob } from './unmarked-attendance.job';
import { LateRegisterJob } from './late-register.job';
import { ClassSessionNotifier } from './class-session-notifier';
import { AttendanceModule } from 'src/modules/attendance/attendance.module';

@Module({
    // `MailModule` for the two reminders' `OutboxService` — the daily report and the fifteen-minute
    // alert. The dependency points this way round deliberately: the timetable knows it has
    // something to say, and the mail module stays a channel that knows nothing about class
    // sessions.
    // `AttendanceModule` for `MakeUpCreditService`: cancelling a class can give the hour back, and
    // the credit ledger has one writer. The dependency points this way and cannot point back —
    // attendance reaches sessions through their repository, not through this module.
    imports: [EntitiesModule, JwtModule.register({}), MailModule, AttendanceModule],
    controllers: [ClassSessionController],
    providers: [ClassSessionService, NonTeachingPeriodService, ClassSessionNotifier, UnmarkedAttendanceJob, LateRegisterJob, AuthGuard, RolesGuard],
    // Exported because both attendance reminders ask this service the question rather than
    // writing their own query. One definition of "unmarked", and it is this one.
    // `NonTeachingPeriodService` is exported alongside it because the calendar is the timetable's,
    // not a thing of its own: whoever generates sessions has to know which days are closed.
    exports: [ClassSessionService, NonTeachingPeriodService],
})
export class ClassSessionModule {}
