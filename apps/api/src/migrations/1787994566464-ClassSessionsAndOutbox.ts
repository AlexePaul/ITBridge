import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the class a row (`class_sessions`), hangs attendance off it, and adds the mail outbox.
 *
 * Written by hand rather than generated. `migration:generate` produces the right DDL — the
 * constraint and foreign key names below are lifted from its output verbatim — but it emits the
 * three statements that matter in the wrong order and without the middle step:
 *
 *   ALTER TABLE "attendances" DROP COLUMN "date"
 *   ALTER TABLE "attendances" DROP COLUMN "startTime"
 *   ALTER TABLE "attendances" ADD "class_session_id" integer NOT NULL
 *
 * which discards when every existing class happened, then demands a NOT NULL reference to a table
 * that has no rows. On a database with attendance in it, the first two statements succeed and the
 * third fails, so the run aborts having already destroyed what the backfill needed.
 *
 * E12 "Decizii luate" says there are no historical attendances to migrate — E04 established that
 * there is no production data to preserve. That is true of production and false of every developer
 * database that has ever been seeded, and a migration that only works on an empty table is a trap
 * for whoever runs it next. So the sessions are reconstructed from the attendance rows first.
 *
 * See E12/S1 and E17/S1, S3.
 */
export class ClassSessionsAndOutbox1787994566464 implements MigrationInterface {
    name = 'ClassSessionsAndOutbox1787994566464';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const logger = new Logger(ClassSessionsAndOutbox1787994566464.name);

        // --- class_sessions ---------------------------------------------------------------------
        await queryRunner.query(`CREATE TYPE "public"."class_sessions_status_enum" AS ENUM('scheduled', 'held', 'cancelled')`);
        await queryRunner.query(`
            CREATE TABLE "class_sessions" (
                "id" SERIAL NOT NULL,
                "date" date NOT NULL,
                "startTime" TIME NOT NULL,
                "endTime" TIME NOT NULL,
                "status" "public"."class_sessions_status_enum" NOT NULL DEFAULT 'scheduled',
                "notes" text,
                "group_id" integer NOT NULL,
                "room_id" integer NOT NULL,
                CONSTRAINT "UQ_class_sessions_group_date" UNIQUE ("group_id", "date"),
                CONSTRAINT "PK_dc034da48c6e0cf95c51f606c4e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(
            `ALTER TABLE "class_sessions" ADD CONSTRAINT "FK_8d58ce947fc5fdd01ea691dacc0" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "class_sessions" ADD CONSTRAINT "FK_8ad39d2ac9bccad6ac5a7e0e32b" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        // --- reconstructing the sessions that already happened ----------------------------------
        // `attendances."groupId"` is NOT NULL from the initial schema, so an attendance with no
        // group cannot exist and the reconstruction below cannot lose one that way. The orphan
        // check after the join is what proves it rather than assuming it.
        //
        // The new table allows one session per group per day. Attendance rows are keyed on
        // (child, date, startTime), so nothing stopped a group from having two different start
        // times on one day — an admin correcting a typo by marking the same class twice at 16:00
        // and 16:30 would produce exactly that. Collapsing the pair silently would move half the
        // marks onto a class that says the wrong hour; refusing to collapse them fails on the
        // UNIQUE with no explanation. Say what is wrong and stop.
        const collisions = (await queryRunner.query(`
            SELECT "groupId", "date"::text AS "date", array_agg(DISTINCT "startTime"::text ORDER BY "startTime"::text) AS "starts"
            FROM "attendances"
            GROUP BY "groupId", "date"
            HAVING count(DISTINCT "startTime") > 1
        `)) as { groupId: number; date: string; starts: string[] }[];
        if (collisions.length > 0) {
            const detail = collisions.map((row) => `group ${row.groupId} on ${row.date} at ${row.starts.join(' and ')}`).join('; ');
            throw new Error(
                'Cannot build class sessions: a class is now one row per group per day, but these groups have attendance ' +
                    `recorded at more than one start time on the same day — ${detail}. ` +
                    'Decide which start time is the real one and correct the attendance rows, then run the migration again.',
            );
        }

        // `endTime` and `room_id` come from the group, because the old attendance row never carried
        // them and the group timetable is the only record of what they were. `held`, not
        // `scheduled`: somebody took the register, so the class happened.
        await queryRunner.query(`
            INSERT INTO "class_sessions" ("group_id", "date", "startTime", "endTime", "room_id", "status", "notes")
            SELECT a."groupId", a."date", a."startTime", g."endTime", g."room_id", 'held',
                   'Reconstruită din prezențele existente la trecerea la orar explicit (E12/S1). Ora de sfârșit și sala vin din grupă.'
            FROM (SELECT DISTINCT "groupId", "date", "startTime" FROM "attendances") a
            JOIN "groups" g ON g."id" = a."groupId"
        `);
        const [{ count: rebuilt }] = (await queryRunner.query(`SELECT count(*)::int AS "count" FROM "class_sessions"`)) as { count: number }[];
        if (rebuilt > 0) {
            logger.log(
                `Reconstructed ${rebuilt} class session(s) from existing attendance. Their end time and room were taken from the group as it stands today, ` +
                    'so a group moved between rooms since will have its old sessions recorded in the new room. Correct those by hand if it matters.',
            );
        }

        // --- attendances point at the session ---------------------------------------------------
        await queryRunner.query(`ALTER TABLE "attendances" ADD "class_session_id" integer`);
        await queryRunner.query(`
            UPDATE "attendances" a
            SET "class_session_id" = cs."id"
            FROM "class_sessions" cs
            WHERE cs."group_id" = a."groupId" AND cs."date" = a."date" AND cs."startTime" = a."startTime"
        `);
        const orphans = (await queryRunner.query(`SELECT "id" FROM "attendances" WHERE "class_session_id" IS NULL`)) as { id: number }[];
        if (orphans.length > 0) {
            // Unreachable given the insert above, which is built from these very rows. Left in
            // because the SET NOT NULL below would otherwise fail with a constraint violation
            // naming no row, and because "unreachable" is a claim about code that just changed.
            throw new Error(
                `Could not attach these attendance records to a class session: ${orphans.map((row) => row.id).join(', ')}. ` +
                    'Nothing has been dropped yet — investigate the rows before re-running.',
            );
        }
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "class_session_id" SET NOT NULL`);
        await queryRunner.query(
            `ALTER TABLE "attendances" ADD CONSTRAINT "FK_668ab00153e0714ee8c8bd41396" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );

        // One mark per child per class. Cannot be violated by data that satisfied the old key:
        // (child, date, startTime) was unique, and a session is exactly one (group, date,
        // startTime), so two rows sharing a child and a session would have shared the old key too.
        await queryRunner.query(`ALTER TABLE "attendances" DROP CONSTRAINT "UQ_663c67c450749e8164dbbcf2c62"`);
        await queryRunner.query(`ALTER TABLE "attendances" ADD CONSTRAINT "UQ_attendances_child_class_session" UNIQUE ("childId", "class_session_id")`);

        // Only now, with every row attached and the constraint in place, is the duplicate safe to
        // drop. The session owns the date and the hour; a second copy on the mark is a second
        // answer waiting to disagree with the first.
        await queryRunner.query(`ALTER TABLE "attendances" DROP COLUMN "date"`);
        await queryRunner.query(`ALTER TABLE "attendances" DROP COLUMN "startTime"`);

        // --- outbox ------------------------------------------------------------------------------
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('pending', 'sent', 'failed')`);
        await queryRunner.query(`
            CREATE TABLE "outbox" (
                "id" SERIAL NOT NULL,
                "to" character varying(255) NOT NULL,
                "subject" character varying(255) NOT NULL,
                "bodyText" text NOT NULL,
                "bodyHtml" text,
                "status" "public"."outbox_status_enum" NOT NULL DEFAULT 'pending',
                "attempts" integer NOT NULL DEFAULT '0',
                "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "lastError" text,
                "dedupeKey" character varying(255),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "sentAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_f130059f85bb43d3371084e5006" UNIQUE ("dedupeKey"),
                CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id")
            )
        `);
        // The claim query orders pending rows by when they are next due. Without this it is a
        // sequential scan held under a row lock, growing with every sent message never deleted.
        await queryRunner.query(`CREATE INDEX "IDX_outbox_claim" ON "outbox" ("status", "nextAttemptAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_claim"`);
        await queryRunner.query(`DROP TABLE "outbox"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);

        // Put the date and the hour back on the mark before anything is dropped, reading them off
        // the session they were moved to. Added nullable, filled, then tightened — the columns are
        // NOT NULL and the table may have rows.
        await queryRunner.query(`ALTER TABLE "attendances" ADD "date" date`);
        await queryRunner.query(`ALTER TABLE "attendances" ADD "startTime" TIME`);
        await queryRunner.query(`
            UPDATE "attendances" a
            SET "date" = cs."date", "startTime" = cs."startTime"
            FROM "class_sessions" cs
            WHERE cs."id" = a."class_session_id"
        `);
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "date" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "attendances" ALTER COLUMN "startTime" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "attendances" DROP CONSTRAINT "UQ_attendances_child_class_session"`);
        await queryRunner.query(`ALTER TABLE "attendances" DROP CONSTRAINT "FK_668ab00153e0714ee8c8bd41396"`);
        await queryRunner.query(`ALTER TABLE "attendances" DROP COLUMN "class_session_id"`);

        // Restoring the old key can legitimately fail, and that is not a bug to work around: it
        // said a child has one mark per date and start time *across the whole school*. Two groups
        // in different rooms may now share a slot — E08 made that legal — so a child marked in one
        // and given a make-up in the other is data the old constraint has no room for. Rolling
        // back means deciding which mark to delete, and no migration should decide that alone.
        await queryRunner.query(`ALTER TABLE "attendances" ADD CONSTRAINT "UQ_663c67c450749e8164dbbcf2c62" UNIQUE ("childId", "date", "startTime")`);

        await queryRunner.query(`ALTER TABLE "class_sessions" DROP CONSTRAINT "FK_8ad39d2ac9bccad6ac5a7e0e32b"`);
        await queryRunner.query(`ALTER TABLE "class_sessions" DROP CONSTRAINT "FK_8d58ce947fc5fdd01ea691dacc0"`);
        await queryRunner.query(`DROP TABLE "class_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."class_sessions_status_enum"`);
    }
}
