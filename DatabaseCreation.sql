DROP TABLE IF EXISTS attendance CASCADE;


DROP TABLE IF EXISTS invoices CASCADE;


DROP TABLE IF EXISTS payments CASCADE;


DROP TABLE IF EXISTS children CASCADE;


DROP TABLE IF EXISTS groups CASCADE;


DROP TABLE IF EXISTS parents CASCADE;


DROP TABLE IF EXISTS users CASCADE;


-- USERS
CREATE TABLE "users" (
  "id" bigserial PRIMARY KEY,
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "role" varchar(20) NOT NULL,
  "phone" varchar(30),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);


COMMENT ON COLUMN "users"."role" IS 'ENUM: ADMIN, PARENT';


-- PARENTS
CREATE TABLE "parents" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint UNIQUE NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "address" varchar(255),
  CONSTRAINT fk_parents_user FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);


-- GROUPS
CREATE TABLE "groups" (
  "id" bigserial PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "min_age" int NOT NULL,
  "max_age" int NOT NULL,
  "schedule_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);


COMMENT ON COLUMN "groups"."schedule_json" IS 'Example: [{day, start, end}]';


-- CHILDREN
CREATE TABLE "children" (
  "id" bigserial PRIMARY KEY,
  "parent_id" bigint NOT NULL,
  "group_id" bigint,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "birth_date" date NOT NULL,
  "age" int NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_children_parent FOREIGN KEY ("parent_id") REFERENCES "parents" ("id") ON DELETE CASCADE,
  CONSTRAINT fk_children_group FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE SET NULL
);


CREATE INDEX idx_children_parent ON "children" ("parent_id");


CREATE INDEX idx_children_group ON "children" ("group_id");


-- PAYMENTS
CREATE TABLE "payments" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint NOT NULL,
  "child_id" bigint,
  "amount" numeric(10, 2) NOT NULL,
  "method" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "transaction_id" varchar(255),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "payment_date" timestamptz,
  CONSTRAINT fk_payments_user FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT fk_payments_child FOREIGN KEY ("child_id") REFERENCES "children" ("id") ON DELETE SET NULL
);


COMMENT ON COLUMN "payments"."method" IS 'ENUM: ONLINE, CASH';


COMMENT ON COLUMN "payments"."status" IS 'ENUM: PENDING, PAID, FAILED';


CREATE INDEX idx_payments_user ON "payments" ("user_id");


CREATE INDEX idx_payments_child ON "payments" ("child_id");


-- INVOICES
CREATE TABLE "invoices" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint NOT NULL,
  "payment_id" bigint UNIQUE NOT NULL,
  "pdf_path" varchar(500) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_invoices_user FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT fk_invoices_payment FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") ON DELETE CASCADE
);


-- ATTENDANCE
CREATE TABLE "attendance" (
  "id" bigserial PRIMARY KEY,
  "child_id" bigint NOT NULL,
  "group_id" bigint NOT NULL,
  "date" date NOT NULL,
  "status" varchar(20) NOT NULL,
  CONSTRAINT fk_attendance_child FOREIGN KEY ("child_id") REFERENCES "children" ("id") ON DELETE CASCADE,
  CONSTRAINT fk_attendance_group FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE CASCADE
);


COMMENT ON COLUMN "attendance"."status" IS 'ENUM: PRESENT, ABSENT';


CREATE UNIQUE INDEX uniq_attendance_child_date ON "attendance" ("child_id", "date");


CREATE INDEX idx_attendance_group_date ON "attendance" ("group_id", "date");