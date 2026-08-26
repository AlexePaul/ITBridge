import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1787754714425 implements MigrationInterface {
    name = 'InitialSchema1787754714425';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "groups" ("id" SERIAL NOT NULL, "weekday" integer NOT NULL, "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "minAge" numeric NOT NULL, "maxAge" numeric NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_6f8667e72733af2bc770ad82084" UNIQUE ("weekday", "startTime"), CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "attendances" ("id" SERIAL NOT NULL, "date" date NOT NULL, "startTime" TIME NOT NULL, "type" character varying(100) NOT NULL DEFAULT 'normal', "present" boolean NOT NULL DEFAULT false, "childId" integer, "groupId" integer NOT NULL, CONSTRAINT "UQ_663c67c450749e8164dbbcf2c62" UNIQUE ("childId", "date", "startTime"), CONSTRAINT "PK_483ed97cd4cd43ab4a117516b69" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "children" ("id" SERIAL NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "birthDate" date NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "parent_id" integer, "group_id" integer, CONSTRAINT "PK_8c5a7cbebf2c702830ef38d22b0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "payments" ("id" SERIAL NOT NULL, "method" character varying(100) NOT NULL DEFAULT 'cash', "date" date NOT NULL, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE TYPE "public"."invoices_status_enum" AS ENUM('pending', 'paid', 'overdue')`);
        await queryRunner.query(
            `CREATE TABLE "invoices" ("id" SERIAL NOT NULL, "amount" numeric(10,2) NOT NULL, "dateIssued" date NOT NULL, "monthIssued" character varying(7) NOT NULL, "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'pending', "parent_id" integer, "payment_id" integer, CONSTRAINT "UQ_36ce2477482d57688df2ad5023c" UNIQUE ("parent_id", "monthIssued"), CONSTRAINT "REL_02781c49b25ceb502571f0315f" UNIQUE ("payment_id"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "discounts" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "description" character varying(255), "value" numeric NOT NULL, "monthIssued" character varying(7) NOT NULL, "parent_id" integer, CONSTRAINT "PK_66c522004212dc814d6e2f14ecc" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "profiles" ("id" SERIAL NOT NULL, "email" character varying(255), "phone" character varying(30), "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "address" character varying(255), "user_id" integer, CONSTRAINT "UQ_5b49bd22c967ce2829ca8f17720" UNIQUE ("email"), CONSTRAINT "UQ_6ca5cd9bacd921599be9d920973" UNIQUE ("phone"), CONSTRAINT "REL_9e432b7df0d182f8d292902d1a" UNIQUE ("user_id"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying(30) NOT NULL, "passwordHash" character varying(255) NOT NULL, "role" character varying(20) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "attendances" ADD CONSTRAINT "FK_5b90b20d8fa90f23e0973896990" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "attendances" ADD CONSTRAINT "FK_960f6ee431b5d708e91021fc23e" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "children" ADD CONSTRAINT "FK_e7f4185179e59c184d4ad363040" FOREIGN KEY ("parent_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "children" ADD CONSTRAINT "FK_dea8747230877c24f4206485a46" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "invoices" ADD CONSTRAINT "FK_14781c2ffe0de33f4fe866bf0c2" FOREIGN KEY ("parent_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "invoices" ADD CONSTRAINT "FK_02781c49b25ceb502571f0315f6" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "discounts" ADD CONSTRAINT "FK_390c6c8a5dee9285e1fdc20c207" FOREIGN KEY ("parent_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`);
        await queryRunner.query(`ALTER TABLE "discounts" DROP CONSTRAINT "FK_390c6c8a5dee9285e1fdc20c207"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_02781c49b25ceb502571f0315f6"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_14781c2ffe0de33f4fe866bf0c2"`);
        await queryRunner.query(`ALTER TABLE "children" DROP CONSTRAINT "FK_dea8747230877c24f4206485a46"`);
        await queryRunner.query(`ALTER TABLE "children" DROP CONSTRAINT "FK_e7f4185179e59c184d4ad363040"`);
        await queryRunner.query(`ALTER TABLE "attendances" DROP CONSTRAINT "FK_960f6ee431b5d708e91021fc23e"`);
        await queryRunner.query(`ALTER TABLE "attendances" DROP CONSTRAINT "FK_5b90b20d8fa90f23e0973896990"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "profiles"`);
        await queryRunner.query(`DROP TABLE "discounts"`);
        await queryRunner.query(`DROP TABLE "invoices"`);
        await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TABLE "children"`);
        await queryRunner.query(`DROP TABLE "attendances"`);
        await queryRunner.query(`DROP TABLE "groups"`);
    }
}
