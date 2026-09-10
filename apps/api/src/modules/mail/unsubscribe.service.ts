import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { SYSTEM_ACTOR } from 'src/modules/audit/actor';

/**
 * Turning marketing off from the link in a message — E17 S4.
 *
 * The one thing this can do is set `marketingOptIn` to `false`. It cannot set it to `true`, cannot
 * read the family out, and cannot touch anything else on the row: a link that travels in an e-mail
 * is a link that can be forwarded, sit in a mailbox for a year, or be handed to a stranger by a
 * misdirected message, and every one of those is harmless against a switch that only goes one way.
 *
 * **The answer never says whether the token was real.** A response that distinguished "stopped" from
 * "no such token" would turn the endpoint into an oracle for guessing them, and there is nothing a
 * parent could do with the distinction anyway — a link from their own e-mail either works or the
 * office does it for them.
 */
@Injectable()
export class UnsubscribeService {
    private readonly logger = new Logger('Unsubscribe');

    constructor(
        @InjectDataSource() private dataSource: DataSource,
        private audit: AuditService,
    ) {}

    /**
     * Records the refusal, if the token names anybody. Idempotent: a second click changes nothing
     * and is not an error — the family asked for the same thing twice and got it.
     */
    async unsubscribe(token: string): Promise<void> {
        if (!token) return;

        await this.dataSource.transaction(async (manager) => {
            const profile = await manager.findOne(Profile, { where: { unsubscribeToken: token }, select: ['id', 'marketingOptIn'] });

            // Already off, or no such token. Nothing to write either way, and the audit log is for
            // things that changed — a click that moved nothing is not an event (E07 S3).
            if (!profile || !profile.marketingOptIn) return;

            await manager.update(Profile, { id: profile.id }, { marketingOptIn: false });

            // `SYSTEM_ACTOR`, and it is the honest answer rather than a gap: nobody at the school
            // pressed anything, and the alternative is inventing a name for the person holding a
            // link. The note is what a reader needs — that the withdrawal came from a message.
            // Field name only, no value: `marketingOptIn` is personal data with `account`
            // retention, and the journal outlives the family (E07 S3).
            await this.audit.recordPersonalDataChange(
                {
                    actor: SYSTEM_ACTOR,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profile.id,
                    fields: ['marketingOptIn'],
                    note: 'dezabonare din linkul unui mesaj',
                },
                manager,
            );

            this.logger.log(`Profile ${profile.id} unsubscribed from marketing.`);
        });
    }
}
