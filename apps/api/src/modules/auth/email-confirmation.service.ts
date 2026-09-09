import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { EmailConfirmation } from 'src/entities/email-confirmation.entity';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { sameAddress } from 'src/common/same-address';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { emailConfirmationUrl } from './portal-urls';

/**
 * The first gate of E11/S2: proving the address a parent typed is one they can read.
 *
 * Kept apart from `AuthService` because it is a different subject — `AuthService` is about proving
 * who you are on each request, this is about proving an address once — and because issuing a link
 * has to be callable from inside somebody else's transaction, which is a shape the rest of
 * `AuthService` has no use for.
 */

/**
 * How long a link lives.
 *
 * Forty-eight hours rather than the usual twenty-four, for one concrete case: a parent who
 * registers on a Friday evening and next opens their mail on Sunday. A day would expire on them for
 * no reason anybody could explain, and the recovery — asking for a new link — is exactly the step
 * we would be adding for nothing.
 */
export const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;

/** 32 bytes, base64url — 43 characters, and not guessable within the lifetime of the school. */
const TOKEN_BYTES = 32;

export interface IssuedConfirmation {
    /** The token that goes in the link. Held nowhere else: the row keeps only its hash. */
    token: string;
    expiresAt: Date;
}

@Injectable()
export class EmailConfirmationService {
    private readonly logger = new Logger('EmailConfirmation');

    constructor(
        @InjectRepository(EmailConfirmation) private readonly confirmationRepository: Repository<EmailConfirmation>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        private readonly mailTemplates: MailTemplateService,
        private readonly outbox: OutboxService,
    ) {}

    /**
     * The whole act: a row, a token, and the link on its way to the address.
     *
     * Three callers now — registration, the resend button, and a profile edit that changes the
     * address — and the composition is theirs to share rather than to copy. Copied, the third one
     * would have been free to render a different template or queue to a different address, and the
     * only way to notice would be a family who never got a link.
     *
     * `manager` is the caller's transaction, and every caller passes it: the token, the message and
     * whatever provoked them are one write or none.
     */
    async issueAndSend(user: User, recipient: { firstName: string; email: string }, now: Date = new Date(), manager?: EntityManager): Promise<void> {
        const { token } = await this.issueFor(user, recipient.email, now, manager);
        const mail = await this.mailTemplates.render('email-confirmation', {
            firstName: recipient.firstName,
            confirmUrl: emailConfirmationUrl(token),
        });
        await this.outbox.queue({ to: recipient.email, subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined }, manager);
    }

    /**
     * Writes a confirmation row and returns the token to put in the link.
     *
     * `manager` is the caller's transaction, and registration passes it: the account, the profile
     * and the token that unlocks them are one write or none. A token row that survived a
     * rolled-back registration would point at a user that does not exist; a registration that
     * committed without one would leave a family permanently unable to confirm, with no path back
     * except an admin editing the database.
     */
    async issueFor(user: User, email: string, now: Date = new Date(), manager?: EntityManager): Promise<IssuedConfirmation> {
        const repository = manager ? manager.getRepository(EmailConfirmation) : this.confirmationRepository;

        const token = randomBytes(TOKEN_BYTES).toString('base64url');
        const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);

        await repository.save(
            repository.create({
                user,
                tokenHash: hashToken(token),
                email,
                expiresAt,
                consumedAt: null,
            }),
        );

        return { token, expiresAt };
    }

    /**
     * Opens the gate, or explains why it stays shut.
     *
     * Every refusal below is a 400 with its own code, because they are genuinely different
     * situations for the person holding the link and the interface has to say different things: a
     * link that expired can be replaced, a link already used means the job is done, and a link that
     * matches nothing means it was mistyped or the account is gone.
     *
     * **A link proves one address, and only while it is still the address on file.** The row keeps
     * the address it was issued for precisely so this can be asked. Without the question, a link
     * outstanding from before an edit went on working after it: `PUT /profiles/:id` closes the gate
     * and sends a fresh link when the address moves — E11/S2 — but the old link stayed live for the
     * rest of its forty-eight hours, and clicking it stamped `emailConfirmedAt` again. What that
     * stamp then licensed is the whole problem: `queueOrRecord` reads it before writing to an
     * address, and `isAccountActive` reads it before a child can be put in a group. So somebody who
     * could read the *old* address — a stranger, if the reason for the edit was a typo — could
     * reopen a gate that says the family proved they read the *new* one.
     *
     * Refused rather than quietly ignored, and with its own code: the person holding the link did
     * nothing wrong and the way out is a fresh one, which is a different sentence from "expired".
     */
    async confirm(token: string, now: Date = new Date()): Promise<User> {
        const confirmation = await this.confirmationRepository.findOne({
            where: { tokenHash: hashToken(token) },
            relations: { user: true },
        });

        if (!confirmation) {
            throw new BadRequestException({
                message: 'Linkul de confirmare nu este valid',
                error: 'CONFIRMATION_TOKEN_INVALID',
            });
        }

        if (confirmation.consumedAt !== null) {
            throw new BadRequestException({
                message: 'Linkul de confirmare a fost deja folosit',
                error: 'CONFIRMATION_TOKEN_USED',
            });
        }

        if (confirmation.expiresAt.getTime() <= now.getTime()) {
            throw new BadRequestException({
                message: 'Linkul de confirmare a expirat',
                error: 'CONFIRMATION_TOKEN_EXPIRED',
            });
        }

        // Compared through `sameAddress`, the same way `movesTheAddress` decides an edit is a move:
        // a change of capitalisation reaches the same mailbox, is not a move, issues no new link,
        // and must not kill the live one.
        //
        // No profile at all is not a contradiction — there is no address on file for the token to
        // disagree with — so it falls through. A registered account always has one; this is the
        // account an admin promoted by hand.
        const profile = await this.profileRepository.findOne({ where: { user: { id: confirmation.user.id } } });
        if (profile && !sameAddress(profile.email, confirmation.email)) {
            throw new BadRequestException({
                message: 'Adresa s-a schimbat între timp, iar linkul acesta confirma adresa veche. Am trimis unul nou la adresa nouă.',
                error: 'CONFIRMATION_TOKEN_SUPERSEDED',
            });
        }

        // Consuming the row and stamping the user are one transaction: a crash between them would
        // otherwise burn the only link the parent has without confirming anything.
        await this.confirmationRepository.manager.transaction(async (manager) => {
            await manager.update(EmailConfirmation, { id: confirmation.id }, { consumedAt: now });
            await manager.update(User, { id: confirmation.user.id }, { emailConfirmedAt: now });
        });

        this.logger.log(`User ${confirmation.user.id} confirmed their email address.`);
        confirmation.user.emailConfirmedAt = now;
        return confirmation.user;
    }

    /**
     * The live, unexpired links a user holds.
     *
     * Used to decide whether a resend is warranted. `IsNull()` and not `undefined`: TypeORM reads
     * `undefined` in a `where` as "no condition at all", so the second would count consumed rows
     * too and quietly report every user as still waiting.
     */
    async countPending(userId: number, now: Date = new Date()): Promise<number> {
        return this.confirmationRepository
            .createQueryBuilder('confirmation')
            .where('confirmation.user_id = :userId', { userId })
            .andWhere('confirmation.consumedAt IS NULL')
            .andWhere('confirmation.expiresAt > :now', { now })
            .getCount();
    }

    /** Housekeeping for the tests and the seed; nothing in the request path calls it. */
    async findLiveFor(userId: number): Promise<EmailConfirmation[]> {
        return this.confirmationRepository.find({
            where: { user: { id: userId }, consumedAt: IsNull() },
            order: { id: 'DESC' },
        });
    }
}

/** The same construction `SessionService` uses, and for the same reason: the token is never stored. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
