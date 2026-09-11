import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PasswordReset } from 'src/entities/password-reset.entity';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { sameAddress } from 'src/common/same-address';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { SessionService } from './session.service';
import { passwordResetUrl } from './portal-urls';

/**
 * How long a reset link lives.
 *
 * One hour, against `CONFIRMATION_TTL_MS`'s forty-eight. The confirmation link is allowed to wait
 * for somebody's Sunday morning because all it proves is an address; this one opens an account, and
 * every hour it stays valid is an hour it can be found in a forwarded mail, a shared family inbox or
 * a phone somebody left on a table. A parent who takes longer asks again — which costs one click,
 * against a door left open for two days.
 */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** 32 bytes, base64url. Same shape as the confirmation token, and not guessable. */
const TOKEN_BYTES = 32;

/** Matches `RegisterDto`, because a reset that accepted weaker passwords than registration is a downgrade path. */
export const MIN_PASSWORD_LENGTH = 6;

const SALT_ROUNDS = 10;

/**
 * Getting back into an account, and changing the password of one you are already in.
 *
 * Kept out of `AuthService` for the reason `EmailConfirmationService` is: that service is about
 * proving who you are on each request, this is about the one moment the credential itself changes.
 *
 * **Nothing here tells a stranger whether an address has an account.** `request` answers the same
 * way whether it wrote a row or not, and `reset` answers the same way for an unknown token as for
 * an expired one. That is the same decision E17/S4 made for the unsubscribe route, for the same
 * reason: an endpoint that distinguishes is an endpoint that enumerates, and this one would
 * enumerate the families of a children's school.
 */
@Injectable()
export class PasswordResetService {
    private readonly logger = new Logger('PasswordReset');

    constructor(
        @InjectRepository(PasswordReset) private readonly resetRepository: Repository<PasswordReset>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        private readonly mailTemplates: MailTemplateService,
        private readonly outbox: OutboxService,
        private readonly sessions: SessionService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    static hash(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /**
     * Sends a reset link, if there is anywhere to send one.
     *
     * **Always resolves, and always says the same thing.** The caller returns a fixed sentence
     * whatever happened in here: address not on file, address on a profile with no account, address
     * on an account — all identical from outside. The alternative is a form that answers "is
     * ana@example.com a parent at this school", which is a question about children.
     *
     * **Asking again invalidates the previous link**, unlike a confirmation resend. Two live tokens
     * are two chances for whoever should not have one, and the parent who pressed twice is looking
     * at the newer mail anyway. The row and the message are one transaction: a token written without
     * its mail is a link nobody holds, and a mail queued without its row is a link that cannot work.
     *
     * What is identical is the **answer**, not the time it takes: a known address renders a template
     * and writes two rows, an unknown one returns after a single `SELECT`, and a stopwatch can tell
     * those apart. Levelling that would mean doing the work for addresses that have no account, and
     * the route is throttled at three a minute per caller, which is the wrong tool at the wrong
     * scale for enumerating a school. Written down rather than discovered later.
     */
    async request(email: string, now: Date = new Date()): Promise<void> {
        const profile = await this.profileRepository
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .where('lower(profile.email) = lower(:email)', { email })
            .getOne();

        // A profile an admin typed in from a phone call has no account, and a trial booking writes
        // one with no address at all. Neither can be reset into; both look identical from outside.
        const account = profile?.user;
        const address = profile?.email;
        if (!account || !address) {
            this.logger.log('Password reset asked for an address with no account behind it; answered the same as any other.');
            return;
        }

        const token = randomBytes(TOKEN_BYTES).toString('base64url');
        const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
        const mail = await this.mailTemplates.render('password-reset', {
            firstName: profile.firstName,
            resetUrl: passwordResetUrl(token),
            minutes: String(Math.round(RESET_TTL_MS / 60_000)),
        });

        await this.dataSource.transaction(async (manager) => {
            // Every earlier link for this account stops working now.
            await manager.update(PasswordReset, { user: { id: account.id }, consumedAt: IsNull() }, { consumedAt: now });

            await manager.save(
                manager.create(PasswordReset, {
                    user: { id: account.id } as User,
                    tokenHash: PasswordResetService.hash(token),
                    email: address,
                    expiresAt,
                    consumedAt: null,
                }),
            );

            await this.outbox.queue({ to: address, subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined }, manager);
        });

        this.logger.log(`Password reset link issued for user ${account.id}.`);
    }

    /**
     * Consumes a link and sets the new password.
     *
     * Four refusals, and they all answer with the same sentence for the same reason as above: an
     * unknown token, an expired one, one already used, and one whose address is no longer the
     * account's. The last is the `CONFIRMATION_TOKEN_SUPERSEDED` rule with the stakes raised — if
     * the address was corrected because it was mistyped, the inbox that link reached may be a
     * stranger's, and a token that still worked would be that stranger's way in.
     *
     * **The account's gates are not consulted.** A family whose address is unconfirmed, or whose
     * registration an admin has not yet approved, can still reset: `isAccountActive` governs what an
     * account may *do*, and choosing a password is not one of those things. Refusing here would
     * leave a locked-out family with a door that opens only after somebody else presses a button.
     *
     * **Every session ends.** Somebody asking for a reset is either locked out or worried, and in
     * the second case leaving the other sessions alive would leave whoever they are worried about
     * signed in. `AuthGuard` does not consult `sessions`, so an access token issued before this
     * still works for up to fifteen minutes — the documented trade, and the reason this is the
     * place to change if instant revocation is ever required.
     */
    async reset(token: string, newPassword: string, now: Date = new Date()): Promise<void> {
        const reset = await this.resetRepository.findOne({
            where: { tokenHash: PasswordResetService.hash(token) },
            relations: { user: { profile: true } },
        });

        if (!reset || reset.consumedAt !== null || reset.expiresAt.getTime() <= now.getTime()) {
            throw new BadRequestException({
                message: 'Linkul nu mai este valabil. Cere unul nou și folosește-l în cel mult o oră.',
                error: 'RESET_TOKEN_INVALID',
            });
        }

        // The address on the account now, against the one the link travelled to.
        const current = reset.user.profile?.email ?? null;
        if (current === null || !sameAddress(current, reset.email)) {
            throw new BadRequestException({
                message: 'Linkul nu mai este valabil. Cere unul nou și folosește-l în cel mult o oră.',
                error: 'RESET_TOKEN_INVALID',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await this.dataSource.transaction(async (manager) => {
            await manager.update(User, { id: reset.user.id }, { passwordHash });
            await manager.update(PasswordReset, { id: reset.id }, { consumedAt: now });
        });

        // Outside the transaction deliberately: the password is changed either way, and a revocation
        // that failed must not roll back the change the parent is standing in front of. Worst case
        // is a stale session that the next refresh kills anyway, which is strictly better than a
        // reset that silently did not happen.
        await this.sessions.revokeAllForUser(reset.user.id);

        this.logger.log(`Password reset completed for user ${reset.user.id}; all sessions revoked.`);
    }

    /**
     * Changing the password from inside the account.
     *
     * **The current password is required**, and not as ceremony: an access token lives fifteen
     * minutes and `AuthGuard` honours it without touching `sessions`, so a borrowed phone or a
     * forgotten session is enough to reach this route. Asking for what only the owner knows is what
     * stops the change being available to whoever merely has the tab open.
     *
     * The hash is `select: false`, so it is asked for by name here exactly as `AuthService.login`
     * does — the second reader the entity's comment warns will need to.
     */
    async change(userId: number, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.createQueryBuilder('user').addSelect('user.passwordHash').where('user.id = :userId', { userId }).getOne();

        if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
            throw new BadRequestException({
                message: 'Parola actuală nu este corectă.',
                error: 'CURRENT_PASSWORD_WRONG',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await this.userRepository.update({ id: userId }, { passwordHash });

        // **Every session, this one included.** Excluding the current one would need the caller's
        // refresh token, which this route does not take — it authenticates with an access token, and
        // `sessions` keys on the refresh. Rather than widen the request body to carry a credential
        // just to spare one re-login, the parent signs in again with the password they just chose.
        // That reads as confirmation rather than as failure, and it means "changed my password"
        // leaves nothing signed in anywhere, which is what somebody doing it out of worry expects.
        await this.sessions.revokeAllForUser(userId);

        this.logger.log(`Password changed for user ${userId}; sessions revoked.`);
    }
}
