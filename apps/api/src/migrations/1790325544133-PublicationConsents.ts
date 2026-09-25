import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A family's consent to use a child's work, one row per consent from grant to withdrawal — E07 S2.
 *
 * The partial unique index is the rule "one consent in force per child and purpose", enforced where
 * two clicks cannot both pass it. The plain index on `child_id` is the one every relation gets: the
 * partial one only covers rows in force, so a child's cascade would otherwise scan for the rest. No
 * backfill: nobody has ever consented to anything on this platform.
 */
export class PublicationConsents1790325544133 implements MigrationInterface {
    name = 'PublicationConsents1790325544133';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."publication_consents_purpose_enum" AS ENUM('promotion')`);
        await queryRunner.query(`CREATE TYPE "public"."publication_consents_grantedvia_enum" AS ENUM('portal', 'office')`);
        await queryRunner.query(`CREATE TYPE "public"."publication_consents_revokedvia_enum" AS ENUM('portal', 'office')`);
        await queryRunner.query(
            `CREATE TABLE "publication_consents" ("id" SERIAL NOT NULL, "purpose" "public"."publication_consents_purpose_enum" NOT NULL, "textVersion" character varying(20) NOT NULL, "grantedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "grantedVia" "public"."publication_consents_grantedvia_enum" NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokedVia" "public"."publication_consents_revokedvia_enum", "child_id" integer NOT NULL, CONSTRAINT "PK_32b61e1a0ef80fd4b17747a5955" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_publication_consents_one_in_force" ON "publication_consents" ("child_id", "purpose") WHERE "revokedAt" IS NULL`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_publication_consents_child_id" ON "publication_consents" ("child_id") `);
        await queryRunner.query(
            `ALTER TABLE "publication_consents" ADD CONSTRAINT "FK_d5506853349045c1881d61ba4da" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "publication_consents" DROP CONSTRAINT "FK_d5506853349045c1881d61ba4da"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_publication_consents_child_id"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_publication_consents_one_in_force"`);
        await queryRunner.query(`DROP TABLE "publication_consents"`);
        await queryRunner.query(`DROP TYPE "public"."publication_consents_revokedvia_enum"`);
        await queryRunner.query(`DROP TYPE "public"."publication_consents_grantedvia_enum"`);
        await queryRunner.query(`DROP TYPE "public"."publication_consents_purpose_enum"`);
    }
}
