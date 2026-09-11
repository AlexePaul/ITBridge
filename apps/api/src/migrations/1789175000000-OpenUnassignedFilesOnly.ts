import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A stray file can be reported again once somebody has dealt with the last one — E14/S2.
 *
 * `reportKey` is `{groupId}:{relativePath}`, and it carried a plain unique constraint. That reads
 * as "report each place once", but what it actually promised is that a file which turned up in the
 * group folder in September can never turn up there again — and the commonest cause of these is a
 * teacher's habit, so it turns up there again in October. The second time, the insert was ignored,
 * the agent moved the file into `_neatribuite` exactly as before, and no row appeared anywhere: the
 * file left the folder in silence, which is the one thing the story promises will not happen.
 *
 * Partial instead, so that history accumulates and only the open reports are unique — the idiom
 * already used by `UQ_enrollments_one_in_force` and `UQ_waitlist_one_open_per_child_group`, and for
 * the same reason: what must be unique is what is in force, not what has ever been.
 *
 * The old constraint is dropped by name. It was generated, so the name is the hash TypeORM gave it
 * when `unassigned_files` was created.
 */
export class OpenUnassignedFilesOnly1789175000000 implements MigrationInterface {
    name = 'OpenUnassignedFilesOnly1789175000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "unassigned_files" DROP CONSTRAINT "UQ_2f461c0c60c3c72fbeb3d569cc7"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_unassigned_files_one_open_per_path" ON "unassigned_files" ("reportKey") WHERE "resolvedAt" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_unassigned_files_one_open_per_path"`);
        // Only possible while no two rows share a key, which is exactly what the index above stopped
        // being true. A rollback on a database that has seen a repeat will fail here, loudly, which
        // is the right way round: the alternative is deleting somebody's report to make room.
        await queryRunner.query(`ALTER TABLE "unassigned_files" ADD CONSTRAINT "UQ_2f461c0c60c3c72fbeb3d569cc7" UNIQUE ("reportKey")`);
    }
}
