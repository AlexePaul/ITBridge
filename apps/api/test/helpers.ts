import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { S3Service } from 'src/modules/storage/s3.service';
import { PdfService } from 'src/modules/invoice/pdf.service';
import { Role } from 'src/enum/role.enum';

/**
 * Boots the real application, with guards, routing and Postgres — only S3 and PDF generation are
 * replaced, because they leave the process and have nothing to verify here.
 */
export async function createTestApp(options: { realStorage?: boolean; throttling?: boolean } = {}): Promise<{
    app: INestApplication<App>;
    dataSource: DataSource;
}> {
    // `app.listen(0)` opens a single server, on a free port, for the whole lifetime of the suite.
    // The alternative — handing `app.getHttpServer()` straight to supertest — makes supertest spin
    // up an ephemeral server on every call, which turned out to be a source of flaky failures.
    // `realStorage` keeps the actual S3 client and PDF generator, for the one suite that exercises
    // them against MinIO. Everywhere else they are stubbed: they leave the process, and no other
    // test is about them.
    const builder = Test.createTestingModule({ imports: [AppModule] });

    // Rate limiting is off by default. Suites register a handful of users in `beforeEach`, which
    // over a couple of dozen tests goes well past a limit meant for a human at a login form — the
    // throttler would be measuring the test suite, not the behaviour under test. The one suite that
    // is about throttling asks for it.
    process.env.RATE_LIMIT_ENABLED = options.throttling ? 'true' : 'false';
    if (!options.realStorage) {
        builder
            .overrideProvider(S3Service)
            .useValue({
                putObject: jest.fn(),
                // A Buffer, not `undefined`: the controller streams what this returns, so a bare
                // `jest.fn()` turns every stubbed download into a 500 that looks like a real one.
                downloadFile: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
                isReachable: jest.fn().mockResolvedValue(true),
                // E14's half of the client. The signed URL is a plausible-looking string rather than
                // a real signature: what the suites check is that one is only *issued* after the
                // ownership question has been answered, which is this application's business, not
                // the SDK's.
                presignedDownloadUrl: jest.fn().mockResolvedValue('https://storage.example/signed'),
                presignedUploadUrl: jest.fn().mockResolvedValue('https://storage.example/upload'),
                headObject: jest.fn().mockResolvedValue({ sizeBytes: 1024, contentType: 'video/mp4' }),
                downloadStream: jest.fn(),
                deleteObject: jest.fn(),
            })
            .overrideProvider(PdfService)
            .useValue({ generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) });
    }
    const moduleRef = await builder.compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    await app.listen(0);

    const dataSource = app.get(DataSource);
    // Remembered so `registerUser` can open the E11/S2 gates without every one of its several
    // hundred call sites having to be handed a DataSource it does not otherwise care about.
    lastDataSource = dataSource;
    return { app, dataSource };
}

/** Set by `createTestApp`; a suite runs in its own process, so there is only ever one. */
let lastDataSource: DataSource | null = null;

/** Wipes every table between suites. The schema itself comes from the migrations. */
export async function truncateAll(dataSource: DataSource): Promise<void> {
    const tables = dataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

export interface TestUser {
    userId: number;
    username: string;
    accessToken: string;
    refreshToken: string;
    auth: string;
}

/**
 * Distinct phone numbers across a whole suite run.
 *
 * `Profile.phone` is unique, so two registrations sharing a number is a 409 — which would look like
 * a bug in whatever the suite was actually testing. Counting is enough: the databases are truncated
 * between tests, and the counter only has to outlive one process.
 */
let phoneCounter = 0;

/**
 * What `POST /auth/register` accepts, derived from the username so it stays unique.
 *
 * Step one only. Sending the fields that moved to step two would now be a 400, not a harmless
 * extra: `forbidNonWhitelisted` rejects a field no DTO declares.
 */
export function registrationBody(username: string, password = 'parola123'): Record<string, unknown> {
    return {
        username,
        password,
        firstName: username,
        lastName: 'Test',
        email: `${username}@example.com`,
    };
}

/** Step two, derived the same way. The phone numbers stay unique across a suite. */
export function profileCompletionBody(): Record<string, unknown> {
    phoneCounter += 1;
    return {
        phone: `07${String(10_000_000 + phoneCounter).slice(-8)}`,
        address: 'Str. Exemplu 1, București',
        emergencyContactName: 'Contact Urgență',
        emergencyContactRelation: 'bunica',
        emergencyContactPhone: `07${String(90_000_000 + phoneCounter).slice(-8)}`,
    };
}

/**
 * Registers a parent through the API and returns their tokens.
 *
 * **Both E11/S2 gates are opened by default**, straight in the database, and **step two of
 * registration is completed** through the API. Almost every suite wants a usable family and is
 * testing something else entirely; leaving either shut would make dozens of unrelated tests fail on
 * a rule they are not about. Pass `{ active: false }` to get the account as a real registration
 * leaves it — which is what the account-gates suite does — or `{ completeProfile: false }` to stop
 * at the shell `register` writes.
 */
export async function registerUser(
    app: INestApplication<App>,
    username: string,
    password = 'parola123',
    options: { active?: boolean; completeProfile?: boolean } = {},
): Promise<TestUser> {
    const res = await request(app.getHttpServer()).post('/auth/register').send(registrationBody(username, password)).expect(201);

    const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    const userId = me.body.id as number;

    if (options.completeProfile !== false) {
        const auth = `Bearer ${res.body.accessToken}`;
        const mine = await request(app.getHttpServer()).get('/profiles').set('Authorization', auth).expect(200);
        const profileId = (mine.body as { id: number }[])[0].id;
        await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', auth).send(profileCompletionBody()).expect(200);
    }

    if (options.active !== false) {
        if (!lastDataSource) throw new Error('registerUser needs createTestApp to have run first');
        await activateAccount(lastDataSource, userId);
    }

    return {
        userId,
        username,
        accessToken: res.body.accessToken as string,
        refreshToken: res.body.refreshToken as string,
        auth: `Bearer ${res.body.accessToken}`,
    };
}

/**
 * The id of the profile a registration created for this user.
 *
 * Since E11/S2 there is no window in which a registered parent has no profile: `register` writes
 * both in one transaction. Suites that used to `POST /profiles` for a freshly registered parent now
 * get a 409 on the unique email, which reads as an authorization bug and is not one — they want
 * this instead.
 */
export async function ownProfileId(app: INestApplication<App>, user: TestUser): Promise<number> {
    const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', user.auth).expect(200);
    const profiles = res.body as { id: number }[];
    if (profiles.length !== 1) throw new Error(`Expected exactly one profile for ${user.username}, found ${profiles.length}`);
    return profiles[0].id;
}

/** Opens both gates on an account, the way the migration grandfathers in accounts that predate them. */
export async function activateAccount(dataSource: DataSource, userId: number): Promise<void> {
    await dataSource.query(`UPDATE users SET "emailConfirmedAt" = now(), "approvalStatus" = 'APPROVED', "approvalDecidedAt" = now() WHERE id = $1`, [userId]);
}

/**
 * Promotes a user to ADMIN directly in the database and re-issues their token through login —
 * exactly the flow described in CLAUDE.md, because `register` always creates a PARENT.
 */
export async function promoteToAdmin(app: INestApplication<App>, dataSource: DataSource, user: TestUser, password = 'parola123'): Promise<TestUser> {
    await dataSource.query('UPDATE users SET role = $1 WHERE id = $2', [Role.ADMIN, user.userId]);

    const res = await request(app.getHttpServer()).post('/auth/login').send({ username: user.username, password }).expect(200);

    return { ...user, accessToken: res.body.accessToken as string, auth: `Bearer ${res.body.accessToken}` };
}

/**
 * Creates a location with a single room and returns the room's id.
 *
 * Every group needs a room, so almost every suite needs one of these. The defaults describe one of
 * the school's real addresses; `overrides` is there for the suites that need two locations to tell
 * apart, or a room too small to hold the group they are about to try to put in it.
 */
export async function createRoom(
    app: INestApplication<App>,
    admin: TestUser,
    overrides: { slug?: string; name?: string; roomName?: string; capacity?: number } = {},
): Promise<number> {
    const slug = overrides.slug ?? 'drumul-taberei';
    const location = await request(app.getHttpServer())
        .post('/locations')
        .set('Authorization', admin.auth)
        .send({
            name: overrides.name ?? 'Drumul Taberei',
            slug,
            street: 'Strada Valea Oltului 73',
            city: 'București',
            latitude: 44.415847,
            longitude: 26.013556,
        })
        .expect(201);

    const room = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', admin.auth)
        .send({ name: overrides.roomName ?? 'Sala 1', locationId: location.body.id as number, capacity: overrides.capacity ?? 10 })
        .expect(201);

    return room.body.id as number;
}

/**
 * Inserts one class session for a group and returns its id.
 *
 * Straight into the database on purpose: attendance is now posted against a session id, but nothing
 * creates sessions over HTTP yet — they come from the generator that reads the group timetable, and
 * that is a separate piece of E12. Date, hours and room are taken from the group, which is exactly
 * what the generator will do. This helper is the seam until an endpoint exists to replace it.
 */
export async function createClassSession(
    dataSource: DataSource,
    groupId: number,
    overrides: { date?: string; status?: 'scheduled' | 'held' | 'cancelled' } = {},
): Promise<number> {
    const rows = await dataSource.query<{ id: number }[]>(
        `INSERT INTO "class_sessions" ("group_id", "date", "startTime", "endTime", "room_id", "status")
         SELECT g."id", $2, g."startTime", g."endTime", g."room_id", $3
         FROM "groups" g WHERE g."id" = $1
         RETURNING "id"`,
        [groupId, overrides.date ?? '2026-03-10', overrides.status ?? 'scheduled'],
    );

    if (rows.length === 0) {
        throw new Error(`No group with id ${groupId}, so there is nothing to hang a class session on`);
    }
    return rows[0].id;
}

/** A complete, valid group body. Spread the overrides in to change one field at a time. */
/**
 * Enrols a child in a group, which is what makes their family billable.
 *
 * Since E11/S4 an invoice counts children with an `ACTIVE` enrolment, not children on file — a
 * trial is free and a child in no group is not attending. Suites that issue invoices therefore have
 * to place their children first; before, a child existing was enough.
 */
export async function enrolChild(app: INestApplication<App>, admin: TestUser, childId: number, groupId: number): Promise<void> {
    await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
}

/**
 * A room, a group in it, and every one of `childIds` enrolled — the shortest path to a family an
 * invoice can be issued for.
 */
export async function enrolInNewGroup(
    app: INestApplication<App>,
    admin: TestUser,
    childIds: number[],
    overrides: Record<string, unknown> = {},
): Promise<number> {
    const roomId = await createRoom(app, admin, { slug: `billing-${Math.abs(childIds[0] ?? 0)}`, name: 'Facturare' });
    const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId, overrides)).expect(201);
    const groupId = group.body.id as number;
    for (const childId of childIds) {
        await enrolChild(app, admin, childId, groupId);
    }
    return groupId;
}

export function groupBody(roomId: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    // A deliberately wide age band. E11/S6 refuses an enrolment whose age falls outside it and asks
    // for confirmation, which is right — but almost no suite is about ages, and a narrow default
    // made a dozen unrelated tests fail on a rule they never mention. Suites that *are* about the
    // band pass their own `minAge` / `maxAge`.
    return { name: 'Scratch Începători', weekday: 1, startTime: '16:00', endTime: '17:30', roomId, capacity: 10, minAge: 5, maxAge: 18, ...overrides };
}
