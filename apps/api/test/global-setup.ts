import { Client } from 'pg';

/**
 * Creează baza de test dacă lipsește. TypeORM rulează cu `synchronize: true`, deci face singur
 * tabelele — dar nu și baza. Rulează o singură dată, înaintea tuturor suitelor.
 *
 * Cât timp nu există migrări (E04), asta e și tot ce trebuie.
 */
export default async function globalSetup(): Promise<void> {
    const dbName = process.env.TEST_DB_NAME ?? 'itbridge_test';
    const client = new Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'itbridge',
        password: process.env.DB_PASSWORD ?? 'dev_password',
        database: 'postgres',
    });

    await client.connect();
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
        // Numele nu vine din input de utilizator, dar identificatorii nu se pot parametriza.
        await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    }
    await client.end();
}
