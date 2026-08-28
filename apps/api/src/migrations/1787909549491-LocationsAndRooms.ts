import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the school its two locations, their rooms, and the group fields that depend on them.
 *
 * Written by hand rather than generated, for three reasons `migration:generate` cannot handle:
 *
 *  - `groups.minAge`/`maxAge` go from `numeric` to `integer`. The generator emits DROP plus ADD,
 *    which discards every age band on the way through.
 *  - The new columns are NOT NULL on a table that already has rows, so each one needs a backfill
 *    between the ADD and the SET NOT NULL.
 *  - The old unique constraint has to be reported on before it is dropped: it is the reason the
 *    existing timetable may be wrong, and that is worth saying out loud rather than erasing.
 *
 * See E08, stories S1, S2, S3 and S5.
 */
export class LocationsAndRooms1787909549491 implements MigrationInterface {
    name = 'LocationsAndRooms1787909549491';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const logger = new Logger(LocationsAndRooms1787909549491.name);

        // --- S2, first half: report before destroying the evidence -----------------------------
        // The old constraint forbade two groups anywhere in the school from starting at the same
        // time on the same weekday. The way round it is to shift one by a few minutes, which makes
        // the stored timetable — and therefore every attendance record's start time — a fiction.
        // Once the constraint is gone the shifting is legal, so nothing distinguishes a deliberate
        // 16:15 group from a dodged collision. Flag the suspects while it is still possible.
        const suspects = (await queryRunner.query(`
            SELECT a."weekday", a."id" AS "a", b."id" AS "b", a."startTime"::text AS "startA", b."startTime"::text AS "startB"
            FROM "groups" a
            JOIN "groups" b ON a."weekday" = b."weekday" AND a."id" < b."id"
            WHERE abs(extract(epoch FROM (b."startTime" - a."startTime"))) < 1800
        `)) as { weekday: number; a: number; b: number; startA: string; startB: string }[];
        for (const row of suspects) {
            logger.warn(
                `Groups ${row.a} (${row.startA}) and ${row.b} (${row.startB}) start within 30 minutes of each other on weekday ${row.weekday}. ` +
                    'This is the shape of a start time shifted to dodge the old school-wide uniqueness constraint. ' +
                    'Check both against the real timetable and correct them by hand.',
            );
        }

        // --- S1: locations and rooms -----------------------------------------------------------
        await queryRunner.query(`
            CREATE TABLE "locations" (
                "id" SERIAL NOT NULL,
                "name" character varying(120) NOT NULL,
                "slug" character varying(120) NOT NULL,
                "street" character varying(255) NOT NULL,
                "city" character varying(100) NOT NULL,
                "district" character varying(100),
                "postalCode" character varying(20),
                "latitude" numeric(9,6) NOT NULL,
                "longitude" numeric(9,6) NOT NULL,
                "phone" character varying(30),
                "email" character varying(255),
                "openingHours" character varying(255),
                "isActive" boolean NOT NULL DEFAULT true,
                CONSTRAINT "UQ_locations_slug" UNIQUE ("slug"),
                CONSTRAINT "PK_locations" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "rooms" (
                "id" SERIAL NOT NULL,
                "name" character varying(120) NOT NULL,
                "location_id" integer NOT NULL,
                "capacity" integer NOT NULL,
                "computers" integer NOT NULL DEFAULT 0,
                "hasProjector" boolean NOT NULL DEFAULT false,
                "hasWhiteboard" boolean NOT NULL DEFAULT false,
                "isActive" boolean NOT NULL DEFAULT true,
                CONSTRAINT "UQ_rooms_location_name" UNIQUE ("location_id", "name"),
                CONSTRAINT "CHK_rooms_capacity_positive" CHECK ("capacity" > 0),
                CONSTRAINT "CHK_rooms_computers_non_negative" CHECK ("computers" >= 0),
                CONSTRAINT "PK_rooms" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(
            `ALTER TABLE "rooms" ADD CONSTRAINT "FK_276daef6b3dee9c34b38d29615a" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        // The two real addresses, taken from `apps/web/shared/school.ts` so that the database, the
        // public pages, the JSON-LD and the sitemap all say the same thing. An address that
        // disagrees with itself across a site is one of the most common reasons local search ranks
        // a business badly, and now there are two places it could disagree from.
        //
        // Drumul Taberei is inserted first and is therefore the location existing groups are
        // assigned to below — it is the older of the two.
        await queryRunner.query(`
            INSERT INTO "locations" ("name", "slug", "street", "city", "district", "postalCode", "latitude", "longitude") VALUES
                ('Drumul Taberei', 'drumul-taberei', 'Strada Valea Oltului 73', 'București', 'Sector 6', '061971', 44.415847, 26.013556),
                ('Străulești', 'straulesti', 'Șoseaua București-Târgoviște 19A', 'București', 'Sector 1', '013505', 44.510623, 26.020696)
        `);

        // One room per location, because one is what each location is known to have. The capacity
        // of 10 matches "grupe mici" as the public pages describe it and the example in E08/S3; an
        // admin corrects it from the interface without a migration.
        await queryRunner.query(`
            INSERT INTO "rooms" ("name", "location_id", "capacity", "computers", "hasProjector", "hasWhiteboard")
            SELECT 'Sala 1', "id", 10, 10, true, true FROM "locations"
        `);

        // --- S3 and S5: the group becomes describable, and lands in a room ---------------------
        await queryRunner.query(`ALTER TABLE "groups" ADD "name" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "groups" ADD "room_id" integer`);
        await queryRunner.query(`ALTER TABLE "groups" ADD "capacity" integer`);

        // A name that at least identifies the row in a list. Nobody can invent the real names here,
        // so this says exactly what is known about each group and no more.
        await queryRunner.query(`
            UPDATE "groups" SET "name" = 'Grupa ' || CASE "weekday"
                WHEN 1 THEN 'luni'
                WHEN 2 THEN 'marți'
                WHEN 3 THEN 'miercuri'
                WHEN 4 THEN 'joi'
                WHEN 5 THEN 'vineri'
                WHEN 6 THEN 'sâmbătă'
                WHEN 7 THEN 'duminică'
            END || ' ' || to_char("startTime", 'HH24:MI')
            WHERE "name" IS NULL
        `);

        await queryRunner.query(`
            UPDATE "groups" SET "room_id" = (
                SELECT r."id" FROM "rooms" r
                JOIN "locations" l ON l."id" = r."location_id"
                WHERE l."slug" = 'drumul-taberei'
                ORDER BY r."id"
                LIMIT 1
            ) WHERE "room_id" IS NULL
        `);
        const orphans = (await queryRunner.query(`SELECT "id" FROM "groups" WHERE "room_id" IS NULL`)) as { id: number }[];
        if (orphans.length > 0) {
            // Cannot happen with the insert above, but the NOT NULL below would fail with a
            // constraint violation and no hint as to which rows caused it.
            throw new Error(`Could not assign a room to groups: ${orphans.map((row) => row.id).join(', ')}`);
        }
        if (suspects.length > 0) {
            logger.warn(
                `${suspects.length} pair(s) of groups flagged above were all assigned to Drumul Taberei. ` +
                    'If any of them actually meet in Străulești, move them from the admin interface.',
            );
        }

        await queryRunner.query(`UPDATE "groups" g SET "capacity" = r."capacity" FROM "rooms" r WHERE g."room_id" = r."id" AND g."capacity" IS NULL`);

        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "name" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "room_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "capacity" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "groups" ADD CONSTRAINT "CHK_groups_capacity_positive" CHECK ("capacity" > 0)`);
        await queryRunner.query(
            `ALTER TABLE "groups" ADD CONSTRAINT "FK_3414942843af0344375128c23e9" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );

        // Ages in whole years. `USING round(...)` rather than a plain cast, so a 10.5 written by
        // the old decimal column becomes 11 instead of aborting the migration.
        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "minAge" TYPE integer USING round("minAge")::integer`);
        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "maxAge" TYPE integer USING round("maxAge")::integer`);

        // --- S2, second half: the room is what cannot be in two places at once ------------------
        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "UQ_6f8667e72733af2bc770ad82084"`);
        await queryRunner.query(`ALTER TABLE "groups" ADD CONSTRAINT "UQ_groups_room_weekday_start" UNIQUE ("room_id", "weekday", "startTime")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restoring the school-wide uniqueness constraint fails if two groups now legitimately
        // share a slot in different rooms — which is the whole point of the change. That is not a
        // bug to work around: rolling this back means deciding which of the two groups to drop,
        // and no migration should make that choice on its own.
        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "UQ_groups_room_weekday_start"`);
        await queryRunner.query(`ALTER TABLE "groups" ADD CONSTRAINT "UQ_6f8667e72733af2bc770ad82084" UNIQUE ("weekday", "startTime")`);

        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "maxAge" TYPE numeric USING "maxAge"::numeric`);
        await queryRunner.query(`ALTER TABLE "groups" ALTER COLUMN "minAge" TYPE numeric USING "minAge"::numeric`);

        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "FK_3414942843af0344375128c23e9"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "CHK_groups_capacity_positive"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "capacity"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "room_id"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "name"`);

        await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "FK_276daef6b3dee9c34b38d29615a"`);
        await queryRunner.query(`DROP TABLE "rooms"`);
        await queryRunner.query(`DROP TABLE "locations"`);
    }
}
