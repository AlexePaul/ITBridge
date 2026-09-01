import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The right to sit in on another group's class — E12/S4.
 *
 * No status column, deliberately. Three of the four states are readable from the row itself
 * (`consumed_attendance_id` set means spent, `booked_session_id` set means booked, neither means
 * available) and the fourth, expired, is the calendar having moved — which nothing writes and no
 * job has anywhere to run. A stored status would be a second place to say what the columns already
 * say, free to disagree with them.
 *
 * `expires_on` is stored rather than computed, for the same reason `absence_notices.inTime` is: the
 * window a family was told about must not move when somebody edits the rule.
 *
 * The unique index is the real invariant — one credit per missed class, because an absence happens
 * once. The service checks first so a re-mark is a no-op rather than an error; the index is what
 * makes that true when two writes race.
 */
export class MakeUpCredits1788210000000 implements MigrationInterface {
    name = 'MakeUpCredits1788210000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "make_up_credits" ("id" SERIAL NOT NULL, "expiresOn" date NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "child_id" integer NOT NULL, "origin_session_id" integer NOT NULL, "booked_session_id" integer, "consumed_attendance_id" integer, CONSTRAINT "PK_9d3b1a6a2ee1e5b46ba9d5b8f1a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_make_up_credit_origin" ON "make_up_credits" ("origin_session_id", "child_id")`);
        await queryRunner.query(
            `ALTER TABLE "make_up_credits" ADD CONSTRAINT "FK_aa632952d64ba151ab13ac7ddfa" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "make_up_credits" ADD CONSTRAINT "FK_606a34c16e024cfb16f34906612" FOREIGN KEY ("origin_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "make_up_credits" ADD CONSTRAINT "FK_b6d2761f311a5d9624f992e31e6" FOREIGN KEY ("booked_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "make_up_credits" ADD CONSTRAINT "FK_5dc40eebdf89e5f23b84027c07c" FOREIGN KEY ("consumed_attendance_id") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_5dc40eebdf89e5f23b84027c07c"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_b6d2761f311a5d9624f992e31e6"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_606a34c16e024cfb16f34906612"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_aa632952d64ba151ab13ac7ddfa"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_make_up_credit_origin"`);
        await queryRunner.query(`DROP TABLE "make_up_credits"`);
    }
}
