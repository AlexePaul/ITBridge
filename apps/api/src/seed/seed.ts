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
import { NonTeachingPeriod } from '../entities/non-teaching-period.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Discount } from '../entities/discount.entity';
import { Role } from '../enum/role.enum';
import { ApprovalStatus } from '../enum/approval-status.enum';
import { Enrollment } from '../entities/enrollment.entity';
import { WaitlistEntry } from '../entities/waitlist-entry.entity';
import { EnrollmentStatus } from '../enum/enrollment-status.enum';
import { WaitlistStatus } from '../enum/waitlist-status.enum';
import { PdfService } from '../modules/invoice/pdf.service';
import sharp from 'sharp';
import { S3Service } from '../modules/storage/s3.service';
import { Project } from '../entities/project.entity';
import { ProjectVersion } from '../entities/project-version.entity';
import { ProjectFile } from '../entities/project-file.entity';
import { ProjectLink } from '../entities/project-link.entity';
import { ProjectStatus } from '../enum/project-status.enum';
import { ProjectSource } from '../enum/project-source.enum';
import { ThumbnailService } from '../modules/project/thumbnail.service';
import { hashContent, ingestionKey, projectFileKey, projectThumbnailKey } from '../modules/project/project.keys';
import { invoicePdfKey } from '../modules/invoice/invoice.service';
import { Weekday } from '../enum/weekday.enum';
import { AttendanceType } from '../enum/attendance-type.enum';
import { ClassSessionStatus } from '../enum/class-session-status.enum';
import { DEFAULT_HORIZON_WEEKS } from '../modules/class-session/class-session.service';
import { addDays, occurrencesOf, toIsoDate } from '../modules/class-session/class-session.dates';
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

/**
 * Which of the two E11/S2 gates are open for the i-th seeded parent.
 *
 * Two accounts are deliberately left waiting, and for different reasons, so that `/admin/approvals`
 * is not an empty screen on a fresh database and so that both rows an admin can meet are there: a
 * family who confirmed their address and needs a decision, and one who registered and never opened
 * the mail. Everybody else is grandfathered in, as the migration does for real accounts.
 */
function accountGatesFor(index: number): { emailConfirmedAt: Date | null; approvalStatus: ApprovalStatus; approvalDecidedAt: Date | null } {
    if (index === 1) {
        return { emailConfirmedAt: daysAgo(2), approvalStatus: ApprovalStatus.PENDING, approvalDecidedAt: null };
    }
    if (index === 4) {
        return { emailConfirmedAt: null, approvalStatus: ApprovalStatus.PENDING, approvalDecidedAt: null };
    }
    return { emailConfirmedAt: daysAgo(30), approvalStatus: ApprovalStatus.APPROVED, approvalDecidedAt: daysAgo(30) };
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
    // Both gates open, though `isAccountActive` exempts admins anyway. Written out so the row says
    // what is true rather than leaving the column defaults to imply an admin is awaiting approval.
    const admin = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
            username: 'admin',
            passwordHash,
            role: Role.ADMIN,
            emailConfirmedAt: daysAgo(90),
            approvalStatus: ApprovalStatus.APPROVED,
            approvalDecidedAt: daysAgo(90),
        }),
    );
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

        // The E11/S2 gates, spread across the accounts that do exist, so the approvals screen has
        // every case in it on a fresh seed rather than being empty until someone registers by hand:
        // one waiting with the address confirmed, one waiting without, and everybody else active.
        const gates = accountGatesFor(i);

        const user = hasAccount
            ? await dataSource.getRepository(User).save(
                  dataSource.getRepository(User).create({
                      username: `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
                      passwordHash,
                      role: Role.PARENT,
                      ...gates,
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
                    emergencyContactName: `${LAST_NAMES[(i + 1) % LAST_NAMES.length]} ${lastName}`,
                    emergencyContactRelation: i % 2 === 0 ? 'bunica' : 'unchi',
                    emergencyContactPhone: `+4073${String(1000000 + i).slice(-7)}`,
                }),
            ),
        );
    }

    // A couple of accounts with no profile at all, so the linking screen has something to show.
    // Active, deliberately: they are a fixture for `GET /users/without-profile`, not registrations
    // waiting on a decision, and leaving them pending would put two rows in the approvals queue
    // that no admin can act on usefully — the queue is meant to be a real to-do list.
    await dataSource.getRepository(User).save(
        ['parinte.nou', 'parinte.nelegat'].map((username) =>
            dataSource.getRepository(User).create({
                username,
                passwordHash,
                role: Role.PARENT,
                emailConfirmedAt: daysAgo(60),
                approvalStatus: ApprovalStatus.APPROVED,
                approvalDecidedAt: daysAgo(60),
            }),
        ),
    );

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
                        // The last three are left unassigned. One of them becomes the booked trial
                        // below and two go on the waiting list, which leaves the "copii fără grupă"
                        // screen populated and gives the queue an order to be in — a list of one
                        // demonstrates nothing about what happens when a seat frees.
                        group: index < plannedChildren - 3 ? groups[index % groups.length] : null,
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

    // --- Enrolments and the waiting list ------------------------------------------------------
    // `Child.group` is derived (E11/S1), so every child with a group needs the enrolment that
    // justifies it — otherwise the admin screens show a group the enrolment table denies. On top of
    // the plain ones, three cases the screens exist for: a real history, a booked trial, and a
    // group with more people wanting in than it has seats.
    const enrollmentRepo = dataSource.getRepository(Enrollment);

    for (const child of children) {
        if (!child.group) continue;
        await enrollmentRepo.save(
            enrollmentRepo.create({
                child,
                group: child.group,
                status: EnrollmentStatus.ACTIVE,
                startDate: toIsoDate(daysAgo(120)),
                endDate: null,
                exitReason: null,
                contractSignedAt: toIsoDate(daysAgo(121)),
            }),
        );
    }

    // One child who has been somewhere else before: this is the row that answers "in what group was
    // this child in October", which is the whole reason the table exists.
    const movedChild = children.find((child) => child.group && child.group.id !== groups[0].id);
    if (movedChild) {
        await enrollmentRepo.save(
            enrollmentRepo.create({
                child: movedChild,
                group: groups[0],
                status: EnrollmentStatus.TRANSFERRED,
                startDate: toIsoDate(daysAgo(300)),
                endDate: toIsoDate(daysAgo(121)),
                exitReason: 'Transfer la altă grupă, la cererea familiei',
                contractSignedAt: toIsoDate(daysAgo(301)),
            }),
        );
    }

    // A trial booked in the last group, so the occupancy figures on screen include one and somebody
    // has to notice that a trial takes a seat like anything else (D7).
    const trialChild = children.find((child) => !child.group);
    if (trialChild) {
        const trialGroup = groups[groups.length - 1];
        await enrollmentRepo.save(
            enrollmentRepo.create({
                child: trialChild,
                group: trialGroup,
                status: EnrollmentStatus.TRIAL,
                startDate: toIsoDate(daysAgo(-3)),
                endDate: null,
                exitReason: null,
                contractSignedAt: null,
            }),
        );
        await dataSource.getRepository(Child).update({ id: trialChild.id }, { group: trialGroup });
        trialChild.group = trialGroup;
    }

    // And a queue on the busiest group, so the waiting-list screen is not empty and the "offer the
    // freed seat" path has somebody to offer it to the first time anyone closes an enrolment.
    const waitlistRepo = dataSource.getRepository(WaitlistEntry);
    const queuedChildren = children.filter((child) => !child.group).slice(0, 2);
    for (const child of queuedChildren) {
        await waitlistRepo.save(
            waitlistRepo.create({
                child,
                group: groups[0],
                status: WaitlistStatus.WAITING,
                note: child === queuedChildren[0] ? 'Sună după ora 17' : null,
                offeredAt: null,
                respondBy: null,
            }),
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

    // --- School calendar ------------------------------------------------------------------------
    // Seeded before the timetable, because the timetable obeys it: `generateForGroup` skips these
    // days, so a seeded database that ignored them would not look like a generated one.
    //
    // The dates are illustrative, not the ministry's. The real calendar comes from the order
    // published each summer and is typed into `/admin/calendar`; what matters here is that the
    // screen opens with all three shapes on it — a fortnight, a single day, and one that applies to
    // only one address — and that a fresh database has a `skipped` count to show. 1 Mai is the one
    // real date: it is a fixed national holiday.
    const periodRepo = dataSource.getRepository(NonTeachingPeriod);
    const nonTeachingPeriods = await periodRepo.save([
        periodRepo.create({
            name: 'Vacanța de primăvară',
            startDate: toIsoDate(addDays(seedToday, 18)),
            endDate: toIsoDate(addDays(seedToday, 29)),
            location: null,
        }),
        periodRepo.create({ name: '1 Mai', startDate: '2026-05-01', endDate: '2026-05-01', location: null }),
        // In the past, so the list opens with a "Trecut" row as well as upcoming ones.
        periodRepo.create({
            name: 'Zile libere de iarnă',
            startDate: toIsoDate(addDays(seedToday, -40)),
            endDate: toIsoDate(addDays(seedToday, -38)),
            location: null,
        }),
        // One address only, so the screen shows the location badge and the generator's per-location
        // filtering has something to filter.
        periodRepo.create({
            name: 'Lucrări în sală',
            startDate: toIsoDate(addDays(seedToday, 10)),
            endDate: toIsoDate(addDays(seedToday, 10)),
            location: locations[1] ?? null,
        }),
    ]);

    /** The non-teaching days that apply to one location: the school-wide ones plus its own. */
    const closedDatesAt = (locationId: number): Set<string> => {
        const dates = new Set<string>();
        for (const period of nonTeachingPeriods) {
            if (period.location && period.location.id !== locationId) continue;
            let cursor = new Date(`${period.startDate}T00:00:00`);
            const last = new Date(`${period.endDate}T00:00:00`);
            while (cursor <= last) {
                dates.add(toIsoDate(cursor));
                cursor = addDays(cursor, 1);
            }
        }
        return dates;
    };

    const sessions = await classSessionRepo.save(
        groups.flatMap((group) => {
            const closed = closedDatesAt(group.room.location.id);
            return occurrencesOf(group.weekday, historyFrom, horizonUntil)
                .filter((date) => !closed.has(toIsoDate(date)))
                .map((date) =>
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
                );
        }),
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
        await s3.putObject({ key: invoicePdfKey(invoice.monthIssued, invoice.id), body: buffer, contentType: 'application/pdf' });
        uploaded++;
    }
    return { uploaded, skipped: null };
}

/**
 * A handful of projects, so the E14 screens are not empty on a fresh database.
 *
 * Three shapes, because they are the three an admin has to be able to tell apart: something waiting
 * for review, something already sent, and a project that is a link rather than a file — which is what
 * the youngest groups produce, where the work lives in Tinkercad or Canva.
 *
 * Best-effort about storage, like the invoice PDFs above: without MinIO the link projects still
 * appear and the file ones are skipped, so a developer with no bucket still gets usable screens.
 */
export async function seedProjects(dataSource: DataSource): Promise<{ projects: number; skipped: string | null }> {
    const children = await dataSource.getRepository(Child).find({ relations: ['group', 'parent'], order: { id: 'ASC' } });
    const withGroup = children.filter((child) => child.group).slice(0, 4);
    if (withGroup.length === 0) return { projects: 0, skipped: 'no children in groups' };

    const projectRepo = dataSource.getRepository(Project);
    const versionRepo = dataSource.getRepository(ProjectVersion);
    const fileRepo = dataSource.getRepository(ProjectFile);
    const linkRepo = dataSource.getRepository(ProjectLink);

    const s3 = new S3Service();
    let storage = true;
    try {
        s3.onModuleInit();
        storage = await s3.isReachable();
    } catch {
        storage = false;
    }

    let created = 0;

    // A link project for the youngest child in the list: no file, no bucket, still a real project.
    const linkProject = await projectRepo.save(
        projectRepo.create({
            child: withGroup[0],
            title: 'Orașul din Tinkercad',
            description: 'Prima machetă 3D, cu blocuri și un parc.',
            capturedOn: daysAgo(3),
            status: ProjectStatus.NEW,
            source: ProjectSource.ADMIN,
        }),
    );
    await linkRepo.save(linkRepo.create({ project: linkProject, label: 'Macheta în Tinkercad', url: 'https://www.tinkercad.com/things/exemplu' }));
    created++;

    if (storage) {
        // A 640x480 gradient stands in for a screenshot: real bytes, so the thumbnail pipeline and
        // the download both work on a seeded database instead of only in tests.
        const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 120, b: 220 } } })
            .png()
            .toBuffer();
        const thumbnails = new ThumbnailService();

        for (const [index, child] of withGroup.slice(1).entries()) {
            const sent = index === 0;
            const project = await projectRepo.save(
                projectRepo.create({
                    child,
                    title: sent ? 'Jocul cu labirint' : 'Robotul care evită obstacole',
                    capturedOn: daysAgo(sent ? 10 : 1),
                    status: sent ? ProjectStatus.SENT : ProjectStatus.NEW,
                    source: ProjectSource.AGENT,
                    ...(sent ? { sentAt: daysAgo(9), sentToEmail: child.parent?.email ?? null } : {}),
                }),
            );
            const version = await versionRepo.save(versionRepo.create({ project, versionNumber: 1 }));
            const file = await fileRepo.save(
                fileRepo.create({
                    version,
                    originalName: 'captura.png',
                    contentType: 'image/png',
                    sizeBytes: png.length,
                    ingestionKey: ingestionKey(child.id, hashContent(png)),
                    uploadedAt: new Date(),
                }),
            );
            await s3.putObject({ key: projectFileKey(project.id, version.id, file.id), body: png, contentType: 'image/png' });

            const thumbnail = await thumbnails.fromImage(png);
            if (thumbnail) {
                await s3.putObject({ key: projectThumbnailKey(project.id), body: thumbnail, contentType: 'image/jpeg' });
                await projectRepo.update(project.id, { hasThumbnail: true });
            }
            created++;
        }
    }

    return { projects: created, skipped: storage ? null : 'object storage not reachable' };
}

async function main(): Promise<void> {
    await AppDataSource.initialize();
    try {
        await seed(AppDataSource);
        const pdfs = await seedInvoicePdfs(AppDataSource);
        const projects = await seedProjects(AppDataSource);
        const counts = await Promise.all(
            AppDataSource.entityMetadatas.map(async (m) => {
                const rows = await AppDataSource.query<{ count: string }[]>(`SELECT count(*) FROM "${m.tableName}"`);
                return `${m.tableName}: ${rows[0].count}`;
            }),
        );
        console.log(`Seed complete (as of ${SEED_TODAY.toISOString().slice(0, 10)}).`);
        console.log(counts.join('\n'));
        console.log(pdfs.skipped ? `invoice PDFs: skipped (${pdfs.skipped})` : `invoice PDFs: ${pdfs.uploaded} uploaded`);
        console.log(
            projects.skipped ? `projects: ${projects.projects} created, files skipped (${projects.skipped})` : `projects: ${projects.projects} created`,
        );
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
