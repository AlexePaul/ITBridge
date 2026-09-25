import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The slot a class was generated for, beside the day it is on — the review of 25 September 2026.
 *
 * Generation was idempotent on `(group, date)` and nothing else, so a class moved off its day left
 * that day free, and the next run wrote it again: two classes in the week. `scheduledFor` is the day
 * the generator wrote the row for, and a move leaves it alone, so the generator can ask about the
 * slot rather than the day. Nullable, because a row the generator did not write has no slot.
 *
 * The backfill takes every existing row's own date: correct for every row that was never moved, and
 * the rows that were are seed data — there are no families on file. It runs before the index, which
 * it cannot break: `(group, date)` is already unique.
 */
export class ClassSessionSlot1790346451249 implements MigrationInterface {
    name = 'ClassSessionSlot1790346451249';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "class_sessions" ADD "scheduledFor" date`);
        await queryRunner.query(`UPDATE "class_sessions" SET "scheduledFor" = "date"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_class_sessions_group_slot" ON "class_sessions" ("group_id", "scheduledFor") WHERE "scheduledFor" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_class_sessions_group_slot"`);
        await queryRunner.query(`ALTER TABLE "class_sessions" DROP COLUMN "scheduledFor"`);
    }
}
