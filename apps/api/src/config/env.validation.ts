// class-transformer reads design-time types through the metadata reflection API. `main.ts` imports
// this polyfill already, but the standalone scripts (seed, schema drift) do not — and they reach
// this file through `load-env`.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, validateSync } from 'class-validator';
// Relative, unlike the rest of the backend: this file is loaded through `load-env` by the TypeORM
// CLI, which runs without `tsconfig-paths` — a `src/…` import here fails `migration:run`, and with
// it the deploy.
import { mayIssueFiscalDocuments } from '../modules/smartbill/smartbill.config';

/**
 * The environment, validated once at startup. The application refuses to boot when it is
 * misconfigured, rather than running on defaults and failing somewhere far from the cause.
 *
 * The rule this exists for: `jwtConstants` used to fall back to `'defaultAccessSecret'` when the
 * variable was missing, silently. A production started without secrets would sign tokens anybody
 * could forge, and nothing anywhere would say so.
 */
export class EnvironmentVariables {
    /**
     * `stage` is the staging backend's own value, and since E16 it carries weight: SmartBill has no
     * sandbox, and `SMARTBILL_MODE=live` is refused anywhere but `production` — see
     * `mayIssueFiscalDocuments`. Stage and production run the same build on the same kind of host,
     * so this is the one setting that can tell them apart, and stage has to say what it is.
     */
    @IsOptional()
    @IsIn(['development', 'test', 'stage', 'production'])
    NODE_ENV?: 'development' | 'test' | 'stage' | 'production';

    @IsOptional()
    @IsInt()
    PORT?: number;

    @IsString()
    @IsNotEmpty()
    DB_HOST: string;

    @IsInt()
    DB_PORT: number;

    @IsString()
    @IsNotEmpty()
    DB_USER: string;

    @IsString()
    @IsNotEmpty()
    DB_PASSWORD: string;

    @IsString()
    @IsNotEmpty()
    DB_NAME: string;

    // Long enough that a guessed or copy-pasted placeholder does not slip through. The refusal of
    // the known defaults is separate, below.
    @IsString()
    @MinLength(16, { message: 'JWT_ACCESS_TOKEN_SECRET must be at least 16 characters' })
    JWT_ACCESS_TOKEN_SECRET: string;

    @IsString()
    @MinLength(16, { message: 'JWT_REFRESH_TOKEN_SECRET must be at least 16 characters' })
    JWT_REFRESH_TOKEN_SECRET: string;

    @IsOptional()
    @IsInt()
    JWT_ACCESS_TOKEN_EXPIRATION?: number;

    @IsOptional()
    @IsInt()
    JWT_REFRESH_TOKEN_EXPIRATION?: number;

    /** Required: `S3Service.onModuleInit` throws without it, so the app would not start anyway. */
    @IsString()
    @IsNotEmpty()
    AWS_REGION: string;

    @IsOptional()
    @IsString()
    AWS_S3_BUCKET?: string;

    /** Set to a MinIO instance locally; unset in production, where the region resolves the endpoint. */
    @IsOptional()
    @IsString()
    AWS_S3_ENDPOINT?: string;

    @IsOptional()
    @IsString()
    AWS_ACCESS_KEY_ID?: string;

    @IsOptional()
    @IsString()
    AWS_SECRET_ACCESS_KEY?: string;

    /** Comma-separated. Without it, the production domain and the local frontend are allowed. */
    @IsOptional()
    @IsString()
    CORS_ORIGINS?: string;

    /**
     * Resend key for the mail this backend sends (E17). Deliberately **optional**: local
     * development has no key and must still boot. A missing key is not a silent no-op either — the
     * message is written to `outbox`, the send fails, and the reason stays on the row. `MailService`
     * says so once at startup rather than leaving the first sign of it in a table nobody watches.
     *
     * Not the same key as the contact form's `RESEND_API_KEY`, and not the same sender as
     * `CONTACT_FROM`. E17 decided on two of each so the public form cannot burn the quota the
     * school's own messages depend on.
     */
    @IsOptional()
    @IsString()
    MAIL_RESEND_API_KEY?: string;

    /** Sender for the above. Must be on a domain verified in Resend, or every send answers 403. */
    @IsOptional()
    @IsString()
    MAIL_FROM?: string;

    /** `false` stops the outbox scheduler; queueing still works. The e2e suites set it. */
    @IsOptional()
    @IsIn(['true', 'false'])
    MAIL_OUTBOX_ENABLED?: string;

    /**
     * Where the school's own operational mail goes — today, the daily reminder about registers
     * nobody took (E12/S7). Optional: unset falls back to the address the public site publishes,
     * `office@itbridgeschool.com`, so the reminder always has somewhere to land. It exists as a
     * variable so the office can redirect it without a deploy.
     */
    @IsOptional()
    @IsString()
    MAIL_OFFICE_ADDRESS?: string;

    /** `false` disables rate limiting entirely; see `AppThrottlerGuard`. Defaults to enabled. */
    @IsOptional()
    @IsIn(['true', 'false'])
    RATE_LIMIT_ENABLED?: string;

    /**
     * What the platform does with SmartBill — E16/S2. `off` (the default) sends nothing; `draft`
     * sends every invoice as a SmartBill draft, which gets no number and is not a fiscal document;
     * `live` issues real invoices. See `smartbill.config.ts`: SmartBill has no sandbox, so this
     * switch is the whole of the safety story.
     */
    @IsOptional()
    @IsIn(['off', 'draft', 'live'])
    SMARTBILL_MODE?: string;

    /** The e-mail the API token belongs to — Contul Meu > Integrari > API, in SmartBill Cloud. */
    @IsOptional()
    @IsString()
    SMARTBILL_USERNAME?: string;

    @IsOptional()
    @IsString()
    SMARTBILL_TOKEN?: string;

    /** The school's CIF, exactly as SmartBill Cloud has it — sent as `companyVatCode`. */
    @IsOptional()
    @IsString()
    SMARTBILL_CIF?: string;

    /** The platform's own invoice series. Nothing else may issue on it; see `reconcile`. */
    @IsOptional()
    @IsString()
    SMARTBILL_INVOICE_SERIES?: string;

    /**
     * The platform's own receipt series, for cash — E16/S5. Required in `live`: a cash payment is
     * recorded in SmartBill as a numbered `Chitanta`, and without a series there is nothing to
     * number it on. Like the invoice series, nothing else may issue on it.
     */
    @IsOptional()
    @IsString()
    SMARTBILL_RECEIPT_SERIES?: string;

    /** The unit on the invoice line, spelled as in the account. Defaults to `buc`. */
    @IsOptional()
    @IsString()
    SMARTBILL_MEASURING_UNIT?: string;

    /** Only when the account has "Foloseste cod produs" on. */
    @IsOptional()
    @IsString()
    SMARTBILL_PRODUCT_CODE?: string;

    /** A VAT rate as `GET /tax` names it. Both or neither with the percentage; neither means "not a VAT payer". */
    @IsOptional()
    @IsString()
    SMARTBILL_TAX_NAME?: string;

    @IsOptional()
    @IsString()
    SMARTBILL_TAX_PERCENTAGE?: string;

    /**
     * The name of the one database whose invoices are real. `SMARTBILL_MODE=live` refuses to start
     * without it matching `DB_NAME` — the rule `SEED_ALLOW_NON_LOCAL` follows, for the same reason:
     * a bare "yes" in an environment file authorises whatever database it is copied next to.
     */
    @IsOptional()
    @IsString()
    SMARTBILL_LIVE_DB?: string;

    /** Where the V1 API is. Unset in every real environment; the test suites point it at a fake. */
    @IsOptional()
    @IsString()
    SMARTBILL_BASE_URL?: string;

    /** Set only by the schema tooling, which needs the database settings and nothing else. */
    @IsOptional()
    @IsIn(['true', 'false'])
    SKIP_ENV_VALIDATION?: string;
}

/** Values that used to be silent fallbacks. Refused outright now, wherever they come from. */
const FORBIDDEN_SECRETS = new Set(['defaultAccessSecret', 'defaultRefreshSecret', 'changeme', 'secret']);

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
    const config = plainToInstance(EnvironmentVariables, raw, { enableImplicitConversion: true });

    const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
    const problems = errors.flatMap((e) => Object.values(e.constraints ?? {}));

    for (const key of ['JWT_ACCESS_TOKEN_SECRET', 'JWT_REFRESH_TOKEN_SECRET'] as const) {
        if (FORBIDDEN_SECRETS.has(String(raw[key]))) {
            problems.push(`${key} is set to a known placeholder value; generate a real secret`);
        }
    }

    if (config.JWT_ACCESS_TOKEN_SECRET && config.JWT_ACCESS_TOKEN_SECRET === config.JWT_REFRESH_TOKEN_SECRET) {
        // Shared secrets mean an access token is accepted as a refresh token and the other way
        // round, which quietly turns a 15-minute token into a 7-day one.
        problems.push('JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must differ');
    }

    problems.push(...smartBillProblems(raw));

    if (problems.length > 0) {
        throw new Error(['Invalid environment configuration. The application will not start.', '', ...problems.map((p) => `  - ${p}`), ''].join('\n'));
    }

    return config;
}

/**
 * The SmartBill settings that have to agree with each other — E16/S2.
 *
 * A mode that cannot work is refused at boot rather than left to fail on the first invoice: the
 * variable is somebody's explicit choice, and a deploy that refuses to start keeps the previous
 * version serving, which beats one that starts and quietly queues a month nobody will send.
 */
export function smartBillProblems(raw: Record<string, unknown>): string[] {
    const text = (key: string) => {
        const value = raw[key];
        return typeof value === 'string' ? value.trim() : '';
    };
    const mode = text('SMARTBILL_MODE') || 'off';
    const problems: string[] = [];

    if (text('SMARTBILL_TAX_NAME') !== '' && text('SMARTBILL_TAX_PERCENTAGE') === '') {
        problems.push('SMARTBILL_TAX_NAME is set without SMARTBILL_TAX_PERCENTAGE; set both, or neither for a school that is not a VAT payer');
    }
    if (text('SMARTBILL_TAX_PERCENTAGE') !== '') {
        const percentage = Number(text('SMARTBILL_TAX_PERCENTAGE'));
        if (text('SMARTBILL_TAX_NAME') === '') {
            problems.push('SMARTBILL_TAX_PERCENTAGE is set without SMARTBILL_TAX_NAME; SmartBill picks "Taxare inversa" for an unnamed 0% rate');
        } else if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
            problems.push('SMARTBILL_TAX_PERCENTAGE must be a number between 0 and 100');
        }
    }

    if (mode === 'off') return problems;

    const missing = ['SMARTBILL_USERNAME', 'SMARTBILL_TOKEN', 'SMARTBILL_CIF', 'SMARTBILL_INVOICE_SERIES'].filter((key) => text(key) === '');
    if (missing.length > 0) {
        problems.push(`SMARTBILL_MODE=${mode} needs ${missing.join(', ')}`);
    }

    if (mode === 'live') {
        if (text('SMARTBILL_RECEIPT_SERIES') === '') {
            problems.push('SMARTBILL_MODE=live needs SMARTBILL_RECEIPT_SERIES: a cash payment is recorded in SmartBill as a numbered receipt');
        }
        if (!mayIssueFiscalDocuments(raw)) {
            problems.push(
                `SMARTBILL_MODE=live issues real fiscal invoices, which only a production backend may do (NODE_ENV=${text('NODE_ENV') || '(unset)'} here); stage and development send drafts: SMARTBILL_MODE=draft`,
            );
        }
        const liveDb = text('SMARTBILL_LIVE_DB');
        const dbName = text('DB_NAME');
        if (liveDb === '' || liveDb !== dbName) {
            problems.push(
                `SMARTBILL_MODE=live issues real fiscal invoices; set SMARTBILL_LIVE_DB to this database's name (DB_NAME=${dbName || '(unset)'}) to confirm these are the families to invoice`,
            );
        }
    }

    return problems;
}
