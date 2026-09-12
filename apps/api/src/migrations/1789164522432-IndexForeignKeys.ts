import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An index on every foreign key column that did not have one.
 *
 * Postgres indexes the **referenced** side of a foreign key, never the referencing side — the
 * column living on the child table. So every `ON DELETE CASCADE` and every `RESTRICT` check, and
 * every query that filters by a relation, was a sequential scan. Thirty-four columns were in that
 * state; two of them carry queries that run inside a row lock.
 *
 * Measured on a three-year school — 250 families, 300 children, 3.1k classes, 46.8k register
 * marks, 9k invoices, 8.25k payments:
 *
 * - `payments.invoice_id` — `recomputeInvoiceStatus` sums the succeeded payments of one invoice
 *   **while holding that invoice's row lock**, on every payment written or edited. 0.791 ms of
 *   sequential scan became 0.116 ms of index scan.
 * - `attendances.class_session_id` — the register of one class, which is what a teacher opens in
 *   the room and what the billable-session count reads per session. 3.378 ms became 0.055 ms.
 *
 * The cost was measured too, because "add an index" is not free: twenty thousand new register
 * rows insert in 551 ms with the index and 567 ms without — inside the noise — and the two
 * indexes above occupy 416 kB and 200 kB against tables of 2.4 MB and 624 kB.
 *
 * Not every one of the thirty-four was measured, and not every one will show up in a plan today:
 * `leads`, `projects` and `absence_notices` are small or empty so far. They are here because the
 * rule is the same for all of them — a foreign key with no index is a scan waiting for the table
 * to grow — and because a half-indexed schema is one nobody can reason about later.
 */

export class IndexForeignKeys1789164522432 implements MigrationInterface {
    name = 'IndexForeignKeys1789164522432';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_class_sessions_room_id" ON "class_sessions" ("room_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_attendances_groupId" ON "attendances" ("groupId") `);
        await queryRunner.query(`CREATE INDEX "IDX_attendances_class_session_id" ON "attendances" ("class_session_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_children_parent_id" ON "children" ("parent_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_children_group_id" ON "children" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_payments_recorded_by_id" ON "payments" ("recorded_by_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_payments_invoice_id" ON "payments" ("invoice_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_discounts_parent_id" ON "discounts" ("parent_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_waitlist_entries_group_id" ON "waitlist_entries" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_unassigned_files_group_id" ON "unassigned_files" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_session_count_overrides_created_by_id" ON "session_count_overrides" ("created_by_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_project_files_version_id" ON "project_files" ("version_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_project_links_project_id" ON "project_links" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_projects_uploaded_by_user_id" ON "projects" ("uploaded_by_user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_projects_reassigned_by_user_id" ON "projects" ("reassigned_by_user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_projects_class_session_id" ON "projects" ("class_session_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_password_resets_user_id" ON "password_resets" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_announcements_sent_by_id" ON "announcements" ("sent_by_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_announcements_location_id" ON "announcements" ("location_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_announcements_group_id" ON "announcements" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_announcement_id" ON "outbox" ("announcement_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_non_teaching_periods_location_id" ON "non_teaching_periods" ("location_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_enrollments_group_id" ON "enrollments" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_profile_id" ON "leads" ("profile_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_location_id" ON "leads" ("location_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_group_id" ON "leads" ("group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_enrollment_id" ON "leads" ("enrollment_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_class_session_id" ON "leads" ("class_session_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_child_id" ON "leads" ("child_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_leads_assigned_to_id" ON "leads" ("assigned_to_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_email_confirmations_user_id" ON "email_confirmations" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_absence_notices_class_session_id" ON "absence_notices" ("class_session_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_absence_notices_announced_by_id" ON "absence_notices" ("announced_by_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_absence_notices_announced_by_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_absence_notices_class_session_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_confirmations_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_assigned_to_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_child_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_class_session_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_enrollment_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_location_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_leads_profile_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_enrollments_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_non_teaching_periods_location_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_announcement_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_announcements_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_announcements_location_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_announcements_sent_by_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_password_resets_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_projects_class_session_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_projects_reassigned_by_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_projects_uploaded_by_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_project_links_project_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_project_files_version_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_session_count_overrides_created_by_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_sessions_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_unassigned_files_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_waitlist_entries_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_discounts_parent_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_invoice_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_recorded_by_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_children_group_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_children_parent_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_attendances_class_session_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_attendances_groupId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_class_sessions_room_id"`);
    }
}
