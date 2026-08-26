import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';

/**
 * Prepares the test database once, before every suite: creates it if missing, then brings it to the
 * current schema by running the migrations.
 *
 * This used to rely on `synchronize: true` building the tables at boot. It no longer can — and that
 * is the point: the tests now exercise the same schema path production does, so a migration that is
 * missing or broken fails the test run rather than being papered over.
 */
export default async function globalSetup(): Promise<void> {
    const dbName = process.env.TEST_DB_NAME ?? 'itbridge_test';

    const admin = new Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'itbridge',
        password: process.env.DB_PASSWORD ?? 'dev_password',
        database: 'postgres',
    });

    await admin.connect();
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
        // The name does not come from user input, but identifiers cannot be parameterised.
        await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    }
    await admin.end();

    const dataSource = new DataSource({ ...dataSourceOptions, database: dbName, logging: false });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
}
