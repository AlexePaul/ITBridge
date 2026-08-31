import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The days the school does not teach — E12/S2.
 *
 * A period, not a day: a fortnight of school holiday is one row and a public holiday is one row with
 * both dates equal, so the Romanian school year comes to under a dozen rows a year. Storing days
 * would have meant fourteen rows for one holiday and no way to say what it was called.
 *
 * `location_id` is nullable and means "the whole school" when empty, which is every national holiday
 * and every school break — that is, all of them today. The column exists because the story asks for
 * it and because the two addresses could one day keep different hours; making it nullable keeps the
 * common case to one row rather than two that must be edited together.
 *
 * No backfill. The periods come from an order the ministry publishes, and inventing last year's
 * holidays would put dates nobody checked into the table the timetable now obeys.
 */
export class NonTeachingPeriods1788182857073 implements MigrationInterface {
    name = 'NonTeachingPeriods1788182857073';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "non_teaching_periods" ("id" SERIAL NOT NULL, "name" character varying(120) NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "location_id" integer, CONSTRAINT "PK_2a71c2c00c0606a48048e394e52" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_83bd9f68748fadcb0601bac102" ON "non_teaching_periods" ("startDate") `);
        await queryRunner.query(
            `ALTER TABLE "non_teaching_periods" ADD CONSTRAINT "FK_3e069227186dc45213cadca5059" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "non_teaching_periods" DROP CONSTRAINT "FK_3e069227186dc45213cadca5059"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_83bd9f68748fadcb0601bac102"`);
        await queryRunner.query(`DROP TABLE "non_teaching_periods"`);
    }
}
