import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ErrorReport } from 'src/entities/error-report.entity';
import { User } from 'src/entities/user.entity';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ErrorReportController } from './error-report.controller';
import { ErrorReportService } from './error-report.service';
import { RecordingLogger } from './recording-logger';

/**
 * E06 S1. Exports the service to the HTTP filter, which records a 5xx with the request it answered,
 * and to the retention pass; and the logger to `main.ts`, which makes it the application's.
 */
@Module({
    imports: [TypeOrmModule.forFeature([ErrorReport, User]), JwtModule.register({})],
    controllers: [ErrorReportController],
    providers: [ErrorReportService, RecordingLogger, AuthGuard, RolesGuard],
    exports: [ErrorReportService, RecordingLogger],
})
export class ErrorReportModule {}
