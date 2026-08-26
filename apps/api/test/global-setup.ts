import { Client } from 'pg';

/**
 * Creates the test database when it is missing. TypeORM runs with `synchronize: true`, so it
 * builds the tables itself — but not the database. Runs once, before every suite.
 *
 * As long as there are no migrations (E04), this is all that is needed.
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
        // The name does not come from user input, but identifiers cannot be parameterised.
        await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    }
    await client.end();
}
