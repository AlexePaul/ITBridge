import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Session } from 'src/entities/session.entity';
import { User } from 'src/entities/user.entity';

/**
 * Tracks issued refresh tokens so they can be taken back.
 *
 * The token itself is never stored, only a SHA-256 of it: a leaked dump of this table must not hand
 * anybody a working set of sessions. SHA-256 rather than bcrypt on purpose — the value is already
 * 256 bits of signed randomness, so there is nothing to brute-force, and every refresh has to look
 * one up by hash.
 */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('Sessions');
    private purgeTimer?: NodeJS.Timeout;

    /**
     * Schedules the purge on a plain interval rather than through `@nestjs/schedule`, which is
     * ESM-only and cannot be loaded by jest — the same reason `@nestjs/config` was left out. A
     * daily sweep needs no cron expression.
     *
     * `unref()` keeps the timer from holding the process open, which would otherwise stop tests
     * and a graceful shutdown from ever finishing.
     */
    onModuleInit(): void {
        const oneDay = 24 * 60 * 60 * 1000;
        this.purgeTimer = setInterval(() => {
            void this.purgeExpired().catch((error: unknown) => this.logger.error('Session purge failed', String(error)));
        }, oneDay);
        this.purgeTimer.unref();
    }

    onModuleDestroy(): void {
        if (this.purgeTimer) clearInterval(this.purgeTimer);
    }

    constructor(@InjectRepository(Session) private readonly sessionRepository: Repository<Session>) {}

    static hash(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /** Records a token from a fresh login. A new login starts its own family. */
    async startSession(user: User, refreshToken: string, expiresAt: Date, userAgent?: string): Promise<Session> {
        return this.sessionRepository.save(
            this.sessionRepository.create({
                user,
                tokenHash: SessionService.hash(refreshToken),
                familyId: randomUUID(),
                expiresAt,
                revokedAt: null,
                userAgent: userAgent?.slice(0, 255) ?? null,
            }),
        );
    }

    /**
     * Consumes a refresh token and issues its successor in the same family.
     *
     * Presenting a token that was already rotated means two parties hold tokens from one chain,
     * which the legitimate client alone cannot produce. The whole family is revoked: the theft
     * costs the attacker and the victim their sessions, rather than going unnoticed for seven days.
     */
    async rotate(refreshToken: string, nextToken: string, expiresAt: Date, userAgent?: string): Promise<Session> {
        const tokenHash = SessionService.hash(refreshToken);
        const session = await this.sessionRepository.findOne({ where: { tokenHash }, relations: ['user'] });

        if (!session) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (session.expiresAt.getTime() <= Date.now()) {
            throw new UnauthorizedException('Refresh token has expired');
        }

        // Claiming the token is a single conditional UPDATE, not a read followed by a write. Two
        // concurrent refreshes carrying the same token would otherwise both see `revokedAt === null`
        // and both mint a successor, leaving one login with two live tokens and no reuse detected —
        // which is the one thing the family mechanism exists to catch. Exactly one of them can
        // affect a row here; the loser is treated as a replay.
        const claim = await this.sessionRepository.update({ tokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });

        if (claim.affected === 0) {
            await this.revokeFamily(session.familyId);
            throw new UnauthorizedException('Refresh token has already been used');
        }

        return this.sessionRepository.save(
            this.sessionRepository.create({
                user: session.user,
                tokenHash: SessionService.hash(nextToken),
                familyId: session.familyId,
                expiresAt,
                revokedAt: null,
                userAgent: userAgent?.slice(0, 255) ?? session.userAgent,
            }),
        );
    }

    /**
     * Logout. Idempotent: revoking an unknown or already revoked token is not an error.
     *
     * `IsNull()` rather than `revokedAt: undefined` — TypeORM drops undefined conditions from a
     * where clause, so the latter silently means "any row with this hash", revoked or not.
     */
    async revoke(refreshToken: string): Promise<void> {
        await this.sessionRepository.update({ tokenHash: SessionService.hash(refreshToken), revokedAt: IsNull() }, { revokedAt: new Date() });
    }

    async revokeFamily(familyId: string): Promise<void> {
        await this.sessionRepository.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
    }

    /** Every session of a user; used by "log me out everywhere". */
    async revokeAllForUser(userId: number): Promise<void> {
        await this.sessionRepository.update({ user: { id: userId }, revokedAt: IsNull() }, { revokedAt: new Date() });
    }

    /** What a parent sees when asking which sessions are open. Never includes the hashes. */
    async listActive(userId: number): Promise<Pick<Session, 'id' | 'createdAt' | 'expiresAt' | 'userAgent'>[]> {
        const sessions = await this.sessionRepository.find({
            where: { user: { id: userId }, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
            order: { createdAt: 'DESC' },
        });

        return sessions.map(({ id, createdAt, expiresAt, userAgent }) => ({ id, createdAt, expiresAt, userAgent }));
    }

    /**
     * Housekeeping: expired rows carry no information once they can no longer be presented.
     *
     * Scheduled from `onModuleInit` rather than merely available. Written as a method nobody
     * called, the table would have grown by one row per login and per refresh forever — nothing
     * breaking loudly, which is exactly why it would go unnoticed.
     */
    async purgeExpired(): Promise<number> {
        const result = await this.sessionRepository.delete({ expiresAt: LessThan(new Date()) });
        const removed = result.affected ?? 0;

        if (removed > 0) {
            this.logger.log(`Purged ${removed} expired session(s)`);
        }
        return removed;
    }
}
