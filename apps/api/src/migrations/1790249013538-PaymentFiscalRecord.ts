import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Where a payment stands with SmartBill — E16/S5: the invoice's fiscal queue, one level down, as
 * columns on `payments` for the same reason `InvoiceFiscalDocument` put them on `invoices`.
 *
 * `smartbillReference` goes. It was a placeholder from S1 ("the receipt's id, once S2 pushes them
 * there") and the answer SmartBill actually gives has no id: a receipt comes back as a series and a
 * number, a transfer as nothing at all. No row ever held a value, so nothing is carried over.
 *
 * Every existing payment gets `fiscalStatus` null: none was recorded in SmartBill, and none of their
 * invoices is a fiscal document there to record it on. No backfill.
 */
export class PaymentFiscalRecord1790249013538 implements MigrationInterface {
    name = 'PaymentFiscalRecord1790249013538';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "smartbillReference"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_fiscalstatus_enum" AS ENUM('pending', 'uncertain', 'review', 'recorded', 'failed')`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalStatus" "public"."payments_fiscalstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalReceiptSeries" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalReceiptNumber" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalRecordedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalNextAttemptAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalExpectedPaid" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalExpectedNumber" integer`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "fiscalLastError" character varying(1000)`);
        await queryRunner.query(`CREATE INDEX "IDX_payments_fiscal_queue" ON "payments" ("fiscalStatus", "fiscalNextAttemptAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_fiscal_queue"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalLastError"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalExpectedNumber"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalExpectedPaid"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalNextAttemptAt"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalAttempts"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalRecordedAt"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalReceiptNumber"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalReceiptSeries"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "fiscalStatus"`);
        await queryRunner.query(`DROP TYPE "public"."payments_fiscalstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "smartbillReference" character varying(100)`);
    }
}
