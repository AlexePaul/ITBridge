import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The last day an enrolment was a trial — the review of 25 September 2026.
 *
 * The bill kept trials out by their status, and the status changes the moment the office decides:
 * the trial's own class then became billable. This column remembers the trial after the status has
 * moved on. Nullable and without a backfill: there are no families on file, and a row that was
 * never a trial has nothing to remember.
 */
export class EnrollmentTrialUntil1790349000000 implements MigrationInterface {
    name = 'EnrollmentTrialUntil1790349000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "enrollments" ADD "trialUntil" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "enrollments" DROP COLUMN "trialUntil"`);
    }
}
