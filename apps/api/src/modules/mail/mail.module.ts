import { Module } from '@nestjs/common';
import { EntitiesModule } from 'src/entities/entities.module';
import { MailService } from './mail.service';
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
    imports: [EntitiesModule],
    providers: [MailService, OutboxService, OutboxDispatcher],
    exports: [MailService, OutboxService],
})
export class MailModule {}
