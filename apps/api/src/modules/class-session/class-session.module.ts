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

@Module({
    // `MailModule` for the daily reminder's `OutboxService`. The dependency points this way round
    // deliberately: the timetable knows it has something to say, and the mail module stays a
    // channel that knows nothing about class sessions.
    imports: [EntitiesModule, JwtModule.register({}), MailModule],
    controllers: [ClassSessionController],
    providers: [ClassSessionService, NonTeachingPeriodService, UnmarkedAttendanceJob, AuthGuard, RolesGuard],
    // Exported because the daily unmarked-attendance reminder asks this service the question rather
    // than writing its own query. One definition of "unmarked", and it is this one.
    // `NonTeachingPeriodService` is exported alongside it because the calendar is the timetable's,
    // not a thing of its own: whoever generates sessions has to know which days are closed.
    exports: [ClassSessionService, NonTeachingPeriodService],
})
export class ClassSessionModule {}
