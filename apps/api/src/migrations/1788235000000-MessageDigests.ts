import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Digests instead of bursts — E17/S6.
 *
 * Two halves. `profiles.messageFrequency` is how often a family wants their post, defaulting to
 * `daily` — the story's acceptance is stated about a parent, not about a parent who went looking for
 * a setting, so the cap has to hold before anybody touches anything. It cannot suppress a message,
 * only combine several into one, which is what makes a non-`immediate` default safe.
 *
 * The four `outbox` columns are the holding pen. A row with a `digestSummary` is one its sender is
 * willing to have combined; the dispatcher does not claim it until `digestReleasedAt` is set, and
 * the digest pass either sets that (it was alone, or its `digestNotAfter` came up) or folds it into
 * a new row and points `digest_id` at it. Nothing is deleted and nothing is marked `sent` that was
 * not sent: the folded rows go to `digested`, which is terminal and visible in the delivery record,
 * because S5's rule is that nothing which was going to reach a family disappears.
 *
 * `digest_id` is self-referencing on purpose — a digest is an ordinary outbox message, queued and
 * dispatched like any other. The only thing that makes it a digest is that rows point at it.
 *
 * The constraint name is TypeORM's own hash rather than a readable one, like every migration before
 * this: `check:schema` compares what the entities would create against what the migrations did, and
 * a hand-written name shows up there as a constraint to drop and re-add on every single run.
 */
export class MessageDigests1788235000000 implements MigrationInterface {
    name = 'MessageDigests1788235000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."profiles_messagefrequency_enum" AS ENUM('immediate', 'daily', 'weekly')`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD "messageFrequency" "public"."profiles_messagefrequency_enum" NOT NULL DEFAULT 'daily'`);

        await queryRunner.query(`ALTER TABLE "outbox" ADD "digestSummary" text`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "digestNotAfter" date`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "digestReleasedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "digest_id" integer`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ADD CONSTRAINT "FK_074aae2516fdcc34d3175f718fa" FOREIGN KEY ("digest_id") REFERENCES "outbox"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );

        // Adding a value to a Postgres enum means rebuilding the type; the `USING ... ::text::` cast
        // maps each existing status onto the identically-named new one.
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum" RENAME TO "outbox_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('pending', 'sent', 'failed', 'undeliverable', 'digested')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"text"::"public"."outbox_status_enum"`,
        );
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rows in the state being removed become `sent`, which is the closest true statement about
        // them: the family did receive what these rows said, inside the digest that replaced them.
        await queryRunner.query(`UPDATE "outbox" SET "status" = 'sent' WHERE "status" = 'digested'`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum_old" AS ENUM('pending', 'sent', 'failed', 'undeliverable')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"text"::"public"."outbox_status_enum_old"`,
        );
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum_old" RENAME TO "outbox_status_enum"`);

        await queryRunner.query(`ALTER TABLE "outbox" DROP CONSTRAINT "FK_074aae2516fdcc34d3175f718fa"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "digest_id"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "digestReleasedAt"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "digestNotAfter"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "digestSummary"`);

        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "messageFrequency"`);
        await queryRunner.query(`DROP TYPE "public"."profiles_messagefrequency_enum"`);
    }
}
