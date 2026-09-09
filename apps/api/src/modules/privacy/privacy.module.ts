import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { EntitiesModule } from 'src/entities/entities.module';
import { PrivacyController } from './privacy.controller';
import { ExportService } from './export.service';
import { ErasureService } from './erasure.service';
import { AuditModule } from 'src/modules/audit/audit.module';
import { StorageModule } from 'src/modules/storage/storage.module';

/**
 * E07 S4. `EntitiesModule` rather than a `forFeature` list, because the export reads sixteen tables
 * and the erasure writes to nearly as many: naming them twice is a list that goes stale, and
 * `export.spec.ts` already checks the one that matters against the inventory.
 *
 * `AuditModule` because an erasure is the change most worth being able to account for afterwards —
 * and the trail survives it safely, storing identifiers rather than names (E07 S3).
 *
 * `StorageModule` because deleting the rows is not deleting the data: a child's project files live
 * in the bucket, and an erasure that leaves them there has not erased anything a family would
 * recognise as theirs.
 */
@Module({
    imports: [EntitiesModule, TypeOrmModule.forFeature([]), JwtModule.register({}), AuditModule, StorageModule],
    controllers: [PrivacyController],
    providers: [ExportService, ErasureService, AuthGuard, RolesGuard],
    exports: [ExportService, ErasureService],
})
export class PrivacyModule {}
