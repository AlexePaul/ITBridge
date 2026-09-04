import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The row a family leaves when they ask — E20/S1 and S2.
 *
 * One table, because a lead is one thing: contact details, what was asked for, what became of it.
 * The seven foreign keys are all nullable and all `SET NULL`, which is the shape of the story rather
 * than laziness — a lead exists **before** any of them do, and has to keep existing after: an
 * enquiry that found no free seat has no group, no session and no child, and it is precisely that
 * row S4 counts when it answers "how many did we turn away".
 *
 * `SET NULL` rather than `RESTRICT` for the same reason. A lead is a record of the past, and the
 * past must not stop an admin deleting an empty group; losing the pointer costs the report a join,
 * losing the row would cost it the fact.
 *
 * `bookingKey` is unique and **nullable**, so the index is partial in effect: leads an admin types
 * in have no natural key, while two identical presses of the public form are the same booking. This
 * matters more here than the same trick does on `announcements` — a duplicate booking does not send
 * a second email, it creates a second child and takes a second seat out of a room of ten.
 *
 * The constraint names are TypeORM's own hashes rather than readable ones, like every migration
 * before this: `check:schema` compares what the entities would create against what the migrations
 * did, and a hand-written name shows up there as a constraint to drop and re-add on every run.
 */
export class Leads1788240000000 implements MigrationInterface {
    name = 'Leads1788240000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('new', 'contacted', 'trial_scheduled', 'trial_held', 'enrolled', 'lost')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_source_enum" AS ENUM('trial_form', 'phone', 'walk_in', 'referral', 'other')`);
        await queryRunner.query(
            `CREATE TYPE "public"."leads_channel_enum" AS ENUM('google', 'facebook', 'instagram', 'friend', 'flyer', 'passing_by', 'other')`,
        );
        await queryRunner.query(
            `CREATE TABLE "leads" ("id" SERIAL NOT NULL, "status" "public"."leads_status_enum" NOT NULL DEFAULT 'new', "source" "public"."leads_source_enum" NOT NULL, "channel" "public"."leads_channel_enum", "parentName" character varying(160) NOT NULL, "parentEmail" character varying(255), "parentPhone" character varying(30), "childFirstName" character varying(100) NOT NULL, "childLastName" character varying(100) NOT NULL, "childBirthDate" date NOT NULL, "experience" text, "noSeats" boolean NOT NULL DEFAULT false, "lostReason" character varying(255), "notes" text, "nextActionAt" date, "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL, "trialHeldAt" TIMESTAMP WITH TIME ZONE, "decidedAt" TIMESTAMP WITH TIME ZONE, "bookingKey" character varying(64), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "location_id" integer, "group_id" integer, "class_session_id" integer, "profile_id" integer, "child_id" integer, "enrollment_id" integer, "assigned_to_id" integer, CONSTRAINT "UQ_dc9ef50c822d5838152807297e0" UNIQUE ("bookingKey"), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_leads_status" ON "leads" ("status") `);
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_9acb607874f2edbf24599f25086" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_e55bff85b7e8754e7f7dcefab52" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_7e62934a1d8d27fcf6887b32798" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_e4e6182b948811885ee2a90d589" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_7e5af68ff59a00584a4125eba70" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_61e461bf45640c9738b2a182db8" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "leads" ADD CONSTRAINT "FK_c4b8fc50cc732d8a6edff3a6d80" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_c4b8fc50cc732d8a6edff3a6d80"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_61e461bf45640c9738b2a182db8"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_7e5af68ff59a00584a4125eba70"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_e4e6182b948811885ee2a90d589"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_7e62934a1d8d27fcf6887b32798"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_e55bff85b7e8754e7f7dcefab52"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_9acb607874f2edbf24599f25086"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_status"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP TYPE "public"."leads_channel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum"`);
    }
}
