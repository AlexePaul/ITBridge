import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceCreatedAt1791000000000 implements MigrationInterface {
    name = 'InvoiceCreatedAt1791000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "createdAt"`);
    }
}
