import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `content_mismatch` — a file the server refused because its bytes are not what its name says
 * (E14/S2, review of 25 September 2026).
 *
 * The agent treated every refusal from the server as "try again": a `.png` that was really a JPEG,
 * or a zero-byte `.sb3`, stayed in the child's folder and was uploaded again every thirty seconds,
 * 25 MB at a time, for as long as it sat there — never on the group screen, never in
 * `_neatribuite`, and the agent's health field red on a fault nobody could see. The refusals that
 * already had a reason (too large, type not accepted, a link with no usable address) now take it;
 * this one had none, and its repair is its own — save the file again in the format it claims.
 *
 * Rebuilt the same way `LinkWithoutAddress1789172000000` rebuilt it: rename, create, cast, drop.
 */
export class ContentMismatchReason1790360000000 implements MigrationInterface {
    name = 'ContentMismatchReason1790360000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."unassigned_files_reason_enum" RENAME TO "unassigned_files_reason_enum_old"`);
        await queryRunner.query(
            `CREATE TYPE "public"."unassigned_files_reason_enum" AS ENUM('unknown_folder', 'group_root', 'extension_not_allowed', 'too_large', 'unreadable', 'link_without_address', 'content_mismatch')`,
        );
        await queryRunner.query(
            `ALTER TABLE "unassigned_files" ALTER COLUMN "reason" TYPE "public"."unassigned_files_reason_enum" USING "reason"::"text"::"public"."unassigned_files_reason_enum"`,
        );
        await queryRunner.query(`DROP TYPE "public"."unassigned_files_reason_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."unassigned_files_reason_enum_old" AS ENUM('unknown_folder', 'group_root', 'extension_not_allowed', 'too_large', 'unreadable', 'link_without_address')`,
        );
        await queryRunner.query(
            `ALTER TABLE "unassigned_files" ALTER COLUMN "reason" TYPE "public"."unassigned_files_reason_enum_old" USING "reason"::"text"::"public"."unassigned_files_reason_enum_old"`,
        );
        await queryRunner.query(`DROP TYPE "public"."unassigned_files_reason_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."unassigned_files_reason_enum_old" RENAME TO "unassigned_files_reason_enum"`);
    }
}
