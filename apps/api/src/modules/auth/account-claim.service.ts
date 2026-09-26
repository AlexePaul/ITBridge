import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, IsNull, MoreThan } from 'typeorm';
import { AccountClaim } from 'src/entities/account-claim.entity';
import { Profile } from 'src/entities/profile.entity';
import { sameAddress } from 'src/common/same-address';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { accountClaimUrl } from './portal-urls';

/**
 * How long a claim link lives: forty-eight hours, the confirmation link's span.
 *
 * Longer than a reset link's hour because this one is often sent on the office's initiative, to a
 * family that did not ask a minute ago and reads mail on a Sunday morning. What it opens is modest
 * next to a reset: an account that still waits for the office's approval, attached to a family the
 * office already holds.
 */
export const CLAIM_TTL_MS = 48 * 60 * 60 * 1000;

/** 32 bytes, base64url — the shape of every other link token in the platform. */
const TOKEN_BYTES = 32;

/**
 * The one refusal for a link that cannot be used, whatever the reason: unknown, expired, used, or
 * replaced by a newer one. The password reset's rule, for the same reason — an answer that told the
 * four apart would tell a stranger which tokens were once real.
 */
export function claimTokenInvalid(): BadRequestException {
    return new BadRequestException({
        message: 'Linkul nu mai este valabil. Cere unul nou de la școală sau încearcă din nou înregistrarea cu aceeași adresă.',
        error: 'CLAIM_TOKEN_INVALID',
    });
}

/**
 * The fourth link of the family `sessions` started: the one that lets a family the office typed in
 * create its own account (E11 S2, review of 26 September 2026).
 *
 * `POST /profiles` is the road most families take into the platform — the office writes them down
 * from a phone call — and until this existed that road ended there: `register` refused the address
 * as taken, and nothing on any screen could attach an account afterwards. The profile's address is
 * one the office typed, which `vouchedAddresses` already trusts as the family's, so proving the
 * mailbox proves the family; that is all this link does.
 *
 * Modelled on `PasswordResetService` in every rule that matters: the token is stored only as a hash,
 * a second link kills the first, the address is frozen at issue and read again at use, and one
 * refusal covers every way a link can be dead.
 */
@Injectable()
export class AccountClaimService {
    private readonly logger = new Logger('AccountClaim');

    constructor(
        private readonly mailTemplates: MailTemplateService,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    static hash(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /**
     * The family the office typed in under this address, if there is one: a profile with no account
     * that has not been erased. Compared on `lower()`, like every other lookup of a mailbox.
     */
    async accountlessProfileFor(email: string, manager: EntityManager = this.dataSource.manager): Promise<Profile | null> {
        const profile = await manager
            .getRepository(Profile)
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .andWhere('lower(profile.email) = lower(:email)', { email })
            .getOne();

        if (!profile || profile.user || profile.erasedAt !== null || !profile.email) return null;
        return profile;
    }

    /**
     * Writes a new link for the family and queues the mail carrying it, in the caller's transaction.
     *
     * The profile row is held for the length of the write, as `PasswordResetService.request` holds
     * the account: "kill the old link, then write the new one" is read-then-write, and two requests
     * arriving together would each kill what they saw and each insert — two live links for one
     * family, which is exactly the state the rule forbids.
     *
     * Earlier links stop working by having their expiry brought forward to now, not by `usedAt`:
     * that column says an account was created from the link, and a replaced link created nothing.
     *
     * The mail goes to the address on the profile, unconfirmed by definition — `queue`, not
     * `queueOrRecord`: this message *is* the proof, and gated on it it would never leave.
     */
    async issue(profile: Profile, now: Date, manager: EntityManager): Promise<AccountClaim> {
        await manager.getRepository(Profile).findOne({ where: { id: profile.id }, lock: { mode: 'pessimistic_write' } });

        await manager.update(AccountClaim, { profile: { id: profile.id }, usedAt: IsNull(), expiresAt: MoreThan(now) }, { expiresAt: now });

        const token = randomBytes(TOKEN_BYTES).toString('base64url');
        const address = profile.email as string;
        const claim = await manager.save(
            manager.create(AccountClaim, {
                profile: { id: profile.id } as Profile,
                tokenHash: AccountClaimService.hash(token),
                email: address,
                expiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
                usedAt: null,
            }),
        );

        const mail = await this.mailTemplates.render('account-claim', {
            firstName: profile.firstName,
            claimUrl: accountClaimUrl(token),
            hours: String(Math.round(CLAIM_TTL_MS / 3_600_000)),
        });
        await this.outbox.queue({ to: address, subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined }, manager);

        this.logger.log(`Account claim link issued for profile ${profile.id}.`);
        return claim;
    }

    /**
     * The office's button — "Trimite linkul de cont" on the family page.
     *
     * Refused, each with its own code, when there is nothing a link could do: the family already has
     * an account, has no address to send to, or was erased. Audited, with the field names only, in
     * the transaction that writes the link: who sent a way into a family is a question about access,
     * the third category E07 S3 keeps.
     */
    async sendForProfile(profileId: number, actor: Actor): Promise<{ message: string }> {
        await this.dataSource.transaction(async (manager) => {
            const profile = await manager.getRepository(Profile).findOne({ where: { id: profileId }, relations: { user: true } });
            if (!profile) throw new NotFoundException('Profile not found');

            if (profile.erasedAt !== null) {
                throw new ConflictException({ message: `Profile ${profileId} is erased.`, error: 'PROFILE_ERASED' });
            }
            if (profile.user) {
                throw new ConflictException({ message: `Profile ${profileId} already has an account.`, error: 'PROFILE_HAS_ACCOUNT' });
            }
            if (!profile.email) {
                throw new ConflictException({ message: `Profile ${profileId} has no email address.`, error: 'PROFILE_HAS_NO_EMAIL' });
            }

            const claim = await this.issue(profile, new Date(), manager);

            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.CREATED,
                    entityType: 'AccountClaim',
                    entityId: claim.id,
                    fields: ['profile', 'email'],
                    note: `link de cont trimis de birou familiei ${profileId}`,
                },
                manager,
            );
        });

        return { message: 'Am trimis linkul de cont' };
    }

    /**
     * Spends a link, in the caller's transaction, and answers with the family it opens.
     *
     * Everything is read again under the claim row's lock, so two tabs submitting the same link wait
     * for each other and the second finds it used. The profile is re-read too, locked, and must still
     * be the account-less, unerased family at the address the link went to: an office correction of
     * the address in between means the link reached an inbox that is no longer the family's.
     */
    async redeem(token: string, now: Date, manager: EntityManager): Promise<Profile> {
        // `FOR UPDATE OF` the one table: Postgres refuses to lock the nullable side of an outer join.
        const claim = await manager
            .getRepository(AccountClaim)
            .createQueryBuilder('claim')
            .leftJoinAndSelect('claim.profile', 'profile')
            .andWhere('claim.tokenHash = :tokenHash', { tokenHash: AccountClaimService.hash(token) })
            .setLock('pessimistic_write', undefined, ['claim'])
            .getOne();

        if (!claim || claim.usedAt !== null || claim.expiresAt.getTime() <= now.getTime()) {
            throw claimTokenInvalid();
        }

        const profile = await manager
            .getRepository(Profile)
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .andWhere('profile.id = :id', { id: claim.profile.id })
            .setLock('pessimistic_write', undefined, ['profile'])
            .getOne();

        if (!profile || profile.user || profile.erasedAt !== null || !profile.email || !sameAddress(profile.email, claim.email)) {
            throw claimTokenInvalid();
        }

        await manager.update(AccountClaim, { id: claim.id }, { usedAt: now });
        return profile;
    }
}
