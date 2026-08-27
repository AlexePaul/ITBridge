import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns three columns that held bare strings and numbers into checked types.
 *
 * Written by hand. `migration:generate` produced DROP COLUMN plus ADD COLUMN for both enum
 * conversions, which discards every existing value — and would have failed outright on
 * `users.role`, since the new column is NOT NULL with no default. `ALTER ... TYPE ... USING`
 * converts in place instead, so a seeded database survives the change.
 *
 * `attendances.type` also loses its old default of 'normal', a value the service never wrote and
 * the frontend could not render.
 */
export class EnumColumns1787826933496 implements MigrationInterface {
    name = 'EnumColumns1787826933496';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- attendances.type: varchar -> enum -------------------------------------------------
        await queryRunner.query(`CREATE TYPE "public"."attendances_type_enum" AS ENUM('regular', 'make-up')`);

        // Rows written before the service settled on these two values carried 'normal' or
        // 'catch-up'. Map them rather than dropping them: 'normal' meant a child's own group, and
        // 'catch-up' was the DTO example's spelling of a make-up session.
        //
        // 'catch-up' needs its own statement. Folding it into the catch-all below turned every
        // make-up session into a regular one — the opposite of what the comment above promises,
        // and unrecoverable once the column is an enum.
        await queryRunner.query(`UPDATE "attendances" SET "type" = 'make-up' WHERE "type" = 'catch-up'`);
        await queryRunner.query(`UPDATE "attendances" SET "type" = 'regular' WHERE "type" NOT IN ('regular', 'make-up')`);
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "attendances" ALTER COLUMN "type" TYPE "public"."attendances_type_enum" USING "type"::"public"."attendances_type_enum"`,
        );
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "type" SET DEFAULT 'regular'`);

        // --- users.role: varchar -> enum ------------------------------------------------------
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('PARENT', 'ADMIN')`);
        // Normalised before the cast, for the same reason attendances are. `PUT /users/:id` used to
        // take `role` as a bare string, so a database written to by the old code can hold 'admin'
        // in the wrong case — and an uncastable value aborts the entire migration run, on boot,
        // with no obvious cause.
        await queryRunner.query(`UPDATE "users" SET "role" = upper("role") WHERE "role" <> upper("role")`);
        await queryRunner.query(`UPDATE "users" SET "role" = 'PARENT' WHERE "role" NOT IN ('PARENT', 'ADMIN')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"public"."users_role_enum"`);

        // --- groups.weekday: an int that has to be an ISO weekday ------------------------------
        // Kept as an int rather than an enum so that ordering by it gives the week in order; the
        // constraint is what stops 0 and 8 from being stored.
        await queryRunner.query(`ALTER TABLE "groups" ADD CONSTRAINT "CHK_groups_weekday_iso" CHECK ("weekday" BETWEEN 1 AND 7)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "CHK_groups_weekday_iso"`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE character varying(20) USING "role"::text`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);

        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "type" TYPE character varying(100) USING "type"::text`);
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "type" SET DEFAULT 'normal'`);
        await queryRunner.query(`DROP TYPE "public"."attendances_type_enum"`);
    }
}
