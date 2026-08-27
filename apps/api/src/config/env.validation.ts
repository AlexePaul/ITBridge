import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * The environment, validated once at startup. The application refuses to boot when it is
 * misconfigured, rather than running on defaults and failing somewhere far from the cause.
 *
 * The rule this exists for: `jwtConstants` used to fall back to `'defaultAccessSecret'` when the
 * variable was missing, silently. A production started without secrets would sign tokens anybody
 * could forge, and nothing anywhere would say so.
 */
export class EnvironmentVariables {
    @IsOptional()
    @IsIn(['development', 'test', 'production'])
    NODE_ENV?: 'development' | 'test' | 'production';

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

    /** `false` disables rate limiting entirely; see `AppThrottlerGuard`. Defaults to enabled. */
    @IsOptional()
    @IsIn(['true', 'false'])
    RATE_LIMIT_ENABLED?: string;
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

    if (problems.length > 0) {
        throw new Error(['Invalid environment configuration. The application will not start.', '', ...problems.map((p) => `  - ${p}`), ''].join('\n'));
    }

    return config;
}
