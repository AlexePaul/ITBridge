import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The secret behind the „nu mai vreau" link in a marketing message — E17 S4.
 *
 * Three statements rather than the one TypeORM generates, and the difference matters. The generated
 * form is `ADD COLUMN ... NOT NULL` with no default, which **fails on any table that already has
 * rows** — and `deploy.sh` runs `migration:run` between the build and `pm2 reload`, so a migration
 * that fails is a branch that stops reaching `api-stage`. Stage's database is seed data, but it is
 * not empty. So: add it nullable, give every existing row a value, then tighten.
 *
 * The backfill is `gen_random_uuid()` twice with the hyphens taken out — 64 hex characters, core
 * Postgres since 13, no extension. It only has to be unguessable and unique; the entity generates
 * 32 random bytes for every row written after this.
 */
export class MarketingUnsubscribeToken1789057117963 implements MigrationInterface {
    name = 'MarketingUnsubscribeToken1789057117963';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "unsubscribeToken" character varying(64)`);
        await queryRunner.query(
            `UPDATE "profiles" SET "unsubscribeToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "unsubscribeToken" IS NULL`,
        );
        await queryRunner.query(`ALTER TABLE "profiles" ALTER COLUMN "unsubscribeToken" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "UQ_29175e81e234caf8f665b6d701a" UNIQUE ("unsubscribeToken")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "UQ_29175e81e234caf8f665b6d701a"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "unsubscribeToken"`);
    }
}
