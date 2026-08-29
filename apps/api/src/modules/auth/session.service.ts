import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
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
     * Schedules the purge on a plain interval rather than through `@nestjs/schedule`. That was
     * once because the package could not be loaded by jest at all; it is now installed, pinned to
     * v6, which is the last CommonJS major — v12 is ESM and still dies in ts-jest. So the reason
     * this stays a bare interval is smaller than it was: a daily sweep needs no cron expression,
     * and moving it is a change nobody has had cause to make. E17/S3 wants one scheduler rather
     * than two, so the next person to touch this should move it onto `@Cron` and delete the timer.
     *
     * `unref()` keeps the timer from holding the process open, which would otherwise stop tests
     * and a graceful shutdown from ever finishing.
     */
    onModuleInit(): void {
        const oneDay = 24 * 60 * 60 * 1000;

        // Once at startup, then daily. Without the startup run, a process restarted more often than
        // every 24 hours never reaches the first tick — and a deploy a day, which is the plan for
        // this backend, means the purge would have run exactly zero times in production while the
        // table grew by a row per login and per refresh.
        void this.purgeExpired().catch((error: unknown) => this.logger.error('Session purge failed', String(error)));

        this.purgeTimer = setInterval(() => {
            void this.purgeExpired().catch((error: unknown) => this.logger.error('Session purge failed', String(error)));
        }, oneDay);
        this.purgeTimer.unref();
    }

    onModuleDestroy(): void {
        if (this.purgeTimer) clearInterval(this.purgeTimer);
    }

    constructor(
        @InjectRepository(Session) private readonly sessionRepository: Repository<Session>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

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

        // The whole rotation is one transaction that takes a write lock on the presented token's
        // row. That lock is what makes the family mechanism actually hold under concurrency.
        //
        // The earlier version claimed the token with a conditional UPDATE and then inserted the
        // successor outside any transaction. That is atomic for the claim but not for the pair, so
        // a second request carrying the same token could lose the claim, detect the replay and run
        // `revokeFamily` *before* the winner had inserted the successor — the sweep found nothing
        // to revoke and the successor stayed live. Reuse was reported and then not acted on, which
        // is the one outcome the whole design exists to prevent. Reproduced with five concurrent
        // refreshes: four 401s, and the successor token still worked afterwards.
        //
        // With the lock, the loser blocks until the winner commits, so by the time it sweeps the
        // family the successor row is committed and visible, and gets revoked with the rest.
        const outcome = await this.dataSource.transaction<{ replayOf: string } | { successor: Session }>(async (manager) => {
            // A raw `SELECT ... FOR UPDATE` rather than `findOne({ lock })`: TypeORM turns a
            // `relations` option into a LEFT JOIN, and Postgres refuses `FOR UPDATE` on the
            // nullable side of an outer join. The columns needed are few enough to name.
            const rows = await manager.query<
                { id: number; familyId: string; expiresAt: Date; revokedAt: Date | null; userAgent: string | null; user_id: number }[]
            >('SELECT id, "familyId", "expiresAt", "revokedAt", "userAgent", user_id FROM sessions WHERE "tokenHash" = $1 FOR UPDATE', [tokenHash]);

            const session = rows[0];

            if (!session) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            if (new Date(session.expiresAt).getTime() <= Date.now()) {
                throw new UnauthorizedException('Refresh token has expired');
            }

            if (session.revokedAt !== null) {
                // Someone already consumed this token — either a replay, or the legitimate client
                // racing itself. Either way the chain can no longer be trusted.
                //
                // Reported, not acted on, here: the sweep has to happen *outside* this transaction,
                // because the 401 that follows it would otherwise roll the revocation back along
                // with everything else. Releasing the lock first is safe — having seen `revokedAt`
                // set means the winner already committed, so its successor row exists and the sweep
                // will find it.
                return { replayOf: session.familyId };
            }

            await manager.update(Session, { id: session.id }, { revokedAt: new Date() });

            const successor = await manager.save(
                manager.create(Session, {
                    user: { id: session.user_id } as User,
                    tokenHash: SessionService.hash(nextToken),
                    familyId: session.familyId,
                    expiresAt,
                    revokedAt: null,
                    userAgent: userAgent?.slice(0, 255) ?? session.userAgent,
                }),
            );
            return { successor };
        });

        if ('replayOf' in outcome) {
            await this.revokeFamily(outcome.replayOf);
            throw new UnauthorizedException('Refresh token has already been used');
        }

        return outcome.successor;
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
