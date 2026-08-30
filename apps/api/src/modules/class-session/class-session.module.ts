import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailModule } from 'src/modules/mail/mail.module';
import { ClassSessionController } from './class-session.controller';
import { ClassSessionService } from './class-session.service';
import { UnmarkedAttendanceJob } from './unmarked-attendance.job';

@Module({
    // `MailModule` for the daily reminder's `OutboxService`. The dependency points this way round
    // deliberately: the timetable knows it has something to say, and the mail module stays a
    // channel that knows nothing about class sessions.
    imports: [EntitiesModule, JwtModule.register({}), MailModule],
    controllers: [ClassSessionController],
    providers: [ClassSessionService, UnmarkedAttendanceJob, AuthGuard, RolesGuard],
    // Exported because the daily unmarked-attendance reminder asks this service the question rather
    // than writing its own query. One definition of "unmarked", and it is this one.
    exports: [ClassSessionService],
})
export class ClassSessionModule {}
