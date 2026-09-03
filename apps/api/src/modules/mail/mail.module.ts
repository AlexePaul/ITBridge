import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailTemplateController } from './mail-template.controller';
import { MailTemplateService } from './mail-template.service';
import { DeliveryLogController } from './delivery-log.controller';
import { DeliveryLogService } from './delivery-log.service';
import { EntitiesModule } from 'src/entities/entities.module';
import { StorageModule } from 'src/modules/storage/storage.module';
import { MailService } from './mail.service';
import { DigestJob } from './digest.job';
import { DigestService } from './digest.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

/**
 * The sending channel every other epic is waiting on (E17).
 *
 * No controller: nothing here is reachable over HTTP. The delivery record that admins will read is
 * E17/S5 and gets its own endpoints then — which is also when `OutboxMessage` acquires a shape on
 * the wire and an entry in `contract.ts`.
 *
 * A feature module that needs to send mail imports this one and injects `OutboxService`, never
 * `MailService`: the queue is the contract, and the provider call is an implementation detail of
 * the scheduler. `MailService` is exported anyway, because a future preview-before-sending screen
 * (E17/S2) is the one legitimate caller that must not go through the queue.
 */
@Module({
    // `StorageModule` because a queued message may carry attachments by key: the bytes are read
    // from the bucket at send time, not carried through the queue. See `OutboxMessage.attachments`.
    imports: [EntitiesModule, StorageModule, JwtModule.register({})],
    controllers: [MailTemplateController, DeliveryLogController],
    providers: [MailService, OutboxService, OutboxDispatcher, DigestService, DigestJob, MailTemplateService, DeliveryLogService, AuthGuard, RolesGuard],
    exports: [MailService, OutboxService, MailTemplateService, DigestService],
})
export class MailModule {}
