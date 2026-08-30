import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The two gates a parent account passes before it can be used, and the emergency contact — E11/S2.
 *
 * `email_confirmations` follows `sessions`: a row per issued token, holding the hash and never the
 * token itself.
 *
 * The columns on `profiles` are all nullable even though registration requires them. The other road
 * to a profile — an admin typing a family in from a phone call — is a deliberate flow that has
 * never carried these fields, and a NOT NULL here would break it to enforce a rule that belongs to
 * one of the two doors rather than to the room. The requirement lives in `RegisterDto`.
 *
 * **The backfill below is the part that matters.** Both gates default to shut, so without it every
 * account that existed before this migration — including every parent on a live database — would
 * wake up unconfirmed and unapproved, locked out by a rule that did not exist when they signed up.
 * Applying a new gate retroactively is a data change wearing a schema change's clothes.
 */
export class AccountGates1788082107335 implements MigrationInterface {
    name = 'AccountGates1788082107335';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "email_confirmations" ("id" SERIAL NOT NULL, "tokenHash" character varying(64) NOT NULL, "email" character varying(255) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, CONSTRAINT "UQ_1bea918d85b9f77d212f476d635" UNIQUE ("tokenHash"), CONSTRAINT "PK_178b5599cd7e3ec9cfdfb144b50" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_1bea918d85b9f77d212f476d63" ON "email_confirmations" ("tokenHash") `);
        await queryRunner.query(`ALTER TABLE "profiles" ADD "emergencyContactName" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD "emergencyContactRelation" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD "emergencyContactPhone" character varying(30)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "emailConfirmedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."users_approvalstatus_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "approvalStatus" "public"."users_approvalstatus_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "approvalDecidedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "rejectionReason" character varying(500)`);
        await queryRunner.query(
            `ALTER TABLE "email_confirmations" ADD CONSTRAINT "FK_97c4781eabb13c92ea53f21d8f9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );

        // Everyone who was already here is grandfathered through both gates. `createdAt` rather
        // than `now()` for the confirmation stamp, so the record says when the account came into
        // being and not when this migration happened to run.
        await queryRunner.query(`UPDATE "users" SET "emailConfirmedAt" = "createdAt", "approvalStatus" = 'APPROVED', "approvalDecidedAt" = "createdAt"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmations" DROP CONSTRAINT "FK_97c4781eabb13c92ea53f21d8f9"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "rejectionReason"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "approvalDecidedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "approvalStatus"`);
        await queryRunner.query(`DROP TYPE "public"."users_approvalstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailConfirmedAt"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "emergencyContactPhone"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "emergencyContactRelation"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "emergencyContactName"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1bea918d85b9f77d212f476d63"`);
        await queryRunner.query(`DROP TABLE "email_confirmations"`);
    }
}
