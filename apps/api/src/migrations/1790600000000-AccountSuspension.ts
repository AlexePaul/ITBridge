import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Terms §14: the school can suspend an account used against the rules, telling the family why, and
 * reactivate it when the reason is gone. Two nullable columns on the account — no row has either
 * until somebody acts.
 */
export class AccountSuspension1790600000000 implements MigrationInterface {
    name = 'AccountSuspension1790600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "suspendedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "suspensionReason" character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspensionReason"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspendedAt"`);
    }
}
