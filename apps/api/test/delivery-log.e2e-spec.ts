import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, registrationBody, TestUser, truncateAll } from './helpers';
import { officeAddress } from 'src/modules/mail/office-address';

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

            // A missing "undeliverable: 0" reads as "not measured" rather than "none".
            expect(res.body).toEqual({ pending: expect.any(Number), sent: 0, failed: 0, undeliverable: 0 });
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

        /**
         * The row has no address by construction, so until the link it could not say whose it was —
         * „fără destinatar", to an office that most needs to know whom to phone.
         */
        it('names the family an address-less message was written to, and finds it by that name', async () => {
            const userId = await familyWithoutAddress('parinte.fara.nume');
            const [family] = await dataSource.query<{ id: number }[]>('SELECT id FROM profiles WHERE user_id = $1', [userId]);

            await request(app.getHttpServer()).post(`/users/${userId}/approve`).set('Authorization', admin.auth).expect(200);

            const [row] = (await list({ status: 'undeliverable' }).expect(200)).body as { id: number; profile: { id: number; firstName: string } | null }[];
            // `registrationBody` makes the first name the username.
            expect(row.profile).toEqual({ id: family.id, firstName: 'parinte.fara.nume', lastName: 'Test' });

            // Every message written to that family, the address-less one included.
            const byName = (await list({ to: 'fara.nume test' }).expect(200)).body as { id: number; profile: { id: number } | null }[];
            expect(byName.map((message) => message.id)).toContain(row.id);
            expect(byName.every((message) => message.profile?.id === family.id)).toBe(true);
        });

        it("leaves the office's own messages without a family", async () => {
            await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.birou')).expect(201);

            const rows = (await list().expect(200)).body as { to: string; profile: { id: number } | null }[];
            const toOffice = rows.filter((row) => row.to === officeAddress());
            const toFamily = rows.filter((row) => row.to === 'parinte.birou@example.com');
            // The registration writes the family its links and the office its notice about the
            // family — which is the school's copy, so it names no family and no erasure takes it.
            expect(toOffice.length).toBeGreaterThan(0);
            expect(toOffice.every((row) => row.profile === null)).toBe(true);
            expect(toFamily.length).toBeGreaterThan(0);
            expect(toFamily.every((row) => row.profile !== null)).toBe(true);
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
