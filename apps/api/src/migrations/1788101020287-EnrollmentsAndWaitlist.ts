import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enrolment as a period with a history, and the waiting list — E11/S1 and S3.
 *
 * The two partial unique indices are the point of this migration, more than the tables are. They
 * are what make the two rules facts about the database rather than habits of the application:
 *
 *  - `UQ_enrollments_one_in_force` — a child has at most one enrolment that is `TRIAL` or `ACTIVE`
 *    (D6). History accumulates freely, which is why the index is partial; only the rows in force
 *    are unique. `EnrollmentService` checks first so the refusal reaches the client as a 409 with a
 *    reason, but two admins clicking in the same second is a case no application check can cover.
 *  - `UQ_waitlist_one_open_per_child_group` — one live request per child per group, so a family
 *    that calls twice finds itself already on the list rather than twice on it, ahead of people who
 *    called once.
 *
 * **The backfill at the end is not optional.** `Child.group` stays as a derived column and six
 * queries read it, so on the morning this runs it has to agree with the new table. Every child
 * currently in a group gets one `ACTIVE` enrolment; without it they would have a group and no
 * enrolment, and removing them from it would 404.
 *
 * No older history is reconstructed — D9. Inferring past enrolments from attendance rows would be
 * inventing dates that nobody recorded, and writing a guess into the table whose whole purpose is
 * to be the record.
 */
export class EnrollmentsAndWaitlist1788101020287 implements MigrationInterface {
    name = 'EnrollmentsAndWaitlist1788101020287';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."waitlist_entries_status_enum" AS ENUM('WAITING', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED')`,
        );
        await queryRunner.query(
            `CREATE TABLE "waitlist_entries" ("id" SERIAL NOT NULL, "status" "public"."waitlist_entries_status_enum" NOT NULL DEFAULT 'WAITING', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "offeredAt" TIMESTAMP WITH TIME ZONE, "respondBy" TIMESTAMP WITH TIME ZONE, "note" character varying(500), "child_id" integer NOT NULL, "group_id" integer NOT NULL, CONSTRAINT "PK_bd0ef66fff81d3be7b7a1568a4d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_cad6c94ccaa76519fec7b9bcad" ON "waitlist_entries" ("status") `);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_waitlist_one_open_per_child_group" ON "waitlist_entries" ("child_id", "group_id") WHERE status IN ('WAITING', 'OFFERED')`,
        );
        await queryRunner.query(`CREATE TYPE "public"."enrollments_status_enum" AS ENUM('TRIAL', 'ACTIVE', 'COMPLETED', 'WITHDRAWN', 'TRANSFERRED')`);
        await queryRunner.query(
            `CREATE TABLE "enrollments" ("id" SERIAL NOT NULL, "status" "public"."enrollments_status_enum" NOT NULL, "startDate" date NOT NULL, "endDate" date, "exitReason" character varying(500), "contractSignedAt" date, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "child_id" integer NOT NULL, "group_id" integer NOT NULL, CONSTRAINT "PK_7c0f752f9fb68bf6ed7367ab00f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_3816714ab4c719d70e6b848744" ON "enrollments" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_enrollments_one_in_force" ON "enrollments" ("child_id") WHERE status IN ('TRIAL', 'ACTIVE')`);
        await queryRunner.query(
            `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_f0fe581a6e338a1400e4f921960" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_c1e16ab2c8915da276c605d3089" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "enrollments" ADD CONSTRAINT "FK_56fdcd2164457e6db74caa7c8e6" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "enrollments" ADD CONSTRAINT "FK_52e3e34305ad0800648eab215ed" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        // `createdAt::date` as the start: the day the child record appeared is the closest thing to
        // a true start date that exists anywhere, and it is at least a real date somebody can
        // recognise, unlike the day this migration happened to run.
        await queryRunner.query(`
            INSERT INTO "enrollments" ("child_id", "group_id", "status", "startDate", "endDate", "exitReason", "contractSignedAt")
            SELECT "id", "group_id", 'ACTIVE', "createdAt"::date, NULL, NULL, NULL
            FROM "children"
            WHERE "group_id" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "enrollments" DROP CONSTRAINT "FK_52e3e34305ad0800648eab215ed"`);
        await queryRunner.query(`ALTER TABLE "enrollments" DROP CONSTRAINT "FK_56fdcd2164457e6db74caa7c8e6"`);
        await queryRunner.query(`ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_c1e16ab2c8915da276c605d3089"`);
        await queryRunner.query(`ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_f0fe581a6e338a1400e4f921960"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_enrollments_one_in_force"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3816714ab4c719d70e6b848744"`);
        await queryRunner.query(`DROP TABLE "enrollments"`);
        await queryRunner.query(`DROP TYPE "public"."enrollments_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_waitlist_one_open_per_child_group"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cad6c94ccaa76519fec7b9bcad"`);
        await queryRunner.query(`DROP TABLE "waitlist_entries"`);
        await queryRunner.query(`DROP TYPE "public"."waitlist_entries_status_enum"`);
    }
}
