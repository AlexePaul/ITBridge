import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Absences announced before the class — E12/S3.
 *
 * Attached to the session rather than to a date and an hour, like every other row that talks about
 * a class: the timetable is the single answer to "when", and a copy of it here would be a second
 * answer waiting to disagree.
 *
 * `inTime` is stored, not derived on read. Eligibility is a fact about the moment the parent
 * announced; a computed column would change its answer as the class receded into the past, and
 * would rewrite what a family had already been told the day the rule changed.
 *
 * The unique index is the real rule: a parent who announces twice has changed their mind, not
 * produced a second absence. The service updates the existing row; the index is what makes that
 * true for two taps in the same second.
 */
export class AbsenceNotices1788205000000 implements MigrationInterface {
    name = 'AbsenceNotices1788205000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "absence_notices" ("id" SERIAL NOT NULL, "reason" character varying(500) NOT NULL, "inTime" boolean NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "child_id" integer NOT NULL, "class_session_id" integer NOT NULL, "announced_by_id" integer, CONSTRAINT "PK_1a7b09c0b0f9e5b3b0ba5c96b6a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_absence_notice_child_session" ON "absence_notices" ("child_id", "class_session_id")`);
        await queryRunner.query(
            `ALTER TABLE "absence_notices" ADD CONSTRAINT "FK_ba66e1c602dfe6d28eca2d42cce" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "absence_notices" ADD CONSTRAINT "FK_61934cd7c9a04d245a0e0c21531" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "absence_notices" ADD CONSTRAINT "FK_17bd3217b0360ba00db6e05aedd" FOREIGN KEY ("announced_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "absence_notices" DROP CONSTRAINT "FK_17bd3217b0360ba00db6e05aedd"`);
        await queryRunner.query(`ALTER TABLE "absence_notices" DROP CONSTRAINT "FK_61934cd7c9a04d245a0e0c21531"`);
        await queryRunner.query(`ALTER TABLE "absence_notices" DROP CONSTRAINT "FK_ba66e1c602dfe6d28eca2d42cce"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_absence_notice_child_session"`);
        await queryRunner.query(`DROP TABLE "absence_notices"`);
    }
}
