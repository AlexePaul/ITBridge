import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who accepted which version of which document, and when — E22 S4, first half.
 *
 * One row per document per acceptance, written by registration in the same transaction as the
 * account. A row, not a flag on `users`: the next version of the terms adds a row when it is
 * accepted again, and "what did this family actually agree to" keeps its answer per version. The
 * version is the string printed at the top of the document in `docs/legal/`.
 */
export class DocumentAcceptances1788811976386 implements MigrationInterface {
    name = 'DocumentAcceptances1788811976386';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."document_acceptances_document_enum" AS ENUM('terms', 'privacy')`);
        await queryRunner.query(
            `CREATE TABLE "document_acceptances" ("id" SERIAL NOT NULL, "document" "public"."document_acceptances_document_enum" NOT NULL, "version" character varying(20) NOT NULL, "acceptedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" integer NOT NULL, CONSTRAINT "PK_40dc31274a8410ba03ac3ee5de2" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_document_acceptances_user_document" ON "document_acceptances" ("user_id", "document") `);
        await queryRunner.query(
            `ALTER TABLE "document_acceptances" ADD CONSTRAINT "FK_a6c8f3a077ca4ec1f8e0bdd5420" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_acceptances" DROP CONSTRAINT "FK_a6c8f3a077ca4ec1f8e0bdd5420"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_document_acceptances_user_document"`);
        await queryRunner.query(`DROP TABLE "document_acceptances"`);
        await queryRunner.query(`DROP TYPE "public"."document_acceptances_document_enum"`);
    }
}
