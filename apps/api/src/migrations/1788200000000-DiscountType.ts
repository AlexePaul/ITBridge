import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A discount says whether its value is lei or per cent — E15/S5.
 *
 * The column exists because the number alone cannot say: a stored `50` is fifty lei or half the
 * invoice, and until now the platform could only mean the first. The referral decided in E20/S5 is
 * 50% of the total, twice per recommendation, which is what finally gave the type a customer.
 *
 * Every existing row is `fixed`, which is what it always meant — including the seeded
 * "Recomandare" of 50 lei, which was an absolute amount standing in for a rule the platform could
 * not yet express. No backfill converts anything: a 50 that meant lei still means lei.
 */
export class DiscountType1788200000000 implements MigrationInterface {
    name = 'DiscountType1788200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."discounts_type_enum" AS ENUM('fixed', 'percent')`);
        await queryRunner.query(`ALTER TABLE "discounts" ADD "type" "public"."discounts_type_enum" NOT NULL DEFAULT 'fixed'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "discounts" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."discounts_type_enum"`);
    }
}
