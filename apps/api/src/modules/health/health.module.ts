import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { S3Service } from 'src/modules/invoice/s3.service';

// S3Service is provided here rather than imported from InvoiceModule: it holds no state beyond its
// client and pulling in the whole invoice module for a HeadBucket call would drag the PDF service
// and its repositories along with it.
@Module({ controllers: [HealthController], providers: [S3Service] })
export class HealthModule {}
