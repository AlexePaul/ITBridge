import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileErasure1788983987123 implements MigrationInterface {
    name = 'ProfileErasure1788983987123';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "erasureRequestedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD "erasedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "erasedAt"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "erasureRequestedAt"`);
    }
}
