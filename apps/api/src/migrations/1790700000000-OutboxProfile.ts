import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The family a message was written to — so the delivery record can name it, the undeliverable rows
 * above all. Nullable (the office's messages have no family), indexed like every relation (CLAUDE.md),
 * and `SET NULL` when a profile row is deleted: the record of a message outlives who it was for.
 */
export class OutboxProfile1790700000000 implements MigrationInterface {
    name = 'OutboxProfile1790700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "outbox" ADD "profile_id" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_profile_id" ON "outbox" ("profile_id") `);
        await queryRunner.query(
            `ALTER TABLE "outbox" ADD CONSTRAINT "FK_814d14685ea6f65d10d79ce3c76" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "outbox" DROP CONSTRAINT "FK_814d14685ea6f65d10d79ce3c76"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_profile_id"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "profile_id"`);
    }
}
