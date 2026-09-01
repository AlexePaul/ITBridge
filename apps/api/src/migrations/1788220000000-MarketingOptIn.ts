import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whether a family agreed to hear from the school beyond their own business — E17/S4.
 *
 * **Defaults to false**, and that is the decision rather than a shrug. Consent nobody gave is not
 * consent, so no backfill sets it true for the families already on file: the school asks, and the
 * ones who say yes say it themselves.
 *
 * It gates marketing and nothing else. Invoices, receipts, a called-off class and the child's own
 * work are the school performing its contract — if they rested on this column, refusing marketing
 * would cost a family what they are owed, and the consent would stop being freely given, which
 * would invalidate it for marketing too.
 */
export class MarketingOptIn1788220000000 implements MigrationInterface {
    name = 'MarketingOptIn1788220000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "marketingOptIn" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "marketingOptIn"`);
    }
}
