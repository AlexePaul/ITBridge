import * as fs from 'fs';
import * as path from 'path';
import { validateEnv } from './config/env.validation';

// Loads `.env` from the working directory when it exists. This must be imported *before* any module
// that reads `process.env` at load time — `app.module.ts` does, for the TypeORM configuration.
// In production the variables come from the environment (PM2), and a missing file is not an error.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

// Validated here rather than through `@nestjs/config`: nothing injects a ConfigService, so the
// module would buy an ESM-only dependency (which jest cannot load) for no runtime benefit. This
// file is already the one imported before anything reads `process.env`, which is exactly where the
// check belongs — a misconfigured application now fails immediately, with a list of what is wrong.
validateEnv(process.env);
