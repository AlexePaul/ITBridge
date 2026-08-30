import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, registrationBody, TestUser, truncateAll } from './helpers';
import { EmailConfirmationService } from 'src/modules/auth/email-confirmation.service';
import { User } from 'src/entities/user.entity';

/**
 * The two gates of E11/S2, over HTTP and against Postgres.
 *
 * The unit tests already assert the shape of each step; what only this suite can show is the whole
 * of it working end to end — a real registration writing a real profile and a real token row, a
 * real link opening the first gate, a real admin opening the second, and a child that cannot be
 * enrolled until both are open.
 */
describe('Account gates (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    /** The token that went into the mail, read back from the row that holds only its hash. */
    const tokenFor = async (userId: number): Promise<string> => {
        // The plain token exists nowhere on the server, by design, so the suite cannot read it out
        // of the database. It re-issues one through the service instead, which is the same code
        // path registration used.
        const service = app.get(EmailConfirmationService);
        const user = await dataSource.getRepository(User).findOneOrFail({ where: { id: userId } });
        const { token } = await service.issueFor(user, 'x@example.com');
        return token;
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('registration', () => {
        it('refuses a registration with only a username and a password', async () => {
            // The shape that worked until E11/S2, and the reason invoices used to go nowhere.
            await request(app.getHttpServer()).post('/auth/register').send({ username: 'ana', password: 'parola123' }).expect(400);
        });

        it('refuses an empty string in a required field, not just a missing one', async () => {
            // An untyped HTML input posts `''`. Without `@IsNotEmpty()` this would be a 201 with a
            // blank address on file, which is the failure the epic set out to end.
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), address: '' })
                .expect(400);
        });

        it('refuses a phone number that is not Romanian', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), phone: '12345' })
                .expect(400);
        });

        it('writes the profile in the same request, so there is no setup screen left to skip', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });

            const profiles = await dataSource.query('SELECT * FROM profiles WHERE user_id = $1', [parent.userId]);
            expect(profiles).toHaveLength(1);
            expect(profiles[0]).toMatchObject({
                email: 'ana@example.com',
                address: 'Str. Exemplu 1, București',
                emergencyContactName: 'Contact Urgență',
            });
        });

        it('leaves both gates shut', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });

            const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', parent.auth).expect(200);
            expect(res.body).toMatchObject({ emailConfirmed: false, approvalStatus: 'PENDING', active: false });
        });

        it('lets a pending parent sign in, so the portal can say what is happening', async () => {
            await registerUser(app, 'ana', 'parola123', { active: false });

            // E11 left this open; the answer here is the honest one. A login that refused without
            // explaining would leave a waiting family unable to tell "not yet" from "broken".
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200);
        });

        it('queues the confirmation link and the office notice in the same transaction', async () => {
            await registerUser(app, 'ana', 'parola123', { active: false });

            const messages = await dataSource.query('SELECT * FROM outbox ORDER BY id');
            expect(messages).toHaveLength(2);
            expect(messages.map((m: { to: string }) => m.to)).toContain('ana@example.com');
        });

        it('refuses a second registration on the same email address, naming the field', async () => {
            await registerUser(app, 'ana', 'parola123', { active: false });

            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('altcineva'), email: 'ana@example.com' })
                .expect(409);

            expect(res.body.code).toBe('EMAIL_TAKEN');
        });

        it('writes nothing at all when the registration is refused', async () => {
            await registerUser(app, 'ana', 'parola123', { active: false });
            const before = await dataSource.query('SELECT count(*)::int AS n FROM outbox');

            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('altcineva'), email: 'ana@example.com' })
                .expect(409);

            const after = await dataSource.query('SELECT count(*)::int AS n FROM outbox');
            expect(after[0].n).toBe(before[0].n);
            const users = await dataSource.query(`SELECT count(*)::int AS n FROM users WHERE username = 'altcineva'`);
            expect(users[0].n).toBe(0);
        });
    });

    describe('confirming the address', () => {
        it('opens the first gate but not the second', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);

            const res = await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(200);

            expect(res.body).toMatchObject({ emailConfirmed: true, approvalStatus: 'PENDING', active: false });
        });

        it('works without any authentication', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);

            // The parent may open the link on a device that has never signed in.
            await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(200);
        });

        it('refuses the same link a second time', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);
            await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(200);

            const res = await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(400);
            expect(res.body.code).toBe('CONFIRMATION_TOKEN_USED');
        });

        it('refuses a token nobody issued', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/confirm-email')
                .send({ token: 'a'.repeat(43) })
                .expect(400);
            expect(res.body.code).toBe('CONFIRMATION_TOKEN_INVALID');
        });

        it('refuses an expired link', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);
            await dataSource.query(`UPDATE email_confirmations SET "expiresAt" = now() - interval '1 hour'`);

            const res = await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(400);
            expect(res.body.code).toBe('CONFIRMATION_TOKEN_EXPIRED');
        });

        it('stores only a hash, never the token', async () => {
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);

            const rows = await dataSource.query('SELECT * FROM email_confirmations');
            expect(JSON.stringify(rows)).not.toContain(token);
        });
    });

    describe('the approvals queue', () => {
        it('is admin-only', async () => {
            const parent = await registerUser(app, 'ana');

            await request(app.getHttpServer()).get('/users/pending').set('Authorization', parent.auth).expect(403);
        });

        it('is not swallowed by the /users/:id route', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));

            // Declaration order matters in Nest: `pending` placed after `:id` would be parsed as an
            // id and the endpoint would never be reachable.
            await request(app.getHttpServer()).get('/users/pending').set('Authorization', admin.auth).expect(200);
        });

        it('lists a waiting family with the state of its first gate', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            await registerUser(app, 'ana', 'parola123', { active: false });

            const res = await request(app.getHttpServer()).get('/users/pending').set('Authorization', admin.auth).expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ username: 'ana', emailConfirmed: false, firstName: 'ana', email: 'ana@example.com' });
        });

        it('drops a family off the queue once approved', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });

            await request(app.getHttpServer()).post(`/users/${parent.userId}/approve`).set('Authorization', admin.auth).expect(200);

            const res = await request(app.getHttpServer()).get('/users/pending').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(0);
        });

        it('mails the family when an admin approves', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            await dataSource.query('DELETE FROM outbox');

            await request(app.getHttpServer()).post(`/users/${parent.userId}/approve`).set('Authorization', admin.auth).expect(200);

            const messages = await dataSource.query('SELECT * FROM outbox');
            expect(messages).toHaveLength(1);
            expect(messages[0].to).toBe('ana@example.com');
        });

        it('records a rejection without sending the reason to the parent', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            await dataSource.query('DELETE FROM outbox');

            await request(app.getHttpServer())
                .post(`/users/${parent.userId}/reject`)
                .set('Authorization', admin.auth)
                .send({ reason: 'cont de test' })
                .expect(200);

            const users = await dataSource.query('SELECT * FROM users WHERE id = $1', [parent.userId]);
            expect(users[0]).toMatchObject({ approvalStatus: 'REJECTED', rejectionReason: 'cont de test' });

            const messages = await dataSource.query('SELECT * FROM outbox');
            expect(messages[0].bodyText).not.toContain('cont de test');
        });

        it('accepts a rejection with no reason at all', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });

            // An empty string from an untouched form field, which `@EmptyToUndefined()` turns into
            // "not given" rather than into a length-check failure.
            await request(app.getHttpServer()).post(`/users/${parent.userId}/reject`).set('Authorization', admin.auth).send({ reason: '' }).expect(200);
        });
    });

    describe('enrolment', () => {
        /** A group with a room behind it, and a child belonging to `parent`. */
        const childAndGroup = async (admin: TestUser, parent: TestUser): Promise<{ childId: number; groupId: number }> => {
            const roomId = await createRoom(app, admin);
            const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);

            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ parentId: await ownProfileId(app, parent), firstName: 'Andrei', lastName: 'Test', birthDate: '2016-05-04' })
                .expect(201);

            return { childId: child.body.id as number, groupId: group.body.id as number };
        };

        it('refuses to put a child in a group while the family is still waiting', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const { childId, groupId } = await childAndGroup(admin, parent);

            const res = await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(409);

            expect(res.body.code).toBe('PARENT_ACCOUNT_NOT_ACTIVE');
        });

        it('refuses while only the email is confirmed', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);
            await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(200);
            const { childId, groupId } = await childAndGroup(admin, parent);

            // Confirming proves the address; it does not prove the school knows the family. D2.
            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(409);
        });

        it('refuses while only the admin has approved', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            await request(app.getHttpServer()).post(`/users/${parent.userId}/approve`).set('Authorization', admin.auth).expect(200);
            const { childId, groupId } = await childAndGroup(admin, parent);

            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(409);
        });

        it('allows it once both gates are open', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana', 'parola123', { active: false });
            const token = await tokenFor(parent.userId);
            await request(app.getHttpServer()).post('/auth/confirm-email').send({ token }).expect(200);
            await request(app.getHttpServer()).post(`/users/${parent.userId}/approve`).set('Authorization', admin.auth).expect(200);
            const { childId, groupId } = await childAndGroup(admin, parent);

            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);
        });

        it('stays an admin decision: a parent cannot put their own child in a group', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            const parent = await registerUser(app, 'ana');
            const { childId, groupId } = await childAndGroup(admin, parent);

            // D2, and the point of the whole epic: the school assigns the group, not the family.
            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', parent.auth).expect(403);
        });
    });
});
