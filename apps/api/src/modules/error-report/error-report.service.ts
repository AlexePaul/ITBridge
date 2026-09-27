import { ConsoleLogger, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ErrorOccurrence, ErrorReport } from 'src/entities/error-report.entity';
import { User, isAccountActive } from 'src/entities/user.entity';
import { ErrorSource } from 'src/enum/error-source.enum';
import {
    MESSAGE_MAX_LENGTH,
    NAME_MAX_LENGTH,
    ORIGIN_MAX_LENGTH,
    RECENT_OCCURRENCES,
    STACK_MAX_LENGTH,
    clip,
    fingerprint,
    occurrencePath,
    scrub,
} from './error-report.rules';
import { QueryErrorReportsDto } from './dto/query-error-reports.dto';

/** One error, as whoever caught it describes it. Scrubbing and cutting to size happen here, not there. */
export interface ErrorInput {
    source: ErrorSource;
    origin: string;
    errorName: string;
    message: string;
    stack?: string | null;
    statusCode?: number | null;
    code?: string | null;
    /** The reference the screen showed — a request id, or the browser's own. */
    ref?: string | null;
    userId?: number | null;
    path?: string | null;
    at?: Date;
}

/** An occurrence as the screen reads it: the account, and the family behind it, looked up now. */
export interface ErrorOccurrenceView extends ErrorOccurrence {
    username: string | null;
    profileId: number | null;
    familyName: string | null;
}

export interface ErrorReportView {
    id: number;
    source: ErrorSource;
    origin: string;
    errorName: string;
    message: string;
    stack: string | null;
    statusCode: number | null;
    code: string | null;
    occurrences: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt: Date | null;
    recent: ErrorOccurrenceView[];
}

export interface ErrorReportSummary {
    open: number;
}

/**
 * Writes at most this many rows at once. Past it an error is dropped, not queued: the case is a
 * database that is not answering, where every write would fail anyway, and a queue would only grow
 * with the outage it cannot record.
 */
const MAX_PENDING_WRITES = 50;

/**
 * The error record — E06 S1.
 *
 * **Recording never touches what failed.** `record` returns before anything is written and nothing it
 * does can throw into its caller: the filter has a response to send, the job a loop to carry on with,
 * and neither may break a second time because the record of the first time could not be written. A
 * write that fails says so on the console as a warning — never through `Logger.error`, which would be
 * an error about recording an error, recorded.
 *
 * **Shutdown waits for what is in flight**, in `onModuleDestroy`, which runs before TypeORM closes its
 * pool: `pm2 reload` would otherwise drop exactly the errors the old process met on its way out.
 */
/** Browser reports one account may file in an hour; past that, what breaks is already on the screen. */
export const BROWSER_REPORTS_PER_ACCOUNT_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class ErrorReportService implements OnModuleDestroy {
    /** Straight to the console: see above. */
    private readonly console = new ConsoleLogger('ErrorReport');
    private readonly pending = new Set<Promise<void>>();
    private closed = false;
    /** Per account: when its hour started, and how many browser reports it filed in it. */
    private readonly browserBudget = new Map<number, { since: number; count: number }>();

    constructor(
        @InjectRepository(ErrorReport) private readonly reports: Repository<ErrorReport>,
        @InjectRepository(User) private readonly users: Repository<User>,
    ) {}

    /**
     * Whether a report from this account's browser is taken — review of 27 September 2026.
     *
     * Every field of one is the caller's, so grouping cannot fold them together: a registration
     * anybody can make, and a loop, could file a row per request, each kept thirty days, and bury the
     * faults that matter under them. Taken from an active, unsuspended account only — a stranger's
     * fresh registration has none of the school's screens to break — and at most
     * `BROWSER_REPORTS_PER_ACCOUNT_PER_HOUR` an hour each. The rest are dropped without a word: the
     * answer never said anything about the row. In memory, like the throttle; one process (CLAUDE.md).
     */
    async takesBrowserReport(userId: number, now: number = Date.now()): Promise<boolean> {
        const budget = this.browserBudget.get(userId);
        if (budget && now - budget.since < HOUR_MS) {
            if (budget.count >= BROWSER_REPORTS_PER_ACCOUNT_PER_HOUR) return false;
            budget.count += 1;
        } else {
            if (this.browserBudget.size > 1000) {
                for (const [id, entry] of this.browserBudget) if (now - entry.since >= HOUR_MS) this.browserBudget.delete(id);
            }
            this.browserBudget.set(userId, { since: now, count: 1 });
        }
        const account = await this.users.findOne({
            where: { id: userId },
            select: { id: true, role: true, emailConfirmedAt: true, approvalStatus: true, suspendedAt: true },
        });
        return account !== null && account.suspendedAt === null && isAccountActive(account);
    }

    record(input: ErrorInput): void {
        if (this.closed) return;
        if (this.pending.size >= MAX_PENDING_WRITES) {
            this.console.warn(`Dropped an error from ${input.origin}: ${MAX_PENDING_WRITES} writes are already waiting.`);
            return;
        }
        const write: Promise<void> = this.write(input)
            .catch((error: unknown) => {
                this.console.warn(`Could not record an error from ${input.origin}: ${error instanceof Error ? error.message : String(error)}`);
            })
            .finally(() => this.pending.delete(write));
        this.pending.add(write);
    }

    /** Resolves once everything handed to `record` so far has been written, or given up on. */
    async flush(): Promise<void> {
        while (this.pending.size > 0) {
            await Promise.all([...this.pending]);
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.closed = true;
        await this.flush();
    }

    private async write(input: ErrorInput): Promise<void> {
        const at = input.at ?? new Date();
        const origin = clip(scrub(input.origin || '(necunoscut)'), ORIGIN_MAX_LENGTH);
        const errorName = clip(input.errorName || 'Error', NAME_MAX_LENGTH);
        const message = clip(scrub(input.message || '(fără mesaj)'), MESSAGE_MAX_LENGTH);
        const stack = input.stack ? clip(scrub(input.stack), STACK_MAX_LENGTH) : null;
        const occurrence: ErrorOccurrence = {
            at: at.toISOString(),
            ref: input.ref ?? null,
            userId: input.userId ?? null,
            path: occurrencePath(input.path),
        };

        // One statement, so two occurrences of one fault in the same instant are one row counted
        // twice, never two rows: the partial unique index decides, as it does for the unassigned files.
        await this.reports.query(
            `INSERT INTO "error_reports"
                ("fingerprint", "source", "origin", "errorName", "message", "stack", "statusCode", "code",
                 "occurrences", "firstSeenAt", "lastSeenAt", "recent")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9, jsonb_build_array($10::jsonb))
             ON CONFLICT ("fingerprint") WHERE "resolvedAt" IS NULL
             DO UPDATE SET
                "occurrences" = "error_reports"."occurrences" + 1,
                "lastSeenAt" = GREATEST("error_reports"."lastSeenAt", EXCLUDED."lastSeenAt"),
                "message" = EXCLUDED."message",
                "stack" = COALESCE(EXCLUDED."stack", "error_reports"."stack"),
                "statusCode" = EXCLUDED."statusCode",
                "code" = EXCLUDED."code",
                "recent" = (
                    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                    FROM jsonb_array_elements(EXCLUDED."recent" || "error_reports"."recent") WITH ORDINALITY AS item
                    WHERE item.ordinality <= ${RECENT_OCCURRENCES}
                )`,
            [
                fingerprint({ source: input.source, origin, errorName, message, stack }),
                input.source,
                origin,
                errorName,
                message,
                stack,
                input.statusCode ?? null,
                input.code ? clip(input.code, 100) : null,
                at,
                JSON.stringify(occurrence),
            ],
        );
    }

    /**
     * Newest first. The open ones by default; a reference searches everything, fixed or not — a
     * family reading out the code from a screen does not know whether somebody already fixed it.
     */
    async list(query: QueryErrorReportsDto): Promise<ErrorReportView[]> {
        const qb = this.reports
            .createQueryBuilder('report')
            .orderBy('report.lastSeenAt', 'DESC')
            .take(query.limit ?? 100);

        if (query.ref) {
            qb.andWhere(`EXISTS (SELECT 1 FROM jsonb_array_elements(report.recent) AS occurrence WHERE lower(occurrence->>'ref') LIKE :ref)`, {
                ref: `${query.ref.toLowerCase()}%`,
            });
        } else if (query.state === 'resolved') {
            qb.andWhere('report.resolvedAt IS NOT NULL');
        } else if (query.state !== 'all') {
            qb.andWhere('report.resolvedAt IS NULL');
        }
        if (query.source) qb.andWhere('report.source = :source', { source: query.source });

        return this.toViews(await qb.getMany());
    }

    /** The number in the menu. `IsNull()`, never `undefined`: in a `where`, the second means "any". */
    async summary(): Promise<ErrorReportSummary> {
        return { open: await this.reports.count({ where: { resolvedAt: IsNull() } }) };
    }

    /** Marked fixed. A second press is the same fact, not an error. */
    async resolve(id: number): Promise<ErrorReportView> {
        await this.reports
            .createQueryBuilder()
            .update(ErrorReport)
            .set({ resolvedAt: () => 'now()' })
            .where('id = :id', { id })
            .andWhere('"resolvedAt" IS NULL')
            .execute();
        const report = await this.reports.findOne({ where: { id } });
        if (!report) throw new NotFoundException({ message: `Error report ${id} not found`, error: 'ERROR_REPORT_NOT_FOUND' });
        const [view] = await this.toViews([report]);
        return view;
    }

    /** The retention pass — `RetentionService.run`. By the last time the fault was seen, fixed or not. */
    async removeSeenBefore(cutoff: Date): Promise<number> {
        const result = await this.reports.createQueryBuilder().delete().from(ErrorReport).where('"lastSeenAt" < :cutoff', { cutoff }).execute();
        return result.affected ?? 0;
    }

    /** Puts a name to each account: the family's, when it has one, which is how the office knows people. */
    private async toViews(reports: ErrorReport[]): Promise<ErrorReportView[]> {
        const userIds = [
            ...new Set(reports.flatMap((report) => report.recent.map((occurrence) => occurrence.userId)).filter((id): id is number => id !== null)),
        ];
        const accounts = userIds.length ? await this.users.find({ where: { id: In(userIds) }, relations: { profile: true } }) : [];
        const byId = new Map(accounts.map((account) => [account.id, account]));

        return reports.map((report) => ({
            id: report.id,
            source: report.source,
            origin: report.origin,
            errorName: report.errorName,
            message: report.message,
            stack: report.stack,
            statusCode: report.statusCode,
            code: report.code,
            occurrences: report.occurrences,
            firstSeenAt: report.firstSeenAt,
            lastSeenAt: report.lastSeenAt,
            resolvedAt: report.resolvedAt,
            recent: report.recent.map((occurrence) => {
                const account = occurrence.userId !== null ? byId.get(occurrence.userId) : undefined;
                const profile = account?.profile ?? null;
                return {
                    ...occurrence,
                    username: account?.username ?? null,
                    profileId: profile?.id ?? null,
                    familyName: profile ? `${profile.firstName} ${profile.lastName}`.trim() : null,
                };
            }),
        }));
    }
}
