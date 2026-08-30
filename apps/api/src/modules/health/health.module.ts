import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { StorageModule } from 'src/modules/storage/storage.module';

// The storage module, not a locally provided copy of `S3Service`. It used to construct its own so
// that a HeadBucket call would not drag invoicing, its PDF service and its repositories in behind
// it; now that storage is a module of its own, importing it costs nothing it does not need.
@Module({ imports: [StorageModule], controllers: [HealthController] })
export class HealthModule {}
