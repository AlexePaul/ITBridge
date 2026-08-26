/**
 * Rulat de jest *înainte* de orice import de modul de aplicație. Contează: `app.module.ts` citește
 * `process.env` la încărcare, pentru configurația TypeORM, deci variabilele setate mai târziu nu ar
 * mai fi văzute.
 */
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_USER ??= 'itbridge';
process.env.DB_PASSWORD ??= 'dev_password';

// Bază separată de cea de dezvoltare: testele o golesc între suite.
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'itbridge_test';

// Secrete deterministe, ca tokenurile emise în test să fie verificabile.
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret';

// S3Service.onModuleInit aruncă fără ea și aplicația nu pornește deloc.
process.env.AWS_REGION ??= 'eu-central-1';
