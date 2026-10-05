import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { checkSeedTarget } from './seed-target';
import { describeShape, ScaleShape, scaleShape, TEACHING_WEEKS_PER_YEAR, UNPAID_IN_EVERY } from './scale.rules';
import { latestTaughtMonth } from './seed-months';
import { schoolDay } from '../common/school-clock';

/**
 * A school with years of history behind it, for measuring queries — E04/S3, a second volume.
 *
 * **This is not `pnpm seed`.** That one makes the screens look alive: a handful of families, this
 * week's timetable, a few invoices, real object storage. This one makes the *database* look real,
 * and is deliberately ugly — every family is `Familia 37`, nothing is browsable, and there are no
 * parent accounts. The only thing it is for is putting a query in front of enough rows to find out
 * what it really does.
 *
 * Why it had to exist: the development seed is about 120 classes and 80 register marks. At that
 * size Postgres picks a sequential scan no matter what indexes exist, so a query that scans an
 * entire table and one that uses an index produce identical plans and identical timings. Two real
 * defects hid in exactly that gap until September 2026 — among them a `SUM` over an invoice's
 * payments that ran, unindexed, **while holding that invoice's row lock**.
 *
 * It writes with `generate_series` rather than through TypeORM, and that is the point: forty
 * thousand rows saved one entity at a time is a coffee break, and a tool nobody waits for is a tool
 * nobody runs.
 *
 * **It truncates every table first**, exactly like `pnpm seed`, which is why it goes through the
 * same `checkSeedTarget` — read `seed-target.ts` before pointing this anywhere that is not your own
 * machine. There is no reason to run it against staging: the numbers it produces are about query
 * plans, and those are answered on a laptop.
 */

/** Both dials, from the environment, with the three-year school as the default. */
function requestFromEnv(env: NodeJS.ProcessEnv = process.env) {
    return {
        years: Number(env.SCALE_YEARS ?? 3),
        families: Number(env.SCALE_FAMILIES ?? 250),
    };
}

function assertSafeTarget(dataSource: DataSource): void {
    const options = dataSource.options as { host?: string; database?: string };
    const verdict = checkSeedTarget({ host: options.host ?? '', database: options.database ?? '' });
    if (!verdict.ok) throw new Error(verdict.reason);
}

async function truncateAll(dataSource: DataSource): Promise<void> {
    const tables = dataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Fills the database, in the order the foreign keys require.
 *
 * Every statement is one `INSERT … SELECT … FROM generate_series`, so the whole school is a handful
 * of round trips rather than hundreds of thousands. The two locations are the school's real ones and
 * are created here rather than assumed, because this runs after a truncate.
 */
async function load(dataSource: DataSource, shape: ScaleShape): Promise<void> {
    const q = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);
    // The first day of the newest month the school has finished teaching: invoices count back from
    // it, not from the current month, which the issuing screen refuses until its last week is over
    // (E15 S9). Written from today's month, the scale school had September invoiced in September
    // (QA of 27 September 2026).
    const newestInvoiced = `${latestTaughtMonth(schoolDay(new Date()))}-01`;

    await q(
        `INSERT INTO locations (name, slug, street, city, latitude, longitude, "isActive")
         SELECT 'Locatia ' || g, 'locatia-' || g, 'Str. Exemplu ' || g, 'Bucuresti', 44.43, 26.10, true
         FROM generate_series(1, 2) g`,
    );

    await q(
        `INSERT INTO rooms (name, location_id, capacity, "isActive")
         SELECT 'Sala ' || g, ((g - 1) % 2) + 1, 10, true FROM generate_series(1, $1) g`,
        [shape.rooms],
    );

    await q(
        `INSERT INTO groups (name, weekday, "startTime", "endTime", "minAge", "maxAge", "isActive", room_id, capacity)
         SELECT 'Grupa ' || r.rn, ((r.rn - 1) % 6) + 1, '16:00:00', '17:30:00', 7, 14, true, r.id, 10
         FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM rooms) r`,
    );

    // `email` and `phone` are unique, and `unsubscribeToken` is NOT NULL and written by a
    // subscriber that a raw INSERT never reaches — so it is generated here.
    await q(
        `INSERT INTO profiles ("firstName", "lastName", email, phone, address, "marketingOptIn", "unsubscribeToken")
         SELECT 'Parinte' || g, 'Familia' || g, 'familia' || g || '@example.invalid',
                '+407' || lpad(g::text, 8, '0'), 'Str. Familiei ' || g, false,
                md5(g::text) || md5((g + 7)::text)
         FROM generate_series(1, $1) g`,
        [shape.families],
    );

    await q(
        `INSERT INTO children ("firstName", "lastName", "birthDate", parent_id, group_id)
         SELECT 'Copil' || g, 'Familia' || (((g - 1) % $2) + 1), DATE '2015-01-01' + ((g * 37) % 2000),
                (SELECT id FROM profiles ORDER BY id OFFSET ((g - 1) % $2) LIMIT 1),
                (SELECT id FROM groups ORDER BY id OFFSET ((g - 1) % (SELECT count(*) FROM groups)) LIMIT 1)
         FROM generate_series(1, $1) g`,
        [shape.children, shape.families],
    );

    // From the first class or the first invoiced month, whichever is older: every invoice and every
    // class falls inside an enrolment. They started after the oldest invoices before (QA of 27
    // September 2026), a school billing families for months before they joined.
    await q(
        `INSERT INTO enrollments (child_id, group_id, status, "startDate")
         SELECT c.id, c.group_id, 'ACTIVE', LEAST(CURRENT_DATE - $1::int, ($2::date - (($3::int - 1) || ' month')::interval)::date) FROM children c`,
        [shape.weeks * 7, newestInvoiced, shape.months],
    );

    // One class a week per group, on the group's own weekday, counting back from its most recent
    // one so the newest rows are current. Counted from today alone, every class of the school fell
    // on the weekday the seed ran — 3,510 classes on Sundays (QA of 27 September 2026).
    await q(
        `INSERT INTO class_sessions (group_id, room_id, date, "scheduledFor", "startTime", "endTime", status, "isVacation")
         SELECT gr.id, gr.room_id, d.day, d.day, '16:00:00', '17:30:00', 'scheduled', false
         FROM groups gr, generate_series(0, $1::int - 1) w,
              LATERAL (SELECT CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - gr.weekday + 7) % 7) - (w * 7) AS day) d`,
        [shape.weeks],
    );

    // Per group, never per school: a child is marked once per class of its own group.
    await q(
        `INSERT INTO attendances ("childId", class_session_id, "groupId", type, present)
         SELECT c.id, s.id, s.group_id, 'regular', ((c.id + s.id) % 11 <> 0)
         FROM children c JOIN class_sessions s ON s.group_id = c.group_id`,
    );

    await q(
        `INSERT INTO invoices (parent_id, "monthIssued", "dateIssued", amount, status)
         SELECT p.id,
                to_char(($3::date - (m || ' month')::interval)::date, 'YYYY-MM'),
                -- A week into the next month, after the month's last teaching week; never later than today.
                LEAST(($3::date - (m || ' month')::interval + interval '1 month 7 days')::date, CURRENT_DATE),
                350.00,
                (CASE WHEN (p.id + m) % $2 = 0 THEN 'pending' ELSE 'paid' END)::invoices_status_enum
         FROM profiles p, generate_series(0, $1::int - 1) m`,
        [shape.months, UNPAID_IN_EVERY, newestInvoiced],
    );

    await q(
        `INSERT INTO payments (invoice_id, amount, status, method, date)
         SELECT i.id, i.amount, 'succeeded', 'bank_transfer', i."dateIssued" + 5
         FROM invoices i WHERE i.status = 'paid'`,
    );

    // Everything the school has sent. `sent` rows go only after twelve months (E22 S3), so they are
    // most of the table, which is what makes it the place an unrestricted query hurts first.
    await q(
        `INSERT INTO outbox ("to", subject, "bodyText", status, attempts, "nextAttemptAt", "createdAt", "dedupeKey", "sentAt")
         SELECT 'familia' || (((g - 1) % $2) + 1) || '@example.invalid', 'Mesaj ' || g, 'Corp', 'sent', 1,
                now() - (g || ' minute')::interval, now() - (g || ' minute')::interval, 'scale:' || g, now()
         FROM generate_series(1, $1) g`,
        [shape.outbox, shape.families],
    );

    await q('ANALYZE');
}

/**
 * What the database actually holds, once the load is done.
 *
 * Counted rather than predicted. `pg_stat_user_tables` is an estimate that lags `ANALYZE`, so this
 * asks the tables themselves — it is eight cheap counts against a database nobody else is using.
 */
async function actualCounts(dataSource: DataSource): Promise<Record<string, number>> {
    const tables = ['outbox', 'attendances', 'invoices', 'payments', 'class_sessions', 'enrollments', 'children', 'profiles', 'groups', 'rooms'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
        const rows: { count: string }[] = await dataSource.query(`SELECT COUNT(*)::text AS count FROM "${table}"`);
        counts[table] = Number(rows[0]?.count ?? 0);
    }
    return counts;
}

async function main(): Promise<void> {
    const request = requestFromEnv();
    const shape = scaleShape(request);

    const dataSource = await AppDataSource.initialize();
    try {
        assertSafeTarget(dataSource);

        const started = Date.now();
        await truncateAll(dataSource);
        await load(dataSource, shape);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);

        const options = dataSource.options as { database?: string };
        console.log(`\nA ${request.years}-year school of ${request.families} families, in ${options.database ?? '?'} (${seconds}s):\n`);
        for (const line of describeShape(await actualCounts(dataSource))) console.log(`  ${line}`);
        console.log(
            `\nTeaching weeks a year: ${TEACHING_WEEKS_PER_YEAR}. Change the size with SCALE_YEARS and SCALE_FAMILIES.` +
                `\nThere are no accounts here — it is a database to measure, not an app to click through.` +
                `\nRun \`pnpm seed\` to get the usable one back.\n`,
        );
    } finally {
        await dataSource.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
