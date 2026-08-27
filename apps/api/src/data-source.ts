import './load-env';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { join } from 'path';

/**
 * The single source of truth for the database connection, shared by the running application and by
 * the TypeORM CLI. If the two ever drift apart, a migration generated locally stops matching what
 * the app expects at boot — which is exactly the failure this file exists to prevent.
 *
 * `synchronize` is deliberately absent. The schema now evolves only through the migrations in
 * `src/migrations`, reviewed in a PR and applied explicitly. See E04.
 */
export const dataSourceOptions: PostgresConnectionOptions = {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'itbridge',
    password: process.env.DB_PASSWORD || 'dev_password',
    database: process.env.DB_NAME || 'itbridge_db',

    // Globs rather than an explicit list: they resolve both to `.ts` under ts-node and the CLI, and
    // to the compiled `.js` under PM2.
    entities: [join(__dirname, '/**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, '/migrations/*{.ts,.js}')],

    synchronize: false,

    // Migrations are run explicitly, by `pnpm --filter api migration:run` in the deploy pipeline —
    // never on boot. A failed migration must stop the deploy before the new version takes traffic,
    // and `migrationsRun: true` would instead leave the process crash-looping.
    migrationsRun: false,
};

/** Used by the TypeORM CLI. It looks for a default export of type DataSource. */
export default new DataSource(dataSourceOptions);
