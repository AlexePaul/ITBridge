import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { checkSeedTarget, isLocalHost, LOCAL_PASSWORD } from './seed-target';
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
import { PaymentMethod } from '../enum/payment-method.enum';
import { PaymentStatus } from '../enum/payment-status.enum';
import { DiscountType } from '../enum/discount-type.enum';
import { DEFAULT_HORIZON_WEEKS } from '../modules/class-session/class-session.service';
import { addDays, occurrencesOf, toIsoDate } from '../modules/class-session/class-session.dates';
import { replacementWeekFor } from '../modules/attendance/replacement.rules';
import { monthlyAmountFor } from '../modules/invoice/pricing';
import { Lead } from '../entities/lead.entity';
import { LeadStatus } from '../enum/lead-status.enum';
import { LeadSource, LeadChannel } from '../enum/lead-source.enum';
import { Announcement } from '../entities/announcement.entity';
import { AnnouncementAudience } from '../enum/announcement-audience.enum';
import { MessageKind } from '../enum/message-kind.enum';
import { OutboxMessage } from '../entities/outbox-message.entity';
import { OutboxStatus } from '../enum/outbox-status.enum';
import { DeliveryFailureReason } from '../enum/delivery-failure-reason.enum';
import { AbsenceNotice } from '../entities/absence-notice.entity';
import { MailTemplate } from '../entities/mail-template.entity';

/**
 * Fills a database with data that looks like the real thing, so the screens are not empty — E04/S3.
 *
 * **Never production.** It wipes every table first. Two targets are supported and they are not the
 * same job: a developer's own Postgres, where the password is a constant in this file and nobody
 * else can reach it; and a staging database, where neither of those holds. What separates them is
 * `checkSeedTarget` in `seed-target.ts` — read that before pointing this anywhere new.
 */

/**
 * The day the seeded school is "at" — **today**, unless told otherwise.
 *
 * It used to be a fixed `2026-03-16`, which made the seed deterministic and the school dead. Every
 * date in here hangs off this one: the eight weeks of attendance behind it, the timetable horizon
 * ahead of it, which months have invoices. Six months after that constant was written, a freshly
 * seeded database opened on "Nicio oră azi", the newest invoice was half a year old, and the
 * arrears reminders had nothing left to remind anybody about — a developer's first impression of
 * the app was of one nobody uses.
 *
 * `SEED_TODAY=2026-03-16` pins it again for anyone who wants two runs to produce the same rows.
 * The value is UTC 09:00 on the *local* calendar day, because the components are read back with
 * `getUTC*` below and a plain local midnight would shift the day west of Greenwich.
 */
const SEED_TODAY = ((): Date => {
    const pinned = process.env.SEED_TODAY;
    if (pinned) {
        const parsed = new Date(`${pinned}T09:00:00.000Z`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
        throw new Error(`SEED_TODAY is not a YYYY-MM-DD date: ${pinned}`);
    }
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0));
})();

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
    // Friday and Saturday exist so that "today" has a class on six days out of seven. The seed used
    // to stop at Thursday, so a developer who seeded on a Friday, a Saturday or a Sunday opened the
    // admin dashboard on "Nicio oră azi" — the register screen, the unmarked-attendance report and
    // the 10:00 reminder all had nothing to show, and the app read as one nobody uses. Sunday stays
    // empty, because a school that teaches seven days a week would be the unrealistic version.
    { name: 'Web Avansați', weekday: Weekday.FRIDAY, startTime: '17:00:00', endTime: '18:30:00', minAge: 10, maxAge: 14, room: 'drumul-taberei/Sala 1' },
    { name: 'Robotică', weekday: Weekday.SATURDAY, startTime: '10:00:00', endTime: '11:30:00', minAge: 8, maxAge: 12, room: 'straulesti/Sala 1' },
];

/**
 * Whether this database may be wiped, and which password the seeded accounts get.
 *
 * The rule itself is in `seed-target.ts`, away from the thousand lines of fixture below, because it
 * is the one part of this file that has to be right about a database nobody is looking at.
 */
function resolveSeedTarget(dataSource: DataSource): string {
    const options = dataSource.options as { host?: string; database?: string };
    const verdict = checkSeedTarget({ host: options.host ?? '', database: options.database ?? '' });
    if (!verdict.ok) throw new Error(verdict.reason);
    return verdict.password;
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
    // Before the truncate, not after: the check is the thing standing between this command and a
    // database somebody cares about.
    const password = resolveSeedTarget(dataSource);
    await truncateAll(dataSource);

    const passwordHash = await bcrypt.hash(password, 10);

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

    // One family stopped between the two steps of registration — E11/S2, revised. `register` wrote
    // the shell, they never finished, so `isProfileComplete` says no and a child of theirs cannot be
    // placed in a group (`PARENT_PROFILE_INCOMPLETE`). Seeded because the state is invisible
    // otherwise: every other profile here is complete, and a developer would only meet this one by
    // registering by hand. Deliberately childless — they never got as far as bringing one.
    const halfRegistered = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
            username: 'diana.moldovan',
            passwordHash,
            role: Role.PARENT,
            emailConfirmedAt: daysAgo(2),
            approvalStatus: ApprovalStatus.APPROVED,
            approvalDecidedAt: daysAgo(1),
        }),
    );
    await dataSource.getRepository(Profile).save(
        dataSource.getRepository(Profile).create({
            user: halfRegistered,
            firstName: 'Diana',
            lastName: 'Moldovan',
            email: 'diana.moldovan@example.com',
            // No phone, no address, no emergency contact: exactly what `register` leaves behind.
        }),
    );

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
        // pricing branches, the three-or-more case included.
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

    // One family with three children, so the sibling rule is checkable by hand on a real invoice:
    // 350 for the first and 250 for each of the other two, which is 850 in a four-session month.
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

            // The derived rule, mirrored: a PAID invoice is one whose succeeded payments cover it.
            // The first family's paid months arrive in two instalments, so the screens have a
            // multi-payment invoice to show; everyone else pays in one.
            if (status === InvoiceStatus.PAID) {
                const method = i % 2 === 0 ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CASH;
                const halves = i === 0 ? [Math.round(amount * 50) / 100, amount - Math.round(amount * 50) / 100] : [amount];
                for (let part = 0; part < halves.length; part++) {
                    await paymentRepo.save(
                        paymentRepo.create({
                            invoice,
                            amount: halves[part],
                            method,
                            status: PaymentStatus.SUCCEEDED,
                            date: daysAgo(back * 30 + 1 - part),
                            externalReference: method === PaymentMethod.BANK_TRANSFER ? `OP ${1000 + i * 10 + back * 2 + part}` : null,
                        }),
                    );
                }
            }

            // One family carries a partial payment on the current month: 100 of the total, invoice
            // still pending. That is the state the whole E16/S1 rework exists to represent.
            if (status === InvoiceStatus.PENDING && back === 0 && i === 1 && amount > 100) {
                await paymentRepo.save(
                    paymentRepo.create({
                        invoice,
                        amount: 100,
                        method: PaymentMethod.CASH,
                        status: PaymentStatus.SUCCEEDED,
                        date: daysAgo(2),
                    }),
                );
            }
        }
    }

    // --- Discounts --------------------------------------------------------------------------
    const discountRepo = dataSource.getRepository(Discount);
    await discountRepo.save([
        // A whole referral, both halves of it — E20/S5. Seeded as a pair on purpose: giving only
        // one is the mistake the screen warns about, and a fresh database should show the shape of
        // the thing done right.
        discountRepo.create({
            parent: profiles[1],
            name: 'Recomandare',
            description: 'A recomandat familia care începe luna asta',
            type: DiscountType.PERCENT,
            value: 50,
            monthIssued: monthsAgo(0),
        }),
        discountRepo.create({
            parent: profiles[2],
            name: 'Recomandare',
            description: 'A venit prin recomandare — prima lună la jumătate',
            type: DiscountType.PERCENT,
            value: 50,
            monthIssued: monthsAgo(0),
        }),
        // And one fixed amount, so both kinds are on screen: a goodwill adjustment is still lei.
        discountRepo.create({
            parent: profiles[3],
            name: 'Ajustare',
            description: 'Reducere convenită la telefon',
            type: DiscountType.FIXED,
            value: 100,
            monthIssued: monthsAgo(0),
        }),
    ]);

    // --- Communication, and the funnel in front of it ------------------------------------------
    // Six tables the seed never touched, so six screens opened empty on a fresh database and read
    // as "nothing has ever happened here" rather than "no data yet". Each row below exists to put
    // one state on screen, including the states nobody wants: a message with nowhere to go, a
    // credit that ran out, a family that said no.
    await seedCommunication(dataSource, { admin, profiles, children, groups, locations, sessions });
}

interface CommunicationContext {
    admin: User;
    profiles: Profile[];
    children: Child[];
    groups: Group[];
    locations: Location[];
    sessions: ClassSession[];
}

async function seedCommunication(dataSource: DataSource, ctx: CommunicationContext): Promise<void> {
    const { admin, profiles, children, groups, locations, sessions } = ctx;
    const today = toIsoDate(new Date(SEED_TODAY.getUTCFullYear(), SEED_TODAY.getUTCMonth(), SEED_TODAY.getUTCDate()));
    const past = sessions.filter((session) => toIsoDate(session.date) < today).sort((a, b) => toIsoDate(b.date).localeCompare(toIsoDate(a.date)));
    const upcoming = sessions.filter((session) => toIsoDate(session.date) > today).sort((a, b) => toIsoDate(a.date).localeCompare(toIsoDate(b.date)));

    // --- Mail templates: two edited, so the editor has a draft to diff against the default -------
    await dataSource.getRepository(MailTemplate).save([
        {
            key: 'invoice-issued',
            subject: 'Factura pentru {{luna}} — IT Bridge School',
            bodyText: 'Bună, {{parinte}},\n\nFactura pentru {{luna}} este atașată. Suma: {{suma}} lei.\n\nMulțumim,\nIT Bridge School',
            bodyHtml: null,
            version: 2,
        },
        {
            key: 'class-cancelled',
            subject: 'Ora de {{grupa}} din {{data}} nu se ține',
            bodyText:
                'Bună, {{parinte}},\n\nOra de {{grupa}} programată pe {{data}} a fost anulată. Vă anunțăm de îndată ce se reprogramează.\n\nIT Bridge School',
            bodyHtml: null,
            version: 3,
        },
    ]);

    // --- Leads: one per status, because four of the six are never written by a screen ------------
    // E20/S1 — `trial_scheduled` comes from the booking form, `trial_held` from the register, and
    // `enrolled`/`lost` from resolving the trial. A seed that only wrote `new` would leave the
    // funnel report showing a single column and hide exactly the states it exists to count.
    const leadRepo = dataSource.getRepository(Lead);
    const birthDate = (yearsAgo: number): Date => {
        const d = new Date(SEED_TODAY);
        d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    await leadRepo.save([
        leadRepo.create({
            status: LeadStatus.NEW,
            source: LeadSource.PHONE,
            channel: LeadChannel.GOOGLE,
            parentName: 'Andreea Vasile',
            parentEmail: 'andreea.vasile@example.com',
            parentPhone: '+40721000101',
            childFirstName: 'Rareș',
            childLastName: 'Vasile',
            childBirthDate: birthDate(9),
            experience: 'A făcut Scratch la școală, vrea ceva mai serios.',
            location: locations[0],
            lastActivityAt: daysAgo(1),
            nextActionAt: new Date(),
        }),
        leadRepo.create({
            status: LeadStatus.CONTACTED,
            source: LeadSource.REFERRAL,
            channel: LeadChannel.FRIEND,
            parentName: 'Mihai Coman',
            parentPhone: '+40721000102',
            childFirstName: 'Ilinca',
            childLastName: 'Coman',
            childBirthDate: birthDate(11),
            notes: 'Sunat marți. Revine după ce vorbește cu soțul.',
            assignedTo: admin,
            location: locations[1],
            lastActivityAt: daysAgo(3),
            nextActionAt: new Date(),
        }),
        leadRepo.create({
            status: LeadStatus.TRIAL_SCHEDULED,
            source: LeadSource.TRIAL_FORM,
            channel: LeadChannel.INSTAGRAM,
            parentName: 'Elena Toma',
            parentEmail: 'elena.toma@example.com',
            childFirstName: 'Sofia',
            childLastName: 'Toma',
            childBirthDate: birthDate(8),
            group: groups[0],
            trialSession: upcoming[0] ?? null,
            location: locations[0],
            lastActivityAt: daysAgo(2),
            bookingKey: 'seed-trial-elena-toma',
        }),
        leadRepo.create({
            status: LeadStatus.TRIAL_HELD,
            source: LeadSource.TRIAL_FORM,
            channel: LeadChannel.PASSING_BY,
            parentName: 'Radu Neagu',
            parentEmail: 'radu.neagu@example.com',
            parentPhone: '+40721000104',
            childFirstName: 'Tudor',
            childLastName: 'Neagu',
            childBirthDate: birthDate(10),
            group: groups[2],
            trialSession: past[0] ?? null,
            trialHeldAt: daysAgo(4),
            location: locations[0],
            lastActivityAt: daysAgo(4),
            // The one the follow-up screen is built for: the trial happened and nobody has rung.
            nextActionAt: daysAgo(1),
        }),
        leadRepo.create({
            status: LeadStatus.ENROLLED,
            source: LeadSource.WALK_IN,
            parentName: profiles[1] ? `${profiles[1].firstName ?? ''} ${profiles[1].lastName ?? ''}`.trim() : 'Familie înscrisă',
            childFirstName: children[1]?.firstName ?? 'Maria',
            childLastName: children[1]?.lastName ?? 'Popescu',
            childBirthDate: birthDate(9),
            profile: profiles[1] ?? null,
            child: children[1] ?? null,
            group: groups[0],
            decidedAt: daysAgo(20),
            lastActivityAt: daysAgo(20),
        }),
        leadRepo.create({
            status: LeadStatus.LOST,
            source: LeadSource.OTHER,
            channel: LeadChannel.FLYER,
            parentName: 'Carmen Dobre',
            parentPhone: '+40721000106',
            childFirstName: 'Alex',
            childLastName: 'Dobre',
            childBirthDate: birthDate(13),
            lostReason: 'A ales o școală mai aproape de casă',
            decidedAt: daysAgo(12),
            lastActivityAt: daysAgo(12),
        }),
        // Demand the school could not serve. Counted apart from every conversion rate, because
        // somebody who never found an hour never entered one — E20/S2.
        leadRepo.create({
            status: LeadStatus.NEW,
            source: LeadSource.TRIAL_FORM,
            channel: LeadChannel.GOOGLE,
            parentName: 'Ioana Sandu',
            parentEmail: 'ioana.sandu@example.com',
            childFirstName: 'Matei',
            childLastName: 'Sandu',
            childBirthDate: birthDate(7),
            noSeats: true,
            notes: 'Nicio oră liberă la nivelul cerut.',
            lastActivityAt: daysAgo(5),
        }),
    ]);

    // --- Announcements, with the outbox rows they produced ---------------------------------------
    const announcementRepo = dataSource.getRepository(Announcement);
    const announcements = await announcementRepo.save([
        announcementRepo.create({
            audience: AnnouncementAudience.ALL,
            kind: MessageKind.TRANSACTIONAL,
            subject: 'Program special în săptămâna vacanței',
            bodyText: 'Dragi părinți,\n\nÎn săptămâna vacanței de primăvară cursurile nu se țin. Reluăm după, la orele obișnuite.\n\nIT Bridge School',
            sentBy: admin,
            recipientCount: profiles.length,
            declinedCount: 0,
            dedupeKey: 'seed-announcement-vacanta',
        }),
        announcementRepo.create({
            audience: AnnouncementAudience.GROUP,
            group: groups[0],
            kind: MessageKind.MARKETING,
            subject: 'Atelier de robotică, sâmbătă',
            bodyText: 'Dragi părinți,\n\nSâmbătă ținem un atelier deschis de robotică. Locurile sunt limitate.\n\nIT Bridge School',
            sentBy: admin,
            // A marketing refusal leaves no outbox row, so it is counted on the announcement — a
            // number derived from the queue would always be zero (E17/S7).
            recipientCount: 3,
            declinedCount: 2,
            dedupeKey: 'seed-announcement-robotica',
        }),
    ]);

    // --- The outbox, in all four states -----------------------------------------------------------
    // `/admin/livrari` is the screen that proves a parent was not silently skipped, so a seed that
    // only wrote successes would show it doing its job and never doing the job it exists for.
    const outboxRepo = dataSource.getRepository(OutboxMessage);
    const withEmail = profiles.filter((profile) => profile.email);
    await outboxRepo.save([
        outboxRepo.create({
            to: withEmail[0]?.email ?? 'parinte@example.com',
            subject: 'Factura pentru luna aceasta',
            bodyText: 'Factura este atașată.',
            status: OutboxStatus.SENT,
            attempts: 1,
            sentAt: daysAgo(2),
            dedupeKey: 'seed-outbox-invoice-1',
        }),
        outboxRepo.create({
            to: withEmail[1]?.email ?? 'parinte2@example.com',
            subject: 'Ora de sâmbătă a fost anulată',
            bodyText: 'Ora nu se ține. Vă anunțăm când se reprogramează.',
            status: OutboxStatus.SENT,
            attempts: 2,
            sentAt: daysAgo(1),
            announcement: announcements[0],
            dedupeKey: 'seed-outbox-announcement-1',
        }),
        outboxRepo.create({
            to: withEmail[2]?.email ?? 'parinte3@example.com',
            subject: 'Proiectul copilului',
            bodyText: 'Găsiți atașat proiectul de săptămâna aceasta.',
            status: OutboxStatus.PENDING,
            attempts: 0,
            dedupeKey: 'seed-outbox-project-1',
        }),
        outboxRepo.create({
            to: withEmail[3]?.email ?? 'parinte4@example.com',
            subject: 'Memento: factura restantă',
            bodyText: 'Factura pentru luna trecută este încă neachitată.',
            status: OutboxStatus.FAILED,
            attempts: 3,
            lastError: 'Provider responded 421: try again later',
            nextAttemptAt: daysAgo(-1),
            dedupeKey: 'seed-outbox-arrears-1',
        }),
        // The row the state exists for: nobody to send to. The address stays empty — inventing one
        // would be indistinguishable from a real address that bounced (E17/S5).
        outboxRepo.create({
            to: '',
            subject: 'Proiectul copilului',
            bodyText: 'Găsiți atașat proiectul de săptămâna aceasta.',
            status: OutboxStatus.UNDELIVERABLE,
            undeliverableReason: DeliveryFailureReason.NO_ADDRESS,
            attempts: 0,
            dedupeKey: 'seed-outbox-undeliverable-1',
        }),
    ]);

    // --- Announced absences, and where the office moved those children ----------------------------
    // Three readings the screens have to render (E12/S3 and S4): announced in time and placed into
    // another group for that week; announced in time and not yet placed, which is the office's own
    // worklist; and announced too late, which is frozen on the row and earns no move at all.
    const noticeRepo = dataSource.getRepository(AbsenceNotice);
    const childWithGroup = children.filter((child) => child.group);

    if (past.length >= 3 && childWithGroup.length >= 2) {
        const [firstChild, secondChild] = childWithGroup;
        const sessionsOfFirst = past.filter((session) => session.group?.id === firstChild.group?.id);
        const sessionsOfSecond = past.filter((session) => session.group?.id === secondChild.group?.id);

        if (sessionsOfFirst.length >= 2 && sessionsOfSecond.length >= 1) {
            // A class in another group during the same week as the missed one — what a placement
            // actually points at. `undefined` when the seeded timetable has none, and then the row
            // is simply the unplaced case, which is a real state rather than a broken fixture.
            const missed = sessionsOfFirst[0];
            const week = replacementWeekFor(missed.date);
            const host = past
                .concat(upcoming)
                .find((session) => session.group?.id !== firstChild.group?.id && toIsoDate(session.date) >= week.from && toIsoDate(session.date) <= week.to);

            await noticeRepo.save([
                noticeRepo.create({
                    child: firstChild,
                    classSession: missed,
                    reason: 'Este răcit, îl ținem acasă.',
                    inTime: true,
                    replacementSession: host ?? null,
                    announcedBy: firstChild.parent?.user ?? null,
                }),
                noticeRepo.create({
                    child: firstChild,
                    classSession: sessionsOfFirst[1],
                    // In time, and nobody has placed it yet: the row the office's Monday list is for.
                    reason: 'Are o programare la medic.',
                    inTime: true,
                    replacementSession: null,
                    announcedBy: firstChild.parent?.user ?? null,
                }),
                noticeRepo.create({
                    child: secondChild,
                    classSession: sessionsOfSecond[0],
                    // Announced after Monday noon of its own week: eligibility is frozen at write
                    // time, so this one is not moved anywhere and the screen has to show why.
                    reason: 'Am uitat să anunț, ne pare rău.',
                    inTime: false,
                    replacementSession: null,
                    announcedBy: secondChild.parent?.user ?? null,
                }),
            ]);
        }
    }
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
        // Printed only for a local database. On staging the value came from `SEED_PASSWORD`, and
        // echoing it would copy it into whatever captured this run's output — a CI log, a terminal
        // recording, somebody's scrollback. The person who set the variable already knows it.
        const local = isLocalHost((AppDataSource.options as { host?: string }).host ?? '');
        console.log(local ? `\nSign in as "admin" with the password "${LOCAL_PASSWORD}".` : `\nSign in as "admin" with the password from SEED_PASSWORD.`);
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
