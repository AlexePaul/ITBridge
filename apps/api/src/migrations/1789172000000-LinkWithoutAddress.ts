import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `link_without_address` — a shortcut the agent read and could make nothing of (E14/S2).
 *
 * The reason exists because the file used to have no way out. A `.url` with no address in it, or
 * one carrying something that is not `http`/`https`, failed to upload and stayed on the share — so
 * the agent found it again thirty seconds later, and again, and wrote a warning line every time
 * for as long as it sat there. The agent's health field stayed red on a fault nobody could ever
 * clear, which is exactly how a field stops being read.
 *
 * With a reason of its own it becomes what every other refusal already is: a row on the group
 * screen, a file moved to `_neatribuite`, and a repair somebody can actually make.
 *
 * Adding a value to a Postgres enum means rebuilding the type, hence four statements for one word.
 * `unassigned_files.reason` has no default, so there is no dance around one; the `USING` cast maps
 * each existing value onto the identically-named new one.
 */
export class LinkWithoutAddress1789172000000 implements MigrationInterface {
    name = 'LinkWithoutAddress1789172000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."unassigned_files_reason_enum" RENAME TO "unassigned_files_reason_enum_old"`);
        await queryRunner.query(
            `CREATE TYPE "public"."unassigned_files_reason_enum" AS ENUM('unknown_folder', 'group_root', 'extension_not_allowed', 'too_large', 'unreadable', 'link_without_address')`,
        );
        await queryRunner.query(
            `ALTER TABLE "unassigned_files" ALTER COLUMN "reason" TYPE "public"."unassigned_files_reason_enum" USING "reason"::"text"::"public"."unassigned_files_reason_enum"`,
        );
        await queryRunner.query(`DROP TYPE "public"."unassigned_files_reason_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."unassigned_files_reason_enum_old" AS ENUM('unknown_folder', 'group_root', 'extension_not_allowed', 'too_large', 'unreadable')`,
        );
        await queryRunner.query(
            `ALTER TABLE "unassigned_files" ALTER COLUMN "reason" TYPE "public"."unassigned_files_reason_enum_old" USING "reason"::"text"::"public"."unassigned_files_reason_enum_old"`,
        );
        await queryRunner.query(`DROP TYPE "public"."unassigned_files_reason_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."unassigned_files_reason_enum_old" RENAME TO "unassigned_files_reason_enum"`);
    }
}
