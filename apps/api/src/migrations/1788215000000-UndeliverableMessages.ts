import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A message that had nowhere to go leaves a row — E17/S5.
 *
 * Until now the senders branched on `if (profile.email)` and logged a warning down the other side,
 * so a family with no address was skipped in silence: no row, no error, nothing to find. The story
 * is explicit that this must not happen, and the reason is not the child's document — it is the
 * invoice and the arrears reminder that go the same way, and the school finds out when it checks
 * the takings.
 *
 * `undeliverable` is terminal and never claimed by the dispatcher, whose query asks for `pending`.
 * No backoff makes an address appear.
 *
 * The reason is a typed column rather than free text in `lastError`, because the screen branches on
 * it: `no_address` needs a phone call, `unconfirmed_address` needs the confirmation link sent
 * again. They look identical in a list and are resolved differently, which is exactly why one
 * value would not do.
 */
export class UndeliverableMessages1788215000000 implements MigrationInterface {
    name = 'UndeliverableMessages1788215000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."outbox_undeliverablereason_enum" AS ENUM('no_address', 'unconfirmed_address')`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "undeliverableReason" "public"."outbox_undeliverablereason_enum"`);

        // Adding a value to a Postgres enum means rebuilding the type. Existing rows keep their
        // status: the `USING ... ::text::` cast maps each old value onto the identically-named new one.
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum" RENAME TO "outbox_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('pending', 'sent', 'failed', 'undeliverable')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"text"::"public"."outbox_status_enum"`,
        );
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rows in the state being removed become `failed`, which is the closest true statement:
        // they were not delivered and nothing will retry them.
        await queryRunner.query(`UPDATE "outbox" SET "status" = 'failed' WHERE "status" = 'undeliverable'`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum_old" AS ENUM('pending', 'sent', 'failed')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"text"::"public"."outbox_status_enum_old"`,
        );
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum_old" RENAME TO "outbox_status_enum"`);

        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "undeliverableReason"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_undeliverablereason_enum"`);
    }
}
