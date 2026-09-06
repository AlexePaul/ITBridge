import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The vacation tick on a session — E12/S8.
 *
 * One boolean, default false, put there by whoever takes the register. It means a single thing:
 * this hour was held in a school holiday, for whoever wanted to come. What follows from it is a
 * billing rule and lives in E15/S9 — a ticked session is billed only to the children marked
 * present, where an ordinary one is billed to the whole group.
 *
 * Not a status and not a `NonTeachingPeriod`, on purpose. The calendar means "the school is
 * closed" — the day generates no sessions and cancels the ones it already had. The tick means
 * almost the opposite: open, taught, with a register. One mechanism carrying both meanings would
 * be an ambiguous word exactly where the money is decided.
 *
 * Backfilled to `false` for every existing row, which is true of every one of them: nothing before
 * this migration could have been a vacation session, because nothing could say so.
 */
export class VacationSessions1788260000000 implements MigrationInterface {
    name = 'VacationSessions1788260000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "class_sessions" ADD "isVacation" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "class_sessions" DROP COLUMN "isVacation"`);
    }
}
