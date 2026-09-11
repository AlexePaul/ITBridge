import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The table behind „mi-am uitat parola" — one row per reset link.
 *
 * Shaped like `email_confirmations` and `sessions`, and for the same reason all three exist: the
 * token that travels in the link is never stored, only its SHA-256. A dump of this table has to be
 * worth nothing to whoever reads it.
 *
 * `ON DELETE CASCADE` on the account, because a link is a way back into that account and nothing
 * else — once the account is gone the row is a hash pointing at nobody. The unique constraint on
 * the hash is what makes a collision a write failure rather than two links opening one door; the
 * separate index is the lookup done on every click, and matches the two sibling tables.
 */
export class PasswordResets1789116822354 implements MigrationInterface {
    name = 'PasswordResets1789116822354';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "password_resets" ("id" SERIAL NOT NULL, "tokenHash" character varying(64) NOT NULL, "email" character varying(255) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, CONSTRAINT "UQ_7f6aae0fcc807c9e7194ca5cc4a" UNIQUE ("tokenHash"), CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_7f6aae0fcc807c9e7194ca5cc4" ON "password_resets" ("tokenHash") `);
        await queryRunner.query(
            `ALTER TABLE "password_resets" ADD CONSTRAINT "FK_f7a4c3bc48f24df007936d217be" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "password_resets" DROP CONSTRAINT "FK_f7a4c3bc48f24df007936d217be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7f6aae0fcc807c9e7194ca5cc4"`);
        await queryRunner.query(`DROP TABLE "password_resets"`);
    }
}
