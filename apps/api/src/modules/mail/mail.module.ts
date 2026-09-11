import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailTemplateController } from './mail-template.controller';
import { MailTemplateService } from './mail-template.service';
import { DeliveryLogController } from './delivery-log.controller';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { DeliveryLogService } from './delivery-log.service';
import { EntitiesModule } from 'src/entities/entities.module';
import { StorageModule } from 'src/modules/storage/storage.module';
import { MailService } from './mail.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';
import { AuditModule } from 'src/modules/audit/audit.module';

/**
 * The sending channel every other epic is waiting on (E17).
 *
 * Three controllers, all narrow. The template editor is E17/S2, the delivery record E17/S5 — both
 * admin-only — and the unsubscribe route E17/S4, which is **public by necessity**: a parent reading
 * a newsletter is not signed in, and a way out that needed a login would be harder than the
 * checkbox that let the messages start. Sending itself is still unexposed, and stays that way.
 *
 * A feature module that needs to send mail imports this one and injects `OutboxService`, never
 * `MailService`: the queue is the contract, and the provider call is an implementation detail of
 * the scheduler. `MailService` is exported anyway, because a future preview-before-sending screen
 * (E17/S2) is the one legitimate caller that must not go through the queue.
 */
@Module({
    // `StorageModule` because a queued message may carry attachments by key: the bytes are read
    // from the bucket at send time, not carried through the queue. See `OutboxMessage.attachments`.
    // `AuditModule` because a family withdrawing marketing consent from a link leaves a trail —
    // E07/S3, and E17/S4 is the door that link opens.
    imports: [EntitiesModule, StorageModule, JwtModule.register({}), AuditModule],
    controllers: [MailTemplateController, DeliveryLogController, UnsubscribeController],
    providers: [MailService, OutboxService, OutboxDispatcher, MailTemplateService, DeliveryLogService, UnsubscribeService, AuthGuard, RolesGuard],
    // `DeliveryLogService` is exported for the dashboard tile of E17/S5: the overview asks this
    // module how many messages never reached a family rather than counting statuses itself, which
    // is E21's rule and the reason that tile was wrong for as long as it counted its own.
    exports: [MailService, OutboxService, MailTemplateService, DeliveryLogService],
})
export class MailModule {}
