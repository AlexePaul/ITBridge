import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, enrolChild, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Terms §14 over HTTP and against Postgres: „Putem suspenda un cont folosit contrar regulilor de mai
 * sus, cu un email care spune de ce, și îl reactivăm când motivul dispare. […] Suspendarea contului
 * nu afectează contractul de înscriere al copilului."
 *
 * Every clause of that paragraph is one assertion below: the portal closes (sessions and sign-in),
 * the email says why, reactivation reopens it, and the child's enrolment does not move.
 */
describe('Account suspension (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;

    const REASON = 'Contul a fost folosit de persoane din afara familiei.';

    const server = () => app.getHttpServer();
    const login = (username: string, password = 'parola123') => request(server()).post('/auth/login').send({ username, password });
    const refresh = (refreshToken: string) => request(server()).post('/auth/refresh').send({ refreshToken });
    const suspend = (userId: number, body: Record<string, unknown> = { reason: REASON }, as: TestUser = admin) =>
        request(server()).post(`/users/${userId}/suspend`).set('Authorization', as.auth).send(body);
    const reactivate = (userId: number, as: TestUser = admin) => request(server()).post(`/users/${userId}/reactivate`).set('Authorization', as.auth);
    const mails = () => dataSource.query<{ to: string; subject: string; bodyText: string }[]>('SELECT "to", subject, "bodyText" FROM outbox ORDER BY id');

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'secretariat'));
        parent = await registerUser(app, 'ana');
        // Registration queues its own mails; each test reads only what the suspension wrote.
        await dataSource.query('DELETE FROM outbox');
    });

    afterAll(async () => {
        await app.close();
    });

    describe('suspending', () => {
        it('closes every session the family has open, on every device', async () => {
            const second = (await login('ana').expect(200)).body as { refreshToken: string };

            await suspend(parent.userId).expect(200, { message: 'Cont suspendat' });

            await refresh(parent.refreshToken).expect(401);
            await refresh(second.refreshToken).expect(401);
            const live = await dataSource.query<{ n: number }[]>('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND "revokedAt" IS NULL', [
                parent.userId,
            ]);
            expect(live[0].n).toBe(0);
        });

        it('refuses the sign-in with its own code once the password is right, and as a wrong password otherwise', async () => {
            await suspend(parent.userId).expect(200);

            const refused = await login('ana').expect(403);
            expect(refused.body.code).toBe('ACCOUNT_SUSPENDED');
            expect(refused.body.accessToken).toBeUndefined();

            // Nothing about the account for somebody who does not hold its password.
            const wrong = await login('ana', 'nu-e-parola').expect(401);
            expect(wrong.body.code).not.toBe('ACCOUNT_SUSPENDED');
        });

        it('mails the family the reason, and says the enrolment does not change', async () => {
            await suspend(parent.userId).expect(200);

            const sent = await mails();
            expect(sent).toHaveLength(1);
            expect(sent[0].to).toBe('ana@example.com');
            expect(sent[0].subject).toBe('Contul tău IT Bridge School a fost suspendat');
            expect(sent[0].bodyText).toContain(REASON);
            expect(sent[0].bodyText).toContain('Înscrierea copilului nu se schimbă');
        });

        it('records who suspended by field name, never the reason', async () => {
            await suspend(parent.userId).expect(200);

            const trail = await dataSource.query<{ actor_user_id: number; changes: Record<string, unknown>; note: string }[]>(
                `SELECT actor_user_id, changes, note FROM audit_log WHERE entity_type = 'User' AND entity_id = $1 AND note LIKE 'cont suspendat%'`,
                [parent.userId],
            );
            expect(trail).toHaveLength(1);
            expect(trail[0].actor_user_id).toBe(admin.userId);
            expect(trail[0].changes).toEqual({ suspendedAt: { from: null, to: null }, suspensionReason: { from: null, to: null } });
            expect(JSON.stringify(trail[0])).not.toContain(REASON);
        });

        it('is one suspension and one email however many times it is pressed', async () => {
            await suspend(parent.userId).expect(200, { message: 'Cont suspendat' });
            await suspend(parent.userId, { reason: 'Alt motiv.' }).expect(200, { message: 'Contul era deja suspendat' });

            expect(await mails()).toHaveLength(1);
            const [row] = await dataSource.query<{ suspensionReason: string }[]>('SELECT "suspensionReason" FROM users WHERE id = $1', [parent.userId]);
            expect(row.suspensionReason).toBe(REASON);
        });

        it("leaves the child's enrolment exactly where it was — §14", async () => {
            const roomId = await createRoom(app, admin);
            const group = await request(server()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
            const profileId = await ownProfileId(app, parent);
            const child = await request(server())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Maria', lastName: 'Test', birthDate: '2016-05-01', parentId: profileId })
                .expect(201);
            await enrolChild(app, admin, child.body.id as number, group.body.id as number);

            await suspend(parent.userId).expect(200);

            const enrolments = await dataSource.query<{ status: string }[]>('SELECT status FROM enrollments WHERE child_id = $1', [child.body.id]);
            expect(enrolments.map((row) => row.status)).toEqual(['ACTIVE']);
            const [placed] = await dataSource.query<{ group_id: number }[]>('SELECT group_id FROM children WHERE id = $1', [child.body.id]);
            expect(placed.group_id).toBe(group.body.id);
        });
    });

    describe('reactivating', () => {
        it('lets the family sign in again, clears the reason and tells it', async () => {
            await suspend(parent.userId).expect(200);

            await reactivate(parent.userId).expect(200, { message: 'Suspendarea a fost ridicată' });

            await login('ana').expect(200);
            const [row] = await dataSource.query<{ suspendedAt: Date | null; suspensionReason: string | null }[]>(
                'SELECT "suspendedAt", "suspensionReason" FROM users WHERE id = $1',
                [parent.userId],
            );
            expect(row).toEqual({ suspendedAt: null, suspensionReason: null });
            const sent = await mails();
            expect(sent.map((mail) => mail.subject)).toEqual([
                'Contul tău IT Bridge School a fost suspendat',
                'Contul tău IT Bridge School nu mai e suspendat',
            ]);
        });

        it('says so, and mails nobody, when there was no suspension', async () => {
            await reactivate(parent.userId).expect(200, { message: 'Contul nu era suspendat' });
            expect(await mails()).toHaveLength(0);
        });
    });

    describe('what it refuses', () => {
        it("an admin account: an admin's access is its role", async () => {
            const res = await suspend(admin.userId).expect(400);
            expect(res.body.code).toBe('NOT_A_PARENT_ACCOUNT');
            await login('secretariat').expect(200);
        });

        it('a suspension without a reason — the family is owed one', async () => {
            await suspend(parent.userId, {}).expect(400);
            await suspend(parent.userId, { reason: '' }).expect(400);
            await suspend(parent.userId, { reason: '   ' }).expect(400);
            await login('ana').expect(200);
        });

        it('an account that does not exist', async () => {
            await suspend(999_999).expect(404);
        });

        it('a parent at the routes', async () => {
            const other = await registerUser(app, 'bogdan');
            await suspend(parent.userId, { reason: REASON }, other).expect(403);
            await reactivate(parent.userId, other).expect(403);
        });
    });

    describe('where the office finds it again', () => {
        it('lists the suspended accounts with the day and the reason', async () => {
            await suspend(parent.userId).expect(200);

            const res = await request(server()).get('/users/suspended').set('Authorization', admin.auth).expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ userId: parent.userId, username: 'ana', email: 'ana@example.com', suspensionReason: REASON });
            expect(typeof res.body[0].suspendedAt).toBe('string');
        });

        it("shows the suspension on the family's page for the office, and not in the family's own profile", async () => {
            const own = await request(server()).get('/profiles').set('Authorization', parent.auth).expect(200);
            expect(own.body[0].account).toBeUndefined();

            await suspend(parent.userId).expect(200);

            const profileId = await dataSource.query<{ id: number }[]>('SELECT id FROM profiles WHERE user_id = $1', [parent.userId]);
            const office = await request(server()).get('/profiles').query({ profileId: profileId[0].id }).set('Authorization', admin.auth).expect(200);
            expect(office.body[0].account).toMatchObject({ userId: parent.userId, suspensionReason: REASON });
            expect(typeof office.body[0].account.suspendedAt).toBe('string');
        });

        it("puts the suspension in the family's copy of its data", async () => {
            await suspend(parent.userId).expect(200);
            const [profile] = await dataSource.query<{ id: number }[]>('SELECT id FROM profiles WHERE user_id = $1', [parent.userId]);

            const res = await request(server()).get(`/privacy/export/${profile.id}`).set('Authorization', admin.auth).expect(200);

            expect(res.body.cont.motivSuspendare).toBe(REASON);
            expect(typeof res.body.cont.suspendatLa).toBe('string');
        });
    });
});
