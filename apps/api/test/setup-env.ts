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

// Deterministic secrets, so tokens issued during tests are verifiable. Long enough and distinct
// enough to satisfy the startup validation in `config/env.validation.ts`.
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-value';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-value';

// S3Service.onModuleInit throws without it and the application does not start at all.
process.env.AWS_REGION ??= 'eu-central-1';

// Object storage points at MinIO, from docker-compose locally and from a service container in CI.
// Only `invoice-pdf.e2e-spec.ts` actually reaches it; every other suite stubs S3 away.
process.env.AWS_S3_ENDPOINT ??= `http://localhost:${process.env.MINIO_PORT ?? '9000'}`;
process.env.AWS_S3_BUCKET ??= 'itbridge-local';
process.env.AWS_ACCESS_KEY_ID ??= 'itbridge';
process.env.AWS_SECRET_ACCESS_KEY ??= 'dev_password';

// Off unless a suite asks for it; see `createTestApp`.
process.env.RATE_LIMIT_ENABLED = 'false';

// The outbox scheduler stays off in the integration suites. It is a background timer that claims
// rows and moves `attempts` and `nextAttemptAt` forward; a pass landing in the middle of a test
// would change the table underneath its assertions, intermittently and only on a slow machine.
// Queueing is unaffected, so a suite can still check that a message was written.
process.env.MAIL_OUTBOX_ENABLED = 'false';
