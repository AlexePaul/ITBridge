import * as fs from 'fs';
import * as path from 'path';

// Încarcă `.env` din directorul de lucru, dacă există. Trebuie importat *înaintea* oricărui modul
// care citește `process.env` la încărcare — `app.module.ts` o face, pentru configurația TypeORM.
// În producție variabilele vin din mediu (PM2), nu din fișier, iar absența lui nu e o eroare.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
}
