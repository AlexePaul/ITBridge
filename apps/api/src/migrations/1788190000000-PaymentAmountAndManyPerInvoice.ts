import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A payment becomes a figure, not a flag — E16/S1.
 *
 * The old shape was a one-to-one from the invoice (`invoices.payment_id`) to a row holding only a
 * free-text method and a date. No amount, so nothing could ever be reconciled against a bank
 * statement; one row per invoice, so a family paying in two instalments was unrepresentable; and
 * "paid" was a status set by hand next to the payment instead of derived from it.
 *
 * Hand-written rather than generated, because the interesting part is the data:
 * - the FK moves from `invoices.payment_id` to `payments.invoice_id` — every existing link is
 *   carried over before the old column is dropped;
 * - existing payments get `amount` backfilled from their invoice's total: under the old model a
 *   payment row *meant* "paid in full", so the invoice total is what that row always claimed;
 * - the free-text method collapses to the closed list: 'cash' stays cash, anything else
 *   ('card', 'credit_card', 'other') becomes bank_transfer — not cash, because the one thing the
 *   old values agree on is that the money did not cross the desk;
 * - a payment attached to no invoice (possible under the old model, where the link lived on the
 *   other side) is dropped: it never marked anything paid, so it carries no information.
 *
 * `down` restores the schema but not the fiction: reversing keeps one payment per invoice (the
 * largest, as the closest thing to the old "the" payment) and re-links it.
 */
export class PaymentAmountAndManyPerInvoice1788190000000 implements MigrationInterface {
    name = 'PaymentAmountAndManyPerInvoice1788190000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // New columns, nullable first so the backfill can run.
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('cash', 'bank_transfer')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('initiated', 'succeeded', 'failed', 'reversed')`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "invoice_id" integer`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "amount" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "status" "public"."payments_status_enum" NOT NULL DEFAULT 'succeeded'`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "externalReference" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "smartbillReference" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "notes" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "recorded_by_id" integer`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);

        // Carry every existing link over, and give each row the figure it always implied.
        await queryRunner.query(`UPDATE "payments" p SET "invoice_id" = i."id", "amount" = i."amount" FROM "invoices" i WHERE i."payment_id" = p."id"`);
        await queryRunner.query(`DELETE FROM "payments" WHERE "invoice_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "invoice_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "amount" SET NOT NULL`);

        // Free text collapses to the closed list.
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payments_method_enum" USING (CASE WHEN "method" = 'cash' THEN 'cash' ELSE 'bank_transfer' END)::"public"."payments_method_enum"`,
        );
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'cash'`);

        // The link now lives on the payment side; the old column goes.
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_02781c49b25ceb502571f0315f6"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "REL_02781c49b25ceb502571f0315f"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "payment_id"`);

        await queryRunner.query(
            `ALTER TABLE "payments" ADD CONSTRAINT "FK_563a5e248518c623eebd987d43e" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "payments" ADD CONSTRAINT "FK_48f20e5f3bafd282ca876aef968" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_48f20e5f3bafd282ca876aef968"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_563a5e248518c623eebd987d43e"`);

        await queryRunner.query(`ALTER TABLE "invoices" ADD "payment_id" integer`);
        // One payment per invoice again: keep the largest as "the" payment, drop the rest.
        await queryRunner.query(
            `UPDATE "invoices" i SET "payment_id" = (SELECT p."id" FROM "payments" p WHERE p."invoice_id" = i."id" ORDER BY p."amount" DESC, p."id" ASC LIMIT 1)`,
        );
        await queryRunner.query(`DELETE FROM "payments" p WHERE NOT EXISTS (SELECT 1 FROM "invoices" i WHERE i."payment_id" = p."id")`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "REL_02781c49b25ceb502571f0315f" UNIQUE ("payment_id")`);
        await queryRunner.query(
            `ALTER TABLE "invoices" ADD CONSTRAINT "FK_02781c49b25ceb502571f0315f6" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );

        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" TYPE character varying(100) USING "method"::text`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'cash'`);

        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "recorded_by_id"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "notes"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "smartbillReference"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "externalReference"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "amount"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "invoice_id"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    }
}
