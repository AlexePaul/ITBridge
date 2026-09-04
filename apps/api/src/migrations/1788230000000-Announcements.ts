import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The broadcast an admin presses send on — E17/S7.
 *
 * Two things land here. The `announcements` table is the decision: audience, wording, who pressed
 * it. The nullable `announcement_id` on `outbox` is the link back from each message the decision
 * produced, which is what makes the story's „raport de livrare" a live count over the queue rather
 * than a snapshot taken at send time.
 *
 * `dedupeKey` is unique and not nullable, unlike the outbox's. A broadcast has no natural identity —
 * two admins may legitimately write to the same group twice in a morning — so the key is a
 * deliberate definition of „the same announcement": audience, subject, body and calendar day. It is
 * the only thing standing between a slow connection and a group mailed twice.
 *
 * The constraint names are TypeORM's own hashes rather than readable ones, like every migration
 * before this: `check:schema` compares what the entities would create against what the migrations
 * did, and a hand-written name shows up there as a constraint to drop and re-add on every run.
 *
 * The foreign keys to `groups` and `locations` are `RESTRICT`, like every other reference to them:
 * the audience of an announcement that went out has to stay readable, and a group deleted out from
 * under it would leave a record that cannot say who was written to.
 */
export class Announcements1788230000000 implements MigrationInterface {
    name = 'Announcements1788230000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."announcements_audience_enum" AS ENUM('group', 'location', 'all')`);
        await queryRunner.query(`CREATE TYPE "public"."announcements_kind_enum" AS ENUM('transactional', 'marketing')`);

        await queryRunner.query(`
            CREATE TABLE "announcements" (
                "id" SERIAL NOT NULL,
                "audience" "public"."announcements_audience_enum" NOT NULL,
                "kind" "public"."announcements_kind_enum" NOT NULL DEFAULT 'transactional',
                "subject" character varying(255) NOT NULL,
                "bodyText" text NOT NULL,
                "recipientCount" integer NOT NULL DEFAULT '0',
                "declinedCount" integer NOT NULL DEFAULT '0',
                "dedupeKey" character varying(255) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "group_id" integer,
                "location_id" integer,
                "sent_by_id" integer,
                CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_announcements_dedupe" ON "announcements" ("dedupeKey")`);

        await queryRunner.query(
            `ALTER TABLE "announcements" ADD CONSTRAINT "FK_f0721c3bfa514337e1401cc8b37" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "announcements" ADD CONSTRAINT "FK_5449f1e29556ef586a54735c965" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        // SET NULL, not RESTRICT: an admin account may be deleted, and the record of a broadcast
        // has to outlive its author. An announcement with no author still happened.
        await queryRunner.query(
            `ALTER TABLE "announcements" ADD CONSTRAINT "FK_7be22a1e7a9fa49ee4585166d47" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );

        await queryRunner.query(`ALTER TABLE "outbox" ADD "announcement_id" integer`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ADD CONSTRAINT "FK_0bf428e7c6c366e33a46254ca2e" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "outbox" DROP CONSTRAINT "FK_0bf428e7c6c366e33a46254ca2e"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "announcement_id"`);

        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_7be22a1e7a9fa49ee4585166d47"`);
        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_5449f1e29556ef586a54735c965"`);
        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_f0721c3bfa514337e1401cc8b37"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_announcements_dedupe"`);
        await queryRunner.query(`DROP TABLE "announcements"`);
        await queryRunner.query(`DROP TYPE "public"."announcements_kind_enum"`);
        await queryRunner.query(`DROP TYPE "public"."announcements_audience_enum"`);
    }
}
