import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';

/**
 * E07 S3. `AuditService` is exported because the modules that change things are the ones that have
 * to record it — the log is written where the act happens, inside its transaction, not inferred
 * afterwards by something watching the database.
 */
@Module({
    imports: [TypeOrmModule.forFeature([AuditLog]), JwtModule.register({})],
    controllers: [AuditController],
    providers: [AuditService, AuthGuard, RolesGuard],
    exports: [AuditService],
})
export class AuditModule {}
