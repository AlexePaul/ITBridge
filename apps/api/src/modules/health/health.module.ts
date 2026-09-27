import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { HealthController } from './health.controller';
import { SystemStatusController } from './system-status.controller';
import { SystemStatusService } from './system-status.service';
import { StorageModule } from 'src/modules/storage/storage.module';

// The storage module, not a locally provided copy of `S3Service`. It used to construct its own so
// that a HeadBucket call would not drag invoicing, its PDF service and its repositories in behind
// it; now that storage is a module of its own, importing it costs nothing it does not need.
// `JwtModule` and the guards are for `/system/status` alone: the probes stay public.
@Module({
    imports: [StorageModule, JwtModule.register({})],
    controllers: [HealthController, SystemStatusController],
    providers: [SystemStatusService, AuthGuard, RolesGuard],
})
export class HealthModule {}
