import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The bank statement's incoming lines — E16/S8. A table of its own, because a line is not a state of
 * a row that already exists: a refund or a grant arrives on the account the way a family's transfer
 * does, and it has to be somewhere while a person decides what it is.
 *
 * `payment_id` is `SET NULL`: where a line stands is derived from it, so a payment deleted later puts
 * the line back in the queue by itself. The fingerprint is unique, so a statement imported twice
 * adds nothing the second time.
 */
export class BankStatementLines1790251188502 implements MigrationInterface {
    name = 'BankStatementLines1790251188502';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "bank_statement_lines" ("id" SERIAL NOT NULL, "fingerprint" character varying(64) NOT NULL, "bookedOn" date NOT NULL, "amount" numeric(10,2) NOT NULL, "description" character varying(500) NOT NULL, "counterparty" character varying(200), "bankReference" character varying(100), "ignoredAt" TIMESTAMP WITH TIME ZONE, "importedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_id" integer, CONSTRAINT "PK_f22e7c99c4dca5224741e09f7ae" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bank_statement_lines_fingerprint" ON "bank_statement_lines" ("fingerprint") `);
        await queryRunner.query(`CREATE INDEX "IDX_bank_statement_lines_booked_on" ON "bank_statement_lines" ("bookedOn") `);
        await queryRunner.query(`CREATE INDEX "IDX_bank_statement_lines_payment_id" ON "bank_statement_lines" ("payment_id") `);
        await queryRunner.query(
            `ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "FK_9320bb4067d472adb67c254f797" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bank_statement_lines" DROP CONSTRAINT "FK_9320bb4067d472adb67c254f797"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bank_statement_lines_payment_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bank_statement_lines_booked_on"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_bank_statement_lines_fingerprint"`);
        await queryRunner.query(`DROP TABLE "bank_statement_lines"`);
    }
}
