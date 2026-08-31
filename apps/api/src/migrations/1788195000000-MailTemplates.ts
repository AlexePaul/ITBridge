import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The school's edited email wording — E17/S2.
 *
 * A row exists only when a template has been customized; the defaults live in code, next to each
 * template's variables and sample data. That is why there is no seed here: an empty table means
 * "everything reads as the code ships it", which is the correct starting state.
 */
export class MailTemplates1788195000000 implements MigrationInterface {
    name = 'MailTemplates1788195000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "mail_templates" ("id" SERIAL NOT NULL, "key" character varying(60) NOT NULL, "subject" text NOT NULL, "bodyText" text NOT NULL, "bodyHtml" text, "version" integer NOT NULL DEFAULT '1', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2fddc9622173adfec54ba0e0872" UNIQUE ("key"), CONSTRAINT "PK_44d049203b73dd6d61e2903dc0e" PRIMARY KEY ("id"))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "mail_templates"`);
    }
}
