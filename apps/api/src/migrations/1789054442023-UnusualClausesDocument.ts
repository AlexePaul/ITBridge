import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A third value for `document_acceptances.document`, and one row per version — E22 S4, second half.
 *
 * `unusual_clauses` is not a third document but the clauses inside the terms that Cod civil
 * art. 1203 calls unusual — §14, §15, §18 — which produce no effect without an express, separate
 * acceptance. It gets its own row, carrying the terms' own version, so "did this family accept
 * these clauses, in which version of the text" is one query rather than an inference.
 *
 * The unique constraint is the other half: accepting the same version twice is the same fact
 * twice. `AuthService.acceptDocuments` checks what is outstanding before writing and then writes
 * through `ON CONFLICT DO NOTHING`, so the constraint catches the second submit of a double-click
 * without turning it into an error the family would have to read.
 *
 * Postgres has no `ADD VALUE` that TypeORM's schema comparison would recognise, so the enum change
 * is the usual rename-recreate-cast. Nothing to back-fill: a row written before today records what
 * was accepted then, and the clauses were not.
 */
export class UnusualClausesDocument1789054442023 implements MigrationInterface {
    name = 'UnusualClausesDocument1789054442023';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_document_acceptances_user_document"`);
        await queryRunner.query(`ALTER TYPE "public"."document_acceptances_document_enum" RENAME TO "document_acceptances_document_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."document_acceptances_document_enum" AS ENUM('terms', 'privacy', 'unusual_clauses')`);
        await queryRunner.query(
            `ALTER TABLE "document_acceptances" ALTER COLUMN "document" TYPE "public"."document_acceptances_document_enum" USING "document"::"text"::"public"."document_acceptances_document_enum"`,
        );
        await queryRunner.query(`DROP TYPE "public"."document_acceptances_document_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_document_acceptances_user_document" ON "document_acceptances" ("user_id", "document") `);
        await queryRunner.query(
            `ALTER TABLE "document_acceptances" ADD CONSTRAINT "UQ_document_acceptance_user_document_version" UNIQUE ("user_id", "document", "version")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_acceptances" DROP CONSTRAINT "UQ_document_acceptance_user_document_version"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_document_acceptances_user_document"`);
        await queryRunner.query(`CREATE TYPE "public"."document_acceptances_document_enum_old" AS ENUM('terms', 'privacy')`);
        await queryRunner.query(
            `ALTER TABLE "document_acceptances" ALTER COLUMN "document" TYPE "public"."document_acceptances_document_enum_old" USING "document"::"text"::"public"."document_acceptances_document_enum_old"`,
        );
        await queryRunner.query(`DROP TYPE "public"."document_acceptances_document_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."document_acceptances_document_enum_old" RENAME TO "document_acceptances_document_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_document_acceptances_user_document" ON "document_acceptances" ("user_id", "document") `);
    }
}
