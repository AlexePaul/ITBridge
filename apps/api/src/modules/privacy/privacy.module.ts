import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { EntitiesModule } from 'src/entities/entities.module';
import { PrivacyController } from './privacy.controller';
import { ExportService } from './export.service';

/**
 * E07 S4. `EntitiesModule` rather than a `forFeature` list, because the export reads sixteen
 * tables: naming them twice is a list that goes stale, and `export.spec.ts` already checks the one
 * that matters against the inventory.
 */
@Module({
    imports: [EntitiesModule, TypeOrmModule.forFeature([]), JwtModule.register({})],
    controllers: [PrivacyController],
    providers: [ExportService, AuthGuard, RolesGuard],
    exports: [ExportService],
})
export class PrivacyModule {}
