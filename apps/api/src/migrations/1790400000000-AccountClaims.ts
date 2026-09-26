import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The link that lets a family the office typed in create its own account — one row per link.
 *
 * Shaped like `password_resets`, `email_confirmations` and `sessions`: the token that travels in the
 * link is never stored, only its SHA-256, so a dump of this table opens nothing. It hangs off the
 * profile rather than an account, because the family has none yet — which is the whole reason the
 * link exists. `ON DELETE CASCADE` on the profile: the link is a way to take over that family and
 * nothing else. The unique constraint on the hash is what makes a collision a write failure rather
 * than two links opening one door; the separate index is the lookup done on every click.
 */
export class AccountClaims1790400000000 implements MigrationInterface {
    name = 'AccountClaims1790400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "account_claims" ("id" SERIAL NOT NULL, "tokenHash" character varying(64) NOT NULL, "email" character varying(255) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "profile_id" integer NOT NULL, CONSTRAINT "UQ_0168ef161513de5b82eb5da6b14" UNIQUE ("tokenHash"), CONSTRAINT "PK_635baaa6b8e28487b49bed21d91" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_0168ef161513de5b82eb5da6b1" ON "account_claims" ("tokenHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_account_claims_profile_id" ON "account_claims" ("profile_id") `);
        await queryRunner.query(
            `ALTER TABLE "account_claims" ADD CONSTRAINT "FK_64379673b1cb66ff42ff42955f2" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_claims" DROP CONSTRAINT "FK_64379673b1cb66ff42ff42955f2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_account_claims_profile_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0168ef161513de5b82eb5da6b1"`);
        await queryRunner.query(`DROP TABLE "account_claims"`);
    }
}
