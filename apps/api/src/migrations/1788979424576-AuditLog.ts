import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLog1788979424576 implements MigrationInterface {
    name = 'AuditLog1788979424576';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."audit_log_action_enum" AS ENUM('CREATED', 'UPDATED', 'DELETED')`);
        await queryRunner.query(
            `CREATE TABLE "audit_log" ("id" SERIAL NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actor_user_id" integer, "actor_username" character varying(100), "action" "public"."audit_log_action_enum" NOT NULL, "entity_type" character varying(60) NOT NULL, "entity_id" integer NOT NULL, "changes" jsonb NOT NULL, "note" character varying(500), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_audit_log_occurred_at" ON "audit_log" ("occurred_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_audit_log_entity" ON "audit_log" ("entity_type", "entity_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_entity"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_occurred_at"`);
        await queryRunner.query(`DROP TABLE "audit_log"`);
        await queryRunner.query(`DROP TYPE "public"."audit_log_action_enum"`);
    }
}
