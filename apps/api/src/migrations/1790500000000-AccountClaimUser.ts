import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The account a claim link created — the review of 26 September 2026.
 *
 * A claim used to attach the new account to the office's row at once; it now waits for the office
 * to approve it, and until then this column is the only tie between the account and the family it
 * was created for. Indexed like every other relation (CLAUDE.md), and `CASCADE` on the account: a
 * claim whose account is gone ties nothing.
 */
export class AccountClaimUser1790500000000 implements MigrationInterface {
    name = 'AccountClaimUser1790500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_claims" ADD "user_id" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_account_claims_user_id" ON "account_claims" ("user_id") `);
        await queryRunner.query(
            `ALTER TABLE "account_claims" ADD CONSTRAINT "FK_f132a2090a545faec2333fe524e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_claims" DROP CONSTRAINT "FK_f132a2090a545faec2333fe524e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_account_claims_user_id"`);
        await queryRunner.query(`ALTER TABLE "account_claims" DROP COLUMN "user_id"`);
    }
}
