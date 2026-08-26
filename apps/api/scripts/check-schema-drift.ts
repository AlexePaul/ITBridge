import '../src/load-env';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';

/**
 * Fails when the entities and the migrations have drifted apart.
 *
 * With `synchronize: false`, changing an entity without writing a migration is silent: everything
 * compiles, the tests pass against the old schema, and the application only breaks at runtime in
 * production, on the first query touching the new column. This check closes that gap by building a
 * throwaway database from the migrations and asking TypeORM whether it would still need to change
 * anything to match the entities.
 *
 * Runs in CI on every PR. See E04/S2.
 */
async function main(): Promise<void> {
    const dbName = `itbridge_drift_${process.pid}`;

    const admin = new DataSource({ ...dataSourceOptions, database: 'postgres', logging: false });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    const probe = new DataSource({ ...dataSourceOptions, database: dbName, logging: false });
    let pending: string[] = [];
    try {
        await probe.initialize();
        await probe.runMigrations();

        // What `synchronize` *would* run against a database already at the latest migration.
        // Anything here is an entity change nobody wrote a migration for.
        const sqlInMemory = await probe.driver.createSchemaBuilder().log();
        pending = sqlInMemory.upQueries.map((q) => q.query);
    } finally {
        if (probe.isInitialized) await probe.destroy();
        const cleanup = new DataSource({ ...dataSourceOptions, database: 'postgres', logging: false });
        await cleanup.initialize();
        await cleanup.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await cleanup.destroy();
    }

    if (pending.length > 0) {
        console.error('Schema drift: the entities do not match the migrations.\n');
        console.error('TypeORM would need to run these statements to catch the database up:\n');
        for (const query of pending) console.error(`  ${query}`);
        console.error('\nGenerate a migration for the change:');
        console.error('  pnpm --filter api migration:generate src/migrations/<Name>\n');
        process.exit(1);
    }

    console.log('No schema drift: entities and migrations agree.');
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
