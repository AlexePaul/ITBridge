import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E14: a child's work becomes rows. Six new tables and one new column.
 *
 * Generated, then read. Nothing needed rewriting by hand this time — there is no existing data to
 * carry across, because none of this existed before: `grep -r consent apps/api/src` returning
 * nothing was true of projects too. That is worth stating rather than assuming, since the last
 * migration of this size (`ClassSessionsAndOutbox`) had to be written by hand precisely because the
 * generator emitted a destructive order for a table that already had rows in it.
 *
 * Two details that are not obvious from the DDL:
 *
 *  - **`projects.publicId` has no database default**, even though `gen_random_uuid()` has been in
 *    core Postgres since 13 and would do the job. TypeORM cannot compare a function default against
 *    what the database reports, so `check:schema` would declare drift on every run — emitting a DROP
 *    DEFAULT followed by the identical SET DEFAULT — and a guard that fails on every pull request
 *    stops being read. A `@BeforeInsert` hook on the entity assigns it instead.
 *  - **`outbox.attachments` is nullable and stays empty for every existing row.** The queue carries
 *    keys, not bytes: E14/S4 mails the thumbnail as an inline attachment rather than as a signed
 *    URL, and the object is read out of the bucket in the second the message is handed over.
 *
 * The unique index on `project_files.ingestionKey` is the one to keep: it is `{childId}:{sha256}`
 * and it is what makes an upload idempotent, so an agent retrying after a dropped connection cannot
 * produce a second project — and, at send time, a second thumbnail in a parent's email.
 */
export class StudentProjects1788102521426 implements MigrationInterface {
    name = 'StudentProjects1788102521426';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."unassigned_files_reason_enum" AS ENUM('unknown_folder', 'group_root', 'extension_not_allowed', 'too_large', 'unreadable')`,
        );
        await queryRunner.query(
            `CREATE TABLE "unassigned_files" ("id" SERIAL NOT NULL, "relativePath" character varying(1024) NOT NULL, "fileName" character varying(255) NOT NULL, "sizeBytes" bigint NOT NULL DEFAULT '0', "reason" "public"."unassigned_files_reason_enum" NOT NULL, "reportKey" character varying(1100) NOT NULL, "reportedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolvedAt" TIMESTAMP WITH TIME ZONE, "group_id" integer, CONSTRAINT "UQ_2f461c0c60c3c72fbeb3d569cc7" UNIQUE ("reportKey"), CONSTRAINT "PK_456234bbae3e97653977159a4f0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "project_files" ("id" SERIAL NOT NULL, "originalName" character varying(255) NOT NULL, "contentType" character varying(120) NOT NULL, "sizeBytes" bigint NOT NULL, "ingestionKey" character varying(120) NOT NULL, "uploadedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version_id" integer NOT NULL, CONSTRAINT "PK_ba9b1f07ba163e0e21f72f4e02b" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_project_files_ingestion_key" ON "project_files" ("ingestionKey") `);
        await queryRunner.query(
            `CREATE TABLE "project_versions" ("id" SERIAL NOT NULL, "versionNumber" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "project_id" integer NOT NULL, CONSTRAINT "UQ_project_versions_project_number" UNIQUE ("project_id", "versionNumber"), CONSTRAINT "PK_0933adf663634f5c8c335e7b5e4" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "project_links" ("id" SERIAL NOT NULL, "label" character varying(200) NOT NULL, "url" character varying(2048) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "project_id" integer NOT NULL, CONSTRAINT "PK_afff993e1b62a47c2168aff2c56" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE TYPE "public"."projects_status_enum" AS ENUM('new', 'sent', 'error')`);
        await queryRunner.query(`CREATE TYPE "public"."projects_source_enum" AS ENUM('agent', 'admin')`);
        await queryRunner.query(
            `CREATE TABLE "projects" ("id" SERIAL NOT NULL, "publicId" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "capturedOn" date NOT NULL, "status" "public"."projects_status_enum" NOT NULL DEFAULT 'new', "source" "public"."projects_source_enum" NOT NULL DEFAULT 'agent', "hasThumbnail" boolean NOT NULL DEFAULT false, "sentAt" TIMESTAMP WITH TIME ZONE, "sentToEmail" character varying(255), "sentOutboxMessageId" integer, "reassignedAt" TIMESTAMP WITH TIME ZONE, "reassignedFromChildId" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "child_id" integer NOT NULL, "class_session_id" integer, "uploaded_by_user_id" integer, "reassigned_by_user_id" integer, CONSTRAINT "UQ_fa0f541795977c13811b6ddfaeb" UNIQUE ("publicId"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_projects_child_captured" ON "projects" ("child_id", "capturedOn") `);
        await queryRunner.query(
            `CREATE TABLE "agent_status" ("id" SERIAL NOT NULL, "agentName" character varying(100) NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "version" character varying(50), "watchedRoot" character varying(500), "pendingFiles" integer NOT NULL DEFAULT '0', "lastError" text, CONSTRAINT "UQ_76bce034b1e5461724e16c48ed7" UNIQUE ("agentName"), CONSTRAINT "PK_52a58ad5994033b245eb28e4ce5" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`ALTER TABLE "outbox" ADD "attachments" jsonb`);
        await queryRunner.query(
            `ALTER TABLE "unassigned_files" ADD CONSTRAINT "FK_0a1969f59d0784f27181c6418b3" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "project_files" ADD CONSTRAINT "FK_dde0d40d9ae56f610591d474182" FOREIGN KEY ("version_id") REFERENCES "project_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "project_versions" ADD CONSTRAINT "FK_f1deab56bfe3bd92fe174118519" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "project_links" ADD CONSTRAINT "FK_aa6f941f78f7d57910c42bf3ddc" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "projects" ADD CONSTRAINT "FK_2a77fee15cb484153c1d593c6b6" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "projects" ADD CONSTRAINT "FK_6eeb18c48a5521b588b11deb65e" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "projects" ADD CONSTRAINT "FK_3a9d584d5fe281544283c5e684c" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "projects" ADD CONSTRAINT "FK_1550bc437407ba188f9bdcb793e" FOREIGN KEY ("reassigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_1550bc437407ba188f9bdcb793e"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_3a9d584d5fe281544283c5e684c"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_6eeb18c48a5521b588b11deb65e"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_2a77fee15cb484153c1d593c6b6"`);
        await queryRunner.query(`ALTER TABLE "project_links" DROP CONSTRAINT "FK_aa6f941f78f7d57910c42bf3ddc"`);
        await queryRunner.query(`ALTER TABLE "project_versions" DROP CONSTRAINT "FK_f1deab56bfe3bd92fe174118519"`);
        await queryRunner.query(`ALTER TABLE "project_files" DROP CONSTRAINT "FK_dde0d40d9ae56f610591d474182"`);
        await queryRunner.query(`ALTER TABLE "unassigned_files" DROP CONSTRAINT "FK_0a1969f59d0784f27181c6418b3"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "attachments"`);
        await queryRunner.query(`DROP TABLE "agent_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_projects_child_captured"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP TYPE "public"."projects_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."projects_status_enum"`);
        await queryRunner.query(`DROP TABLE "project_links"`);
        await queryRunner.query(`DROP TABLE "project_versions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_project_files_ingestion_key"`);
        await queryRunner.query(`DROP TABLE "project_files"`);
        await queryRunner.query(`DROP TABLE "unassigned_files"`);
        await queryRunner.query(`DROP TYPE "public"."unassigned_files_reason_enum"`);
    }
}
