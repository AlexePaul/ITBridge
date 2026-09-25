import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One family per mailbox, whatever the capitals.
 *
 * `profiles.email` was unique as written, while registration, the profile edits and
 * `forgot-password` all look an address up by `lower(email)`. The edits compared exactly, so a
 * parent could store `Ana@Example.com` beside another family's `ana@example.com` — the same mailbox
 * — and the reset lookup then met two rows. The services now compare ignoring capitals; this index
 * holds the same line for two requests that pass the check together. TypeORM cannot describe an
 * expression index and leaves one alone, so the entity does not declare it and the drift check does
 * not report it. No clean-up first: there are no families on file whose addresses differ only in
 * capitals, because there are no families on file.
 */
export class ProfileEmailIgnoringCase1790343807279 implements MigrationInterface {
    name = 'ProfileEmailIgnoringCase1790343807279';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_profiles_email_lower" ON "profiles" (lower("email"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_profiles_email_lower"`);
    }
}
