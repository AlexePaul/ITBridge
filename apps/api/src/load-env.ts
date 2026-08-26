import * as fs from 'fs';
import * as path from 'path';

// Loads `.env` from the working directory when it exists. This must be imported *before* any module
// that reads `process.env` at load time — `app.module.ts` does, for the TypeORM configuration.
// In production the variables come from the environment (PM2), and a missing file is not an error.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
}
