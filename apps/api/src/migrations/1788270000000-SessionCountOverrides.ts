import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The per-child override on the issuing screen — E15/S9, revised.
 *
 * S9 shipped with no override field, on the argument that a typed number leaves the history saying
 * something else. The school overruled it with a fact the argument had missed: the invoice carries
 * only a product line — „curs informatică × 3" — never the dates, so the document cannot disagree
 * with the registers. What the argument was really protecting is the school's own record, and that
 * is what this table is: who billed how many instead of the count, for which child and month, and
 * why. One row per child per month.
 */
export class SessionCountOverrides1788270000000 implements MigrationInterface {
    name = 'SessionCountOverrides1788270000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "session_count_overrides" ("id" SERIAL NOT NULL, "monthIssued" character varying(7) NOT NULL, "sessions" integer NOT NULL, "reason" character varying(500), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "child_id" integer NOT NULL, "created_by_id" integer, CONSTRAINT "PK_session_count_overrides" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_session_count_override_child_month" ON "session_count_overrides" ("child_id", "monthIssued")`);
        await queryRunner.query(
            `ALTER TABLE "session_count_overrides" ADD CONSTRAINT "FK_987ac390358d22804c835670257" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "session_count_overrides" ADD CONSTRAINT "FK_66e08e0b5712acd6267c1ea78b6" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session_count_overrides" DROP CONSTRAINT "FK_66e08e0b5712acd6267c1ea78b6"`);
        await queryRunner.query(`ALTER TABLE "session_count_overrides" DROP CONSTRAINT "FK_987ac390358d22804c835670257"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_session_count_override_child_month"`);
        await queryRunner.query(`DROP TABLE "session_count_overrides"`);
    }
}
