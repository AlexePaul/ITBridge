import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, registrationBody, TestUser, truncateAll } from './helpers';

/**
 * The delivery record — E17/S5.
 *
 * The question this suite really asks is the one the story asks: **is a family with no address
 * skipped in silence?** Before S5 the answer was yes — the senders branched on `if (profile.email)`
 * and logged a warning down the other side. Here it has to be a row.
 */
describe('Delivery log (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.livrari'));
    });

    const list = (query: Record<string, string> = {}, user: TestUser = admin) =>
        request(app.getHttpServer()).get('/deliveries').query(query).set('Authorization', user.auth);

    /**
     * A family with no address on file — the case E17/S5 is about.
     *
     * Reached by emptying the column rather than by the admin-typed-profile route, because that
     * route produces a profile with no account attached, and the flow under test is the approval
     * of an account. `Profile.email` is nullable precisely so this state is legal.
     */
    const familyWithoutAddress = async (username: string): Promise<number> => {
        // `active: false` matters: the helper otherwise approves the account on the way out, and
        // `approve` would then take its idempotent early return without ever reaching the outbox.
        await registerUser(app, username, 'parola123', { active: false });
        const rows = await dataSource.query<{ id: number }[]>('SELECT id FROM users WHERE username = $1', [username]);
        const userId = rows[0].id;
        await dataSource.query('UPDATE "profiles" SET "email" = NULL WHERE "user_id" = $1', [userId]);
        return userId;
    };

    describe('the record itself', () => {
        it('lists what a registration queued, newest first, with the body', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.livrari')).expect(201);

            const res = await list().expect(200);

            expect(res.body.length).toBeGreaterThanOrEqual(2);
            expect(res.body[0]).toHaveProperty('bodyText');
            expect(res.body[0].status).toBe('pending');
        });

        it('counts every state, including the ones at zero', async () => {
            const res = await request(app.getHttpServer()).get('/deliveries/summary').set('Authorization', admin.auth).expect(200);

            // A missing "undeliverable: 0" reads as "not measured" rather than "none". `toEqual`
            // rather than `toMatchObject` on purpose: a state added to the queue and not to the
            // screen is exactly the drift worth failing on, which is how `digested` (E17/S6) got
            // here.
            expect(res.body).toEqual({ pending: expect.any(Number), sent: 0, failed: 0, undeliverable: 0, digested: 0 });
        });
    });

    describe('nobody is skipped in silence', () => {
        it('approving a family with no address writes an undeliverable row, not a log line', async () => {
            const userId = await familyWithoutAddress('parinte.fara.adresa');

            await request(app.getHttpServer()).post(`/users/${userId}/approve`).set('Authorization', admin.auth).expect(200);

            const res = await list({ status: 'undeliverable' }).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].undeliverableReason).toBe('no_address');
            // Empty rather than a placeholder: a fake address would look like a real one that bounced.
            expect(res.body[0].to).toBe('');
            // The body is kept, so an admin can see what the family did not get.
            expect(res.body[0].bodyText).toContain('IT Bridge School');
        });
    });

    describe('the filters', () => {
        beforeEach(async () => {
            await request(app.getHttpServer()).post('/auth/register').send(registrationBody('ana.filtru')).expect(201);
        });

        it('matches the recipient loosely — an admin remembers a name, not an address', async () => {
            const res = await list({ to: 'ana.filtru' }).expect(200);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body.every((row: { to: string }) => row.to.includes('ana.filtru'))).toBe(true);
        });

        it('narrows by state', async () => {
            expect((await list({ status: 'sent' }).expect(200)).body).toEqual([]);
            expect((await list({ status: 'pending' }).expect(200)).body.length).toBeGreaterThan(0);
        });

        it('includes the whole of the last day, not up to its midnight', async () => {
            const today = new Date();
            const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const res = await list({ from: day, until: day }).expect(200);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('refuses a malformed date rather than ignoring it', async () => {
            await list({ from: 'ieri' }).expect(400);
        });
    });

    describe('who may read it', () => {
        it('refuses a parent — every row carries another family’s address and message', async () => {
            const parent = await registerUser(app, 'parinte.curios');
            await list({}, parent).expect(403);
        });
    });
});
