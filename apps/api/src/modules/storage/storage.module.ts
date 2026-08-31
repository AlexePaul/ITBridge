import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';

/**
 * Object storage, on its own, because three unrelated things now need it.
 *
 * It used to be a provider inside the invoice module, which meant the readiness probe and the seed
 * script each constructed their own copy to avoid importing invoicing. E14 adds a fourth caller —
 * projects — and a fifth once the outbox learned to attach a thumbnail, at which point "a provider
 * that happens to live next to invoices" stops being a description of anything.
 *
 * No controller: nothing here is reachable over HTTP. A signed URL is issued by the module that
 * owns the authorization question, never by this one, which knows nothing about who is asking.
 */
@Module({
    providers: [S3Service],
    exports: [S3Service],
})
export class StorageModule {}
