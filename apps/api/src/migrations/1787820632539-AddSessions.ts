import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessions1787820632539 implements MigrationInterface {
    name = 'AddSessions1787820632539';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "sessions" ("id" SERIAL NOT NULL, "tokenHash" character varying(64) NOT NULL, "familyId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "userAgent" character varying(255), "user_id" integer NOT NULL, CONSTRAINT "UQ_bace6c68efc156fddac9b14bda2" UNIQUE ("tokenHash"), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_bace6c68efc156fddac9b14bda" ON "sessions" ("tokenHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_63ea0a724c1b8e6ccae9dc22a3" ON "sessions" ("familyId") `);
        await queryRunner.query(
            `ALTER TABLE "sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_63ea0a724c1b8e6ccae9dc22a3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bace6c68efc156fddac9b14bda"`);
        await queryRunner.query(`DROP TABLE "sessions"`);
    }
}
