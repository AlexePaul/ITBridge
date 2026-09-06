import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The make-up stops being a credit and becomes a move — E12/S4.
 *
 * `make_up_credits` held a right a family earned by missing a class, carried for thirty days and
 * spent on an hour they picked from a booking screen. The school does not work that way and never
 * did: the office reads the week's announced absences on Monday and moves children into other
 * groups **for that week**, by hand. So the whole table collapses into one nullable column on the
 * notice that started it — the class the child goes to instead.
 *
 * **Nothing is migrated across, because there is nothing to migrate.** The application has not run
 * against a real database, so no family holds a credit and no `expires_on` is a promise anybody was
 * given. Had one existed, this would have had to carry it over or refuse to run; it did not, and
 * pretending otherwise would have meant writing a data migration nobody could test.
 *
 * `down` rebuilds the table exactly as `MakeUpCredits1788210000000` left it, constraint names
 * included, and drops the column. It restores the shape, not the rows: a credit that was turned
 * into a placement cannot be turned back, because the two say different things.
 */
export class TemporaryGroupMove1788250000000 implements MigrationInterface {
    name = 'TemporaryGroupMove1788250000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "absence_notices" ADD "replacement_session_id" integer`);
        await queryRunner.query(
            `ALTER TABLE "absence_notices" ADD CONSTRAINT "FK_5d8269cee2b5df9a92a642f0af3" FOREIGN KEY ("replacement_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        // Every seat count for a class asks "who was moved in here", which without this is a scan of
        // every notice the school has ever taken.
        await queryRunner.query(`CREATE INDEX "IDX_absence_notice_replacement_session" ON "absence_notices" ("replacement_session_id")`);

        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_5dc40eebdf89e5f23b84027c07c"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_b6d2761f311a5d9624f992e31e6"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_606a34c16e024cfb16f34906612"`);
        await queryRunner.query(`ALTER TABLE "make_up_credits" DROP CONSTRAINT "FK_aa632952d64ba151ab13ac7ddfa"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_make_up_credit_origin"`);
        await queryRunner.query(`DROP TABLE "make_up_credits"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
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

        await queryRunner.query(`DROP INDEX "public"."IDX_absence_notice_replacement_session"`);
        await queryRunner.query(`ALTER TABLE "absence_notices" DROP CONSTRAINT "FK_5d8269cee2b5df9a92a642f0af3"`);
        await queryRunner.query(`ALTER TABLE "absence_notices" DROP COLUMN "replacement_session_id"`);
    }
}
