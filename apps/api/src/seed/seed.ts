import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { User } from '../entities/user.entity';
import { Profile } from '../entities/profile.entity';
import { Child } from '../entities/child.entity';
import { Group } from '../entities/group.entity';
import { Location } from '../entities/location.entity';
import { Room } from '../entities/room.entity';
import { Attendance } from '../entities/attendance.entity';
import { ClassSession } from '../entities/class-session.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Discount } from '../entities/discount.entity';
import { Role } from '../enum/role.enum';
import { PdfService } from '../modules/invoice/pdf.service';
import { S3Service } from '../modules/invoice/s3.service';
import { invoicePdfKey } from '../modules/invoice/invoice.service';
import { Weekday } from '../enum/weekday.enum';
import { AttendanceType } from '../enum/attendance-type.enum';
import { ClassSessionStatus } from '../enum/class-session-status.enum';
import { DEFAULT_HORIZON_WEEKS } from '../modules/class-session/class-session.service';
import { addDays, occurrencesOf } from '../modules/class-session/class-session.dates';
import { monthlyAmountFor } from '../modules/invoice/pricing';

/**
 * Fills a local database with data that looks like the real thing, so the admin screens are not
 * empty while developing. See E04/S3.
 *
 * Not for production: it wipes every table first, and the passwords are deliberately trivial.
 * `SEED_ALLOW_NON_LOCAL=1` is required to point it at anything other than localhost.
 */

const PASSWORD = 'parola123';

/** Deterministic output: the same command twice gives the same database. */
const SEED_TODAY = new Date('2026-03-16T09:00:00.000Z');

/** How much timetable is written behind the seed date. Attendance exists for all of it but the last week. */
const HISTORY_WEEKS = 8;

const FIRST_NAMES = ['Ana', 'Bogdan', 'Cristina', 'David', 'Elena', 'Florin', 'Gabriela', 'Horia', 'Ioana', 'Lucian'];
const LAST_NAMES = ['Popescu', 'Ionescu', 'Dumitrescu', 'Georgescu', 'Stan', 'Marin', 'Radu', 'Barbu'];
const CHILD_NAMES = ['Maria', 'Andrei', 'Sofia', 'Matei', 'Ilinca', 'Luca', 'Daria', 'Vlad', 'Ruxandra', 'Tudor'];

/**
 * The two real addresses, kept in step with `apps/web/shared/school.ts` and with the migration
 * that inserts the same two rows into a database built from scratch.
 */
const LOCATIONS = [
    {
        name: 'Drumul Taberei',
        slug: 'drumul-taberei',
        street: 'Strada Valea Oltului 73',
        city: 'București',
        district: 'Sector 6',
        postalCode: '061971',
        latitude: 44.415847,
        longitude: 26.013556,
    },
    {
        name: 'Străulești',
        slug: 'straulesti',
        street: 'Șoseaua București-Târgoviște 19A',
        city: 'București',
        district: 'Sector 1',
        postalCode: '013505',
        latitude: 44.510623,
        longitude: 26.020696,
    },
];

/**
 * Two rooms in Drumul Taberei, one in Străulești — enough for the timetable below to be plausible.
 *
 * Ten seats everywhere: that is the school's standard room, and the same number the migration
 * writes for a database built from scratch. It is a default, not a rule — a room's capacity is
 * edited from `/admin/locations`.
 */
const ROOM_CAPACITY = 10;

const ROOMS: { name: string; locationSlug: string; capacity: number; computers: number }[] = [
    { name: 'Sala 1', locationSlug: 'drumul-taberei', capacity: ROOM_CAPACITY, computers: ROOM_CAPACITY },
    { name: 'Sala 2', locationSlug: 'drumul-taberei', capacity: ROOM_CAPACITY, computers: ROOM_CAPACITY },
    { name: 'Sala 1', locationSlug: 'straulesti', capacity: ROOM_CAPACITY, computers: ROOM_CAPACITY },
];

/**
 * Weekly timetable, split by age band and spread over the rooms.
 *
 * The Tuesday 16:00 pair is deliberate: the same slot in two different locations is exactly what
 * the old school-wide uniqueness constraint made impossible, so seeding it keeps the fix visible
 * in a freshly seeded database rather than only in a test.
 */
const GROUP_SLOTS: { name: string; weekday: Weekday; startTime: string; endTime: string; minAge: number; maxAge: number; room: string }[] = [
    { name: 'Scratch Începători', weekday: Weekday.MONDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 7, maxAge: 10, room: 'drumul-taberei/Sala 1' },
    { name: 'Python Începători', weekday: Weekday.MONDAY, startTime: '18:00:00', endTime: '19:30:00', minAge: 11, maxAge: 14, room: 'drumul-taberei/Sala 1' },
    { name: 'Scratch Avansați', weekday: Weekday.TUESDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 7, maxAge: 10, room: 'drumul-taberei/Sala 2' },
    { name: 'Roblox Începători', weekday: Weekday.TUESDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 8, maxAge: 11, room: 'straulesti/Sala 1' },
    { name: 'Web Începători', weekday: Weekday.WEDNESDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 8, maxAge: 12, room: 'drumul-taberei/Sala 1' },
    { name: 'C++ Olimpiadă', weekday: Weekday.WEDNESDAY, startTime: '18:00:00', endTime: '19:30:00', minAge: 13, maxAge: 16, room: 'drumul-taberei/Sala 2' },
    { name: 'Python Avansați', weekday: Weekday.THURSDAY, startTime: '17:00:00', endTime: '18:30:00', minAge: 9, maxAge: 13, room: 'straulesti/Sala 1' },
];

function assertLocalDatabase(dataSource: DataSource): void {
    const host = (dataSource.options as { host?: string }).host ?? '';
    const local = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
    if (!local && process.env.SEED_ALLOW_NON_LOCAL !== '1') {
        throw new Error(
            `Refusing to seed a non-local database (host: ${host || 'unset'}). ` +
                'This command deletes every row. Set SEED_ALLOW_NON_LOCAL=1 if you really mean it.',
        );
    }
}

/** Wipes everything, so `pnpm seed` twice in a row gives the same result rather than duplicates. */
async function truncateAll(dataSource: DataSource): Promise<void> {
    const tables = dataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Date `n` days before the fixed seed date, at midnight. */
function daysAgo(n: number): Date {
    const d = new Date(SEED_TODAY);
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/** `YYYY-MM` for a date `n` months back, the format `monthIssued` expects. */
function monthsAgo(n: number): string {
    const d = new Date(SEED_TODAY);
    d.setUTCMonth(d.getUTCMonth() - n);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function seed(dataSource: DataSource): Promise<void> {
    assertLocalDatabase(dataSource);
    await truncateAll(dataSource);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    // --- Admin ------------------------------------------------------------------------------
    const admin = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({ username: 'admin', passwordHash, role: Role.ADMIN }));
    await dataSource.getRepository(Profile).save(
        dataSource.getRepository(Profile).create({
            user: admin,
            firstName: 'Admin',
            lastName: 'ITBridge',
            email: 'admin@itbridgeschool.com',
            phone: '+40700000000',
            address: 'Strada Valea Oltului 73, București',
        }),
    );

    // --- Locations and rooms ------------------------------------------------------------------
    const locations = await dataSource.getRepository(Location).save(LOCATIONS.map((location) => dataSource.getRepository(Location).create(location)));
    const locationBySlug = new Map(locations.map((location) => [location.slug, location]));

    const rooms = await dataSource.getRepository(Room).save(
        ROOMS.map(({ locationSlug, ...room }) =>
            dataSource.getRepository(Room).create({
                ...room,
                location: locationBySlug.get(locationSlug),
                hasProjector: true,
                hasWhiteboard: true,
            }),
        ),
    );
    const roomByKey = new Map(rooms.map((room) => [`${room.location.slug}/${room.name}`, room]));

    // --- Groups -----------------------------------------------------------------------------
    const groups = await dataSource.getRepository(Group).save(
        GROUP_SLOTS.map(({ room, ...slot }) => {
            const target = roomByKey.get(room);
            if (!target) throw new Error(`Seed timetable references a room that is not seeded: ${room}`);
            return dataSource.getRepository(Group).create({ ...slot, room: target, capacity: target.capacity, isActive: true });
        }),
    );

    // --- Parents, with and without accounts -------------------------------------------------
    const profiles: Profile[] = [];
    for (let i = 0; i < FIRST_NAMES.length; i++) {
        const firstName = FIRST_NAMES[i];
        const lastName = LAST_NAMES[i % LAST_NAMES.length];

        // Every third parent has no account yet: that is the flow `GET /users/without-profile`
        // and the later linking exist for, and it should be visible in the admin screens.
        const hasAccount = i % 3 !== 2;
        const user = hasAccount
            ? await dataSource.getRepository(User).save(
                  dataSource.getRepository(User).create({
                      username: `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
                      passwordHash,
                      role: Role.PARENT,
                  }),
              )
            : null;

        profiles.push(
            await dataSource.getRepository(Profile).save(
                dataSource.getRepository(Profile).create({
                    user,
                    firstName,
                    lastName,
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
                    phone: `+4072${String(1000000 + i).slice(-7)}`,
                    address: `Strada Exemplu ${i + 1}, București`,
                }),
            ),
        );
    }

    // A couple of accounts with no profile at all, so the linking screen has something to show.
    await dataSource
        .getRepository(User)
        .save(['parinte.nou', 'parinte.nelegat'].map((username) => dataSource.getRepository(User).create({ username, passwordHash, role: Role.PARENT })));

    // --- Children ---------------------------------------------------------------------------
    const children: Child[] = [];

    // How many this loop will create, worked out before it runs. The unassigned-children rule below
    // is expressed against this total rather than against a hard-coded 12: the constant happened to
    // equal the number of children the loop produced, so the "last two" were never reached and the
    // "copii fără grupă" screen was empty — the one thing that rule exists to prevent.
    const plannedChildren = profiles.reduce((total, _profile, index) => total + (index % 4 === 3 ? 2 : 1), 0);

    for (let i = 0; i < profiles.length; i++) {
        // Most parents have one child, every fourth has two — enough to exercise the sibling
        // pricing branches, including the three-children case that currently returns 0.
        const count = i % 4 === 3 ? 2 : 1;
        for (let c = 0; c < count; c++) {
            const index = children.length;
            const age = 8 + (index % 6);
            const birthDate = new Date(SEED_TODAY);
            birthDate.setUTCFullYear(birthDate.getUTCFullYear() - age);

            children.push(
                await dataSource.getRepository(Child).save(
                    dataSource.getRepository(Child).create({
                        parent: profiles[i],
                        firstName: CHILD_NAMES[index % CHILD_NAMES.length],
                        lastName: profiles[i].lastName,
                        birthDate,
                        // The last two are left unassigned, so the "children without a group"
                        // screen is not empty either.
                        group: index < plannedChildren - 2 ? groups[index % groups.length] : null,
                    }),
                ),
            );
        }
    }

    // One family with three children: the pricing bug from E03 has to be reproducible by hand.
    const bigFamily = profiles[0];
    for (const name of ['Ștefan', 'Irina']) {
        const birthDate = new Date(SEED_TODAY);
        birthDate.setUTCFullYear(birthDate.getUTCFullYear() - 9);
        children.push(
            await dataSource.getRepository(Child).save(
                dataSource.getRepository(Child).create({
                    parent: bigFamily,
                    firstName: name,
                    lastName: bigFamily.lastName,
                    birthDate,
                    group: groups[0],
                }),
            ),
        );
    }

    // --- Timetable ----------------------------------------------------------------------------
    // A class is a row now, and attendance points at it, so the timetable has to exist before any
    // mark can. The window straddles the seed date: eight weeks behind, so the attendance history
    // has classes to hang off, and `DEFAULT_HORIZON_WEEKS` ahead, so a freshly seeded database
    // looks like one where generation has just run.
    const classSessionRepo = dataSource.getRepository(ClassSession);

    // Local midnight of the seed day. TypeORM writes a `date` column from the value's *local*
    // components, so the UTC-midnight dates `daysAgo` produces land on the previous day in every
    // timezone west of Greenwich — see the note at the top of `class-session.dates.ts`.
    const seedToday = new Date(SEED_TODAY.getUTCFullYear(), SEED_TODAY.getUTCMonth(), SEED_TODAY.getUTCDate());
    const historyFrom = addDays(seedToday, -HISTORY_WEEKS * 7);
    const horizonUntil = addDays(seedToday, DEFAULT_HORIZON_WEEKS * 7);
    // Classes in the last week are past but deliberately left `scheduled` and unmarked, so the
    // unmarked-attendance report and the reminder it feeds have something to show. Without them
    // both are empty on a fresh seed, which reads as "all clear" rather than "no data".
    const markedUntil = addDays(seedToday, -7);

    const sessions = await classSessionRepo.save(
        groups.flatMap((group) =>
            occurrencesOf(group.weekday, historyFrom, horizonUntil).map((date) =>
                classSessionRepo.create({
                    group,
                    // Copied from the group, exactly as generation does it.
                    room: group.room,
                    date,
                    startTime: group.startTime,
                    endTime: group.endTime,
                    status: date.getTime() < markedUntil.getTime() ? ClassSessionStatus.HELD : ClassSessionStatus.SCHEDULED,
                    notes: null,
                }),
            ),
        ),
    );

    // One cancelled class, so the timetable shows the third status and the cancellation note.
    const toCancel = sessions.find((session) => session.date.getTime() > seedToday.getTime());
    if (toCancel) {
        toCancel.status = ClassSessionStatus.CANCELLED;
        toCancel.notes = 'Anulată: profesor bolnav';
        await classSessionRepo.save(toCancel);
    }

    // --- Attendance, on the classes that were held ---------------------------------------------
    const attendanceRepo = dataSource.getRepository(Attendance);
    const childrenByGroup = new Map<number, Child[]>();
    for (const child of children) {
        if (!child.group) continue;
        childrenByGroup.set(child.group.id, [...(childrenByGroup.get(child.group.id) ?? []), child]);
    }

    const records: Attendance[] = [];
    for (const session of sessions) {
        if (session.status !== ClassSessionStatus.HELD) continue;
        for (const child of childrenByGroup.get(session.group.id) ?? []) {
            records.push(
                attendanceRepo.create({
                    child,
                    classSession: session,
                    group: session.group,
                    type: AttendanceType.REGULAR,
                    // Roughly one absence in seven, deterministic rather than random.
                    present: (child.id + session.id) % 7 !== 0,
                }),
            );
        }
    }
    await attendanceRepo.save(records);

    // --- Invoices in every state, plus payments ---------------------------------------------
    const invoiceRepo = dataSource.getRepository(Invoice);
    const paymentRepo = dataSource.getRepository(Payment);

    for (let i = 0; i < profiles.length; i++) {
        const parent = profiles[i];
        const childCount = children.filter((c) => c.parent.id === parent.id).length;
        // Same rule the invoice service uses, not a second copy of it — the copy is what let the
        // seed and the service disagree, both wrongly, for as long as they did.
        const amount = monthlyAmountFor(childCount);

        // `@Unique(['parent', 'monthIssued'])` means one invoice per parent per month.
        for (let back = 0; back < 3; back++) {
            const monthIssued = monthsAgo(back);
            const dateIssued = daysAgo(back * 30 + 5);

            // Oldest months paid, the middle one mixed, the current one still pending.
            let status = InvoiceStatus.PENDING;
            if (back === 2) status = InvoiceStatus.PAID;
            else if (back === 1) status = i % 3 === 0 ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID;

            const invoice = await invoiceRepo.save(invoiceRepo.create({ parent, amount, dateIssued, monthIssued, status }));

            if (status === InvoiceStatus.PAID) {
                const payment = await paymentRepo.save(
                    paymentRepo.create({
                        invoice,
                        method: i % 2 === 0 ? 'card' : 'cash',
                        date: daysAgo(back * 30 + 1),
                    }),
                );
                invoice.payment = payment;
                await invoiceRepo.save(invoice);
            }
        }
    }

    // --- Discounts --------------------------------------------------------------------------
    const discountRepo = dataSource.getRepository(Discount);
    await discountRepo.save([
        discountRepo.create({
            parent: profiles[1],
            name: 'Recomandare',
            description: 'Reducere pentru recomandarea unui prieten',
            value: 50,
            monthIssued: monthsAgo(0),
        }),
        discountRepo.create({
            parent: profiles[3],
            name: 'Frate',
            description: 'Reducere pentru al doilea copil',
            value: 100,
            monthIssued: monthsAgo(0),
        }),
    ]);
}

/**
 * Renders and uploads a PDF for every seeded invoice, so the download button on the admin invoice
 * screen works on a freshly seeded database.
 *
 * The seed writes invoices straight through the repository rather than through `InvoiceService`,
 * so nothing ever produced their PDFs — all thirty rows answered the download endpoint with an
 * error. Best-effort on purpose: object storage is not required to seed, and a developer without
 * MinIO running should still get a usable database, just without the PDFs.
 */
export async function seedInvoicePdfs(dataSource: DataSource): Promise<{ uploaded: number; skipped: string | null }> {
    const s3 = new S3Service();
    try {
        s3.onModuleInit();
    } catch (error) {
        return { uploaded: 0, skipped: error instanceof Error ? error.message : String(error) };
    }
    if (!(await s3.isReachable())) {
        return { uploaded: 0, skipped: 'object storage not reachable' };
    }

    const pdfService = new PdfService(dataSource.getRepository(Discount));
    const invoices = await dataSource.getRepository(Invoice).find({ relations: ['parent'] });

    let uploaded = 0;
    for (const invoice of invoices) {
        const buffer = await pdfService.generateInvoicePdf(invoice);
        await s3.uploadFile(buffer, invoicePdfKey(invoice.monthIssued, invoice.id));
        uploaded++;
    }
    return { uploaded, skipped: null };
}

async function main(): Promise<void> {
    await AppDataSource.initialize();
    try {
        await seed(AppDataSource);
        const pdfs = await seedInvoicePdfs(AppDataSource);
        const counts = await Promise.all(
            AppDataSource.entityMetadatas.map(async (m) => {
                const rows = await AppDataSource.query<{ count: string }[]>(`SELECT count(*) FROM "${m.tableName}"`);
                return `${m.tableName}: ${rows[0].count}`;
            }),
        );
        console.log(`Seed complete (as of ${SEED_TODAY.toISOString().slice(0, 10)}).`);
        console.log(counts.join('\n'));
        console.log(pdfs.skipped ? `invoice PDFs: skipped (${pdfs.skipped})` : `invoice PDFs: ${pdfs.uploaded} uploaded`);
        console.log(`\nSign in as "admin" with the password "${PASSWORD}".`);
    } finally {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
}
