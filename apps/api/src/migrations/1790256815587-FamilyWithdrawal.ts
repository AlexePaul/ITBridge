import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The day the school recorded that a family left — E04/S5. A `date`: the retention term of E22/S3 is
 * counted from it in calendar days. Nullable, and null for every family still here; no backfill,
 * because no family has ever been recorded as gone.
 */
export class FamilyWithdrawal1790256815587 implements MigrationInterface {
    name = 'FamilyWithdrawal1790256815587';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "withdrawnAt" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "withdrawnAt"`);
    }
}
