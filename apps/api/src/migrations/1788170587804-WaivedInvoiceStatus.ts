import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `waived` — a month handled with nothing to pay (E15).
 *
 * A child who could not come at all, or a month the school chose not to charge for. The row exists
 * *because* there is no money in it: a family with no invoice for October is otherwise
 * indistinguishable from a family whose October nobody got round to, and only the second needs
 * chasing.
 *
 * Adding a value to a Postgres enum means rebuilding the type, which is why this is six statements
 * for one word. Existing rows keep their status untouched — the `USING ... ::text::` cast maps each
 * old value onto the identically-named new one.
 */
export class WaivedInvoiceStatus1788170587804 implements MigrationInterface {
    name = 'WaivedInvoiceStatus1788170587804';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."invoices_status_enum" RENAME TO "invoices_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_status_enum" AS ENUM('pending', 'paid', 'overdue', 'waived')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "invoices" ALTER COLUMN "status" TYPE "public"."invoices_status_enum" USING "status"::"text"::"public"."invoices_status_enum"`,
        );
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."invoices_status_enum_old" AS ENUM('pending', 'paid', 'overdue')`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "invoices" ALTER COLUMN "status" TYPE "public"."invoices_status_enum_old" USING "status"::"text"::"public"."invoices_status_enum_old"`,
        );
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."invoices_status_enum_old" RENAME TO "invoices_status_enum"`);
    }
}
