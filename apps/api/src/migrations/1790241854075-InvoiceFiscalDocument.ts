import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The fiscal half of an invoice — E16/S2: where it stands with SmartBill, and the reference once it
 * is there.
 *
 * Columns on `invoices`, not a table beside it, for the reason `DeferredThumbnails` gives: the queue
 * is a question about the row ("sent yet?"), and a second table of rows-to-process is a second
 * answer that drifts from the first the day an invoice is deleted.
 *
 * Every existing invoice gets `fiscalStatus` null, which is exactly right: none was ever sent, none
 * is meant to be — they were issued before the integration, and E15's rule for old invoices is that
 * they stay as they were, not recomputed and not re-issued. No backfill.
 */
export class InvoiceFiscalDocument1790241854075 implements MigrationInterface {
    name = 'InvoiceFiscalDocument1790241854075';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."invoices_fiscalstatus_enum" AS ENUM('pending', 'uncertain', 'review', 'draft', 'issued', 'failed')`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalStatus" "public"."invoices_fiscalstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalSeries" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalNumber" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalDocumentId" integer`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalDocumentUrl" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalViewUrl" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalIssuedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalNextAttemptAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalExpectedNumber" integer`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "fiscalLastError" character varying(1000)`);
        await queryRunner.query(`CREATE INDEX "IDX_invoices_fiscal_queue" ON "invoices" ("fiscalStatus", "fiscalNextAttemptAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_invoices_fiscal_queue"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalLastError"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalExpectedNumber"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalNextAttemptAt"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalAttempts"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalIssuedAt"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalViewUrl"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalDocumentUrl"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalDocumentId"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalNumber"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalSeries"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "fiscalStatus"`);
        await queryRunner.query(`DROP TYPE "public"."invoices_fiscalstatus_enum"`);
    }
}
