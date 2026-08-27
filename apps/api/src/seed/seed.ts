import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { User } from '../entities/user.entity';
import { Profile } from '../entities/profile.entity';
import { Child } from '../entities/child.entity';
import { Group } from '../entities/group.entity';
import { Attendance } from '../entities/attendance.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Discount } from '../entities/discount.entity';
import { Role } from '../enum/role.enum';
import { Weekday } from '../enum/weekday.enum';
import { AttendanceType } from '../enum/attendance-type.enum';

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

const FIRST_NAMES = ['Ana', 'Bogdan', 'Cristina', 'David', 'Elena', 'Florin', 'Gabriela', 'Horia', 'Ioana', 'Lucian'];
const LAST_NAMES = ['Popescu', 'Ionescu', 'Dumitrescu', 'Georgescu', 'Stan', 'Marin', 'Radu', 'Barbu'];
const CHILD_NAMES = ['Maria', 'Andrei', 'Sofia', 'Matei', 'Ilinca', 'Luca', 'Daria', 'Vlad', 'Ruxandra', 'Tudor'];

/** Weekly timetable: three afternoon slots on four weekdays, split by age band. */
const GROUP_SLOTS: { weekday: Weekday; startTime: string; endTime: string; minAge: number; maxAge: number }[] = [
    { weekday: Weekday.MONDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 7, maxAge: 10 },
    { weekday: Weekday.MONDAY, startTime: '18:00:00', endTime: '19:30:00', minAge: 11, maxAge: 14 },
    { weekday: Weekday.TUESDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 7, maxAge: 10 },
    { weekday: Weekday.WEDNESDAY, startTime: '16:00:00', endTime: '17:30:00', minAge: 8, maxAge: 12 },
    { weekday: Weekday.WEDNESDAY, startTime: '18:00:00', endTime: '19:30:00', minAge: 13, maxAge: 16 },
    { weekday: Weekday.THURSDAY, startTime: '17:00:00', endTime: '18:30:00', minAge: 9, maxAge: 13 },
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

    // --- Groups -----------------------------------------------------------------------------
    const groups = await dataSource.getRepository(Group).save(GROUP_SLOTS.map((slot) => dataSource.getRepository(Group).create({ ...slot, isActive: true })));

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
                        group: index < 12 ? groups[index % groups.length] : null,
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

    // --- Attendance, two months back --------------------------------------------------------
    const attendanceRepo = dataSource.getRepository(Attendance);
    const records: Attendance[] = [];
    for (const child of children) {
        if (!child.group) continue;
        for (let week = 0; week < 8; week++) {
            const date = daysAgo(week * 7 + 1);
            // Roughly one absence in seven, deterministic rather than random.
            const present = (child.id + week) % 7 !== 0;
            records.push(
                attendanceRepo.create({
                    child,
                    group: child.group,
                    date,
                    startTime: child.group.startTime,
                    type: AttendanceType.REGULAR,
                    present,
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
        const amount = childCount === 1 ? 350 : childCount === 2 ? 500 : 0;

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

async function main(): Promise<void> {
    await AppDataSource.initialize();
    try {
        await seed(AppDataSource);
        const counts = await Promise.all(
            AppDataSource.entityMetadatas.map(async (m) => {
                const rows = await AppDataSource.query<{ count: string }[]>(`SELECT count(*) FROM "${m.tableName}"`);
                return `${m.tableName}: ${rows[0].count}`;
            }),
        );
        console.log(`Seed complete (as of ${SEED_TODAY.toISOString().slice(0, 10)}).`);
        console.log(counts.join('\n'));
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
