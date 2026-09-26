import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registerUser, truncateAll } from './helpers';
import { adminAccountProblems, createOrResetAdmin } from 'src/modules/user/admin-account';

/**
 * `pnpm admin:create` — the first admin of a production that has no seed, and the way back in for
 * an admin who forgot the password (an admin has no profile, so no reset link). Against a real
 * database, because what matters is that the account can sign in afterwards and nothing else moved.
 */
describe('Admin accounts from the command line (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    const PASSWORD = 'o-parola-destul-de-lunga';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    const login = (username: string, password: string) => request(app.getHttpServer()).post('/auth/login').send({ username, password });

    it('creates an admin who can sign in and reach the admin screens, with a trail and nothing else', async () => {
        const family = await registerUser(app, 'ana');

        const result = await createOrResetAdmin(dataSource, { username: ' secretariat ', password: PASSWORD, reset: false });

        expect(result.created).toBe(true);
        const signedIn = await login('secretariat', PASSWORD).expect(200);
        await request(app.getHttpServer())
            .get('/profiles')
            .set('Authorization', `Bearer ${signedIn.body.accessToken as string}`)
            .expect(200);
        const trail = await dataSource.query<{ note: string }[]>(`SELECT note FROM audit_log WHERE entity_type = 'User' AND entity_id = $1`, [result.userId]);
        expect(trail).toEqual([{ note: 'cont de admin creat din linia de comandă (admin:create)' }]);
        // The family that was there is still there: this writes one row and deletes nothing.
        expect(await dataSource.query('SELECT id FROM users WHERE id = $1', [family.userId])).toHaveLength(1);
    });

    it('refuses a name already taken, rather than overwriting it', async () => {
        await registerUser(app, 'ana');

        await expect(createOrResetAdmin(dataSource, { username: 'ana', password: PASSWORD, reset: false })).rejects.toThrow('already exists');
    });

    /** An admin has no profile, so `forgot-password` has nowhere to send a link; this is the door. */
    it("resets an admin's password and closes every session of the account", async () => {
        await createOrResetAdmin(dataSource, { username: 'secretariat', password: PASSWORD, reset: false });
        const before = await login('secretariat', PASSWORD).expect(200);

        await createOrResetAdmin(dataSource, { username: 'secretariat', password: 'alta-parola-lunga', reset: true });

        await login('secretariat', PASSWORD).expect(401);
        await login('secretariat', 'alta-parola-lunga').expect(200);
        await request(app.getHttpServer())
            .post('/auth/refresh')
            .send({ refreshToken: before.body.refreshToken as string })
            .expect(401);
    });

    it("refuses to reset a parent's password from a terminal", async () => {
        await registerUser(app, 'ana');

        await expect(createOrResetAdmin(dataSource, { username: 'ana', password: PASSWORD, reset: true })).rejects.toThrow('not an admin account');
        await login('ana', 'parola123').expect(200);
    });

    it('asks for a longer password than a parent, and the same one twice', () => {
        expect(adminAccountProblems({ username: 'secretariat', password: 'scurta' })).toEqual([expect.stringContaining('at least 12')]);
        expect(adminAccountProblems({ username: 'secretariat', password: PASSWORD, confirmation: 'alta' })).toEqual(['The two passwords differ.']);
        expect(adminAccountProblems({ username: 'cu spatiu', password: PASSWORD })).toEqual(['The username cannot contain spaces.']);
    });
});
