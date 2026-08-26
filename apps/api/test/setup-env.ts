/**
 * Run by jest *before* any application module is imported. That matters: `app.module.ts` reads
 * `process.env` at load time for the TypeORM configuration, so variables set later would not be
 * picked up.
 */
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_USER ??= 'itbridge';
process.env.DB_PASSWORD ??= 'dev_password';

// A database separate from the development one: the tests wipe it between suites.
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'itbridge_test';

// Deterministic secrets, so tokens issued during tests are verifiable.
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret';

// S3Service.onModuleInit throws without it and the application does not start at all.
process.env.AWS_REGION ??= 'eu-central-1';
