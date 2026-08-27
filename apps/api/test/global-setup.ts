// Same defaults the suites get. jest runs `globalSetup` *before* `setupFiles`, so without this
// import the environment here would be whatever the shell happened to export — and the bucket
// creation below would silently skip.
import './setup-env';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
    // jest reports a failure in here as a bare `AggregateError` with no cause attached, which is
    // useless: the usual reason is that `docker compose up -d` has not been run, or MinIO is up but
    // its container never started. Each step says what it was doing and what to do about it.
    await withContext('connecting to Postgres and preparing the test database', prepareDatabase);
    await withContext('creating the object storage bucket', ensureBucket);
}

async function withContext(what: string, step: () => Promise<void>): Promise<void> {
    try {
        await step();
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            [
                `Test setup failed while ${what}.`,
                `  ${reason}`,
                '',
                '  Both Postgres and MinIO have to be running:',
                '    docker compose up -d',
                '',
                '  If a port is already taken, set MINIO_PORT / MINIO_CONSOLE_PORT in .env and',
                '  point AWS_S3_ENDPOINT at the same port.',
            ].join('\n'),
        );
    }
}

async function prepareDatabase(): Promise<void> {
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

/**
 * Creates the bucket when running against a local endpoint, so the suite does not depend on the
 * MinIO image auto-provisioning one. Skipped entirely without `AWS_S3_ENDPOINT` — that means real
 * AWS, where the tests have no business creating buckets.
 */
async function ensureBucket(): Promise<void> {
    const endpoint = process.env.AWS_S3_ENDPOINT;
    const bucket = process.env.AWS_S3_BUCKET;
    if (!endpoint || !bucket) return;

    const client = new S3Client({
        region: process.env.AWS_REGION ?? 'eu-central-1',
        endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'itbridge',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'dev_password',
        },
    });

    try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
        // Already there is the normal case on a second run.
        const name = (error as { name?: string }).name;
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    } finally {
        client.destroy();
    }
}
