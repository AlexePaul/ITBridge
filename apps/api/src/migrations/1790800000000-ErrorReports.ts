import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The error record — E06 S1: one row per fault, unique among the open ones, so the same fault
 * coming back after it was marked fixed is a second row. `recent` has no default, on purpose (see
 * the entity).
 */
export class ErrorReports1790800000000 implements MigrationInterface {
    name = 'ErrorReports1790800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."error_reports_source_enum" AS ENUM('request', 'logged', 'browser')`);
        await queryRunner.query(
            `CREATE TABLE "error_reports" ("id" SERIAL NOT NULL, "fingerprint" character varying(64) NOT NULL, "source" "public"."error_reports_source_enum" NOT NULL, "origin" character varying(300) NOT NULL, "errorName" character varying(100) NOT NULL, "message" character varying(1000) NOT NULL, "stack" text, "statusCode" integer, "code" character varying(100), "occurrences" integer NOT NULL DEFAULT '1', "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "recent" jsonb NOT NULL, "resolvedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7ad997b17e029b745874a1a1eac" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_error_reports_last_seen_at" ON "error_reports" ("lastSeenAt") `);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_error_reports_one_open_per_fingerprint" ON "error_reports" ("fingerprint") WHERE "resolvedAt" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_error_reports_one_open_per_fingerprint"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_error_reports_last_seen_at"`);
        await queryRunner.query(`DROP TABLE "error_reports"`);
        await queryRunner.query(`DROP TYPE "public"."error_reports_source_enum"`);
    }
}
