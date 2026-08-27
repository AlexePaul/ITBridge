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

        // CHECK constraints separately, because the schema builder compares them by name: a
        // migration that creates `CHK_groups_weekday_iso` with a *different* expression than the
        // entity declares looks identical to it. The names matching is exactly what makes the
        // mismatch invisible, so the expressions are compared here by hand.
        pending.push(...(await checkConstraintDrift(probe)));
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

/**
 * SQL keywords and operators are dropped: Postgres rewrites `BETWEEN 1 AND 7` as
 * `((weekday >= 1) AND (weekday <= 7))`, so comparing the wording would report drift on every
 * constraint. What survives normalisation is the columns named and the literals compared against,
 * and those are what actually drifts — a bound moved from 1..7 to 0..6, or the wrong column.
 */
const SQL_NOISE = new Set(['check', 'between', 'and', 'or', 'not', 'is', 'null', 'in', 'true', 'false', 'any', 'all', 'text', 'numeric', 'integer']);

function significantTokens(expression: string): Set<string> {
    const tokens = expression.toLowerCase().match(/[a-z_][a-z_0-9]*|\d+/g) ?? [];
    return new Set(tokens.filter((token) => !SQL_NOISE.has(token)));
}

/**
 * Compares every `@Check` on an entity with the constraint actually in the database.
 *
 * Postgres normalises an expression when it stores it (`"weekday" BETWEEN 1 AND 7` comes back as
 * `((weekday >= 1) AND (weekday <= 7))`), so this compares the set of literals and column names
 * rather than the text: enough to catch a bound that drifted, without re-implementing the parser.
 */
async function checkConstraintDrift(dataSource: DataSource): Promise<string[]> {
    const rows = await dataSource.query<{ conname: string; expr: string }[]>(
        `SELECT conname, pg_get_constraintdef(oid) AS expr FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const inDatabase = new Map(rows.map((row) => [row.conname, row.expr]));

    const problems: string[] = [];
    for (const metadata of dataSource.entityMetadatas) {
        for (const check of metadata.checks) {
            if (!check.name) continue;

            const actual = inDatabase.get(check.name);
            if (actual === undefined) {
                problems.push(`-- CHECK constraint "${check.name}" on "${metadata.tableName}" is declared on the entity but missing from the database`);
                continue;
            }

            const expected = significantTokens(check.expression ?? '');
            const found = significantTokens(actual);
            const missing = [...expected].filter((token) => !found.has(token));

            if (missing.length > 0) {
                problems.push(`-- CHECK constraint "${check.name}" differs: entity says ${check.expression ?? ''}, database says ${actual}`);
            }
        }
    }
    return problems;
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
