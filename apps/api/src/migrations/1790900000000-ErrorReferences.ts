import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The code a screen showed, one row per occurrence, so `/admin/erori?cod=` finds it however often the
 * fault came back — `ErrorReport.recent` keeps twenty (review of 27 September 2026). Gone with its
 * report, or at thirty days like the report.
 */
export class ErrorReferences1790900000000 implements MigrationInterface {
    name = 'ErrorReferences1790900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "error_references" ("id" SERIAL NOT NULL, "ref" character varying(64) NOT NULL, "at" TIMESTAMP WITH TIME ZONE NOT NULL, "report_id" integer NOT NULL, CONSTRAINT "PK_69b6383413c5b685178714bd328" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_error_references_ref" ON "error_references" ("ref") `);
        await queryRunner.query(`CREATE INDEX "IDX_error_references_report_id" ON "error_references" ("report_id") `);
        await queryRunner.query(
            `ALTER TABLE "error_references" ADD CONSTRAINT "FK_5f944b49007f307989aee588333" FOREIGN KEY ("report_id") REFERENCES "error_reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "error_references" DROP CONSTRAINT "FK_5f944b49007f307989aee588333"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_error_references_report_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_error_references_ref"`);
        await queryRunner.query(`DROP TABLE "error_references"`);
    }
}
