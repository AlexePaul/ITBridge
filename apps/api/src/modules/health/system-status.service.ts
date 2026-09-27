import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runningVersion } from 'src/common/running-version';
import { schoolLocalStamp } from 'src/common/school-clock';
import { swaggerEnabled } from 'src/config/bootstrap-options';
import { siteBase } from 'src/modules/auth/portal-urls';
import { transferDetails } from 'src/modules/invoice/school-identity';
import { missingMailConfiguration } from 'src/modules/mail/mail.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { dispatcherEnabled } from 'src/modules/mail/outbox.dispatcher';
import { smartBillMode, type SmartBillMode } from 'src/modules/smartbill/smartbill.config';
import { S3Service } from 'src/modules/storage/s3.service';
import { configurationNotes, type SystemNote } from './system-status.rules';
import { withTimeout } from './with-timeout';

/** What `GET /system/status` answers — `SystemStatus` in `@itbridge/types`, held equal by `contract.ts`. */
export interface SystemStatus {
    checkedAt: Date;
    schoolTime: string;
    environment: string;
    nodeVersion: string;
    uptimeSeconds: number;
    /** The commit this process runs (`runningVersion`), and when the process started. */
    build: { commit: string | null; committedAt: string | null; startedAt: Date };
    siteUrl: string;
    siteUrlConfigured: boolean;
    mail: { sending: boolean; providerConfigured: boolean; from: string | null; officeAddress: string };
    smartBillMode: SmartBillMode;
    transferDetails: boolean;
    storage: { bucket: string | null; reachable: boolean };
    swagger: boolean;
    migrations: { applied: number; last: string | null; pending: string[] };
    notes: SystemNote[];
}

/**
 * The backend's configuration, read where it runs — `/admin/sistem` (E06).
 *
 * Every value here is one the platform already reads somewhere else, through the same function, so the
 * page cannot describe a configuration the code does not have: the site address is the one the email
 * links are built from, "sending" is the dispatcher's own flag, the transfer details are what the
 * portal prints. Keys are reported present or absent, never shown.
 */
@Injectable()
export class SystemStatusService implements OnModuleInit {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly s3Service: S3Service,
    ) {}

    /** Asks git at boot, while the checkout is still the one this process loaded (`runningVersion`). */
    onModuleInit(): void {
        runningVersion();
    }

    async read(now: Date = new Date()): Promise<SystemStatus> {
        const environment = process.env.NODE_ENV?.trim() || 'development';
        const siteUrlConfigured = !!process.env.SITE_URL?.trim();
        const siteUrl = siteBase();
        const sending = dispatcherEnabled();
        const providerConfigured = missingMailConfiguration().length === 0;
        const mode = smartBillMode();
        const transfer = transferDetails() !== null;
        const bucket = process.env.AWS_S3_BUCKET?.trim() || null;
        const [reachable, migrations] = await Promise.all([this.storageReachable(), this.migrations()]);

        return {
            checkedAt: now,
            schoolTime: schoolLocalStamp(now),
            environment,
            nodeVersion: process.version,
            uptimeSeconds: Math.floor(process.uptime()),
            build: { ...runningVersion(), startedAt: new Date(now.getTime() - Math.round(process.uptime() * 1000)) },
            siteUrl,
            siteUrlConfigured,
            mail: { sending, providerConfigured, from: process.env.MAIL_FROM?.trim() || null, officeAddress: officeAddress() },
            smartBillMode: mode,
            transferDetails: transfer,
            storage: { bucket, reachable },
            swagger: swaggerEnabled(),
            migrations,
            notes: configurationNotes({
                environment,
                siteUrlConfigured,
                siteUrl,
                mailSending: sending,
                mailProviderConfigured: providerConfigured,
                transferDetails: transfer,
                storageReachable: reachable,
                pendingMigrations: migrations.pending.length,
                smartBillMode: mode,
            }),
        };
    }

    /** The same probe as `/ready`, with the same two seconds: a hung bucket is an unreachable one. */
    private async storageReachable(): Promise<boolean> {
        try {
            return await withTimeout(this.s3Service.isReachable(), 'object storage');
        } catch {
            return false;
        }
    }

    /**
     * What ran, against what this build carries. `deploy.sh` runs the migrations before the reload,
     * so a pending one here means a deploy that did not finish — or a laptop that skipped
     * `migration:run`, where the symptom is a query failing on a column that "does not exist".
     */
    private async migrations(): Promise<SystemStatus['migrations']> {
        const executed = await this.dataSource.query<{ name: string }[]>('SELECT name FROM migrations ORDER BY "timestamp" DESC, id DESC');
        const ran = new Set(executed.map((row) => row.name));
        const pending = this.dataSource.migrations
            .map((migration) => migration.name ?? migration.constructor.name)
            .filter((name) => !ran.has(name))
            .sort();
        return { applied: executed.length, last: executed[0]?.name ?? null, pending };
    }
}
