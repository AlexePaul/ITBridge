import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SmartBill's side of an invoice as last read — E16/S8's divergence check: what it counts as
 * collected, what it says the total is, and when it was read. Only SmartBill's half: the verdict is
 * derived when the report is read, so there is no column for it.
 *
 * Every existing invoice starts unread, which is exactly right: the check reads the never-read first.
 */
export class InvoiceFiscalCheck1790250227295 implements MigrationInterface {
    name = 'InvoiceFiscalCheck1790250227295';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalPaidAmount" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalTotalAmount" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalCheckedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_invoices_fiscal_check" ON "invoices" ("fiscalStatus", "fiscalCheckedAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_invoices_fiscal_check"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalCheckedAt"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalTotalAmount"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalPaidAmount"`);
    }
}
