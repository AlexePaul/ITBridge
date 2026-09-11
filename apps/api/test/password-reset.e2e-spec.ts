import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll } from './helpers';
import { PasswordResetService } from 'src/modules/auth/password-reset.service';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { PasswordReset } from 'src/entities/password-reset.entity';

/**
 * Getting back into an account, over HTTP and against Postgres.
 *
 * The unit tests assert the shape of each step. What only this suite can show is that the whole of
 * it works: a real request writing a real row and a real queued message, the token out of that
 * message opening the account, the old password no longer doing so and the new one doing so — and
 * that the sessions the parent had before are gone.
 */
describe('Password reset (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    /**
     * The token that went into the mail.
     *
     * It exists nowhere on the server — the row holds a SHA-256 — so the suite reads it back out of
     * the queued message, which is exactly where the parent reads it: their inbox.
     */
    const tokenFromMail = async (): Promise<string> => {
        const messages = await dataSource.getRepository(OutboxMessage).find({ order: { id: 'DESC' }, take: 1 });
        const match = /token=([^\s&"<]+)/.exec(messages[0]?.bodyText ?? '');
        if (!match) throw new Error('No reset link in the queued message');
        return decodeURIComponent(match[1]);
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

    describe('POST /auth/forgot-password', () => {
        it('queues a link to the address on file', async () => {
            await registerUser(app, 'ana');

            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);

            const rows = await dataSource.getRepository(PasswordReset).find();
            expect(rows).toHaveLength(1);
            expect(rows[0].email).toBe('ana@example.com');
            expect(rows[0].consumedAt).toBeNull();
            await expect(tokenFromMail()).resolves.toBeTruthy();
        });

        it('stores only a hash of the token', async () => {
            await registerUser(app, 'ana');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);

            const token = await tokenFromMail();
            const [row] = await dataSource.getRepository(PasswordReset).find();

            expect(row.tokenHash).toBe(PasswordResetService.hash(token));
            expect(row.tokenHash).not.toBe(token);
            // The whole point of hashing: the table on its own opens nothing.
            const raw = await dataSource.query('SELECT * FROM password_resets');
            expect(JSON.stringify(raw)).not.toContain(token);
        });

        it('answers an address nobody has exactly as it answers one that exists', async () => {
            await registerUser(app, 'ana');

            const known = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const unknown = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'nimeni@example.com' }).expect(200);

            // Identical bodies, identical status: the form cannot be used to ask whether a given
            // family is at this school. The unknown address left nothing behind — the one row is
            // the known address's, written by the call above it.
            expect(unknown.body).toEqual(known.body);
            expect(await dataSource.getRepository(PasswordReset).count()).toBe(1);
        });

        it('writes nothing for a profile an admin typed in, which has no account behind it', async () => {
            const admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
            await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Popescu', email: 'ana.fara.cont@example.com' })
                .expect(201);

            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana.fara.cont@example.com' }).expect(200);

            expect(await dataSource.getRepository(PasswordReset).count()).toBe(0);
        });

        it('kills the previous link when a second one is asked for', async () => {
            await registerUser(app, 'ana');

            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const first = await tokenFromMail();
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const second = await tokenFromMail();

            expect(second).not.toBe(first);
            await request(app.getHttpServer()).post('/auth/reset-password').send({ token: first, password: 'parola-noua' }).expect(400);
            await request(app.getHttpServer()).post('/auth/reset-password').send({ token: second, password: 'parola-noua' }).expect(200);
        });
    });

    it('lets go of its rows when the account does, which is what the erasure relies on', async () => {
        const parent = await registerUser(app, 'ana');
        await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
        expect(await dataSource.getRepository(PasswordReset).count()).toBe(1);

        // `ErasureService` deletes the `users` row and lets the cascades do the rest, exactly as it
        // does for `sessions` and `email_confirmations`. If this FK ever stopped cascading, the
        // erasure would leave a hash and an address behind and report success.
        await dataSource.query('DELETE FROM users WHERE id = $1', [parent.userId]);

        expect(await dataSource.getRepository(PasswordReset).count()).toBe(0);
    });

    describe('POST /auth/reset-password', () => {
        it('changes the password: the old one stops working, the new one starts', async () => {
            await registerUser(app, 'ana', 'parola-veche');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const token = await tokenFromMail();

            await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'parola-noua' }).expect(200);

            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola-veche' }).expect(401);
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola-noua' }).expect(200);
        });

        it('revokes the sessions the parent already had', async () => {
            const parent = await registerUser(app, 'ana', 'parola-veche');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const token = await tokenFromMail();

            await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'parola-noua' }).expect(200);

            // The refresh token is the durable half of a login, and it is gone. The access token
            // survives up to fifteen minutes by documented design — `AuthGuard` never reads
            // `sessions` — so this is the half that can be asserted.
            await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
        });

        it('refuses the same link twice', async () => {
            await registerUser(app, 'ana');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const token = await tokenFromMail();

            await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'parola-noua' }).expect(200);
            const second = await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'alta-parola' }).expect(400);

            expect(second.body.code).toBe('RESET_TOKEN_INVALID');
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'alta-parola' }).expect(401);
        });

        it('refuses a link issued to an address the account no longer has', async () => {
            const parent = await registerUser(app, 'ana');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const token = await tokenFromMail();

            // The typo case: the address is corrected, so the inbox the link reached may be a
            // stranger's. `CONFIRMATION_TOKEN_SUPERSEDED` reasoning, with the account at stake.
            const profileId = await dataSource
                .getRepository('profiles')
                .findOneOrFail({ where: { user: { id: parent.userId } } })
                .then((p: { id: number }) => p.id);
            await request(app.getHttpServer())
                .put(`/profiles/${profileId}`)
                .set('Authorization', parent.auth)
                .send({ email: 'ana.popescu@example.com' })
                .expect(200);

            const res = await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'parola-noua' }).expect(400);
            expect(res.body.code).toBe('RESET_TOKEN_INVALID');
        });

        it('gives an unknown token the same refusal as a used one', async () => {
            const res = await request(app.getHttpServer()).post('/auth/reset-password').send({ token: 'nu-exista', password: 'parola-noua' }).expect(400);
            expect(res.body.code).toBe('RESET_TOKEN_INVALID');
        });

        it('refuses a password shorter than registration accepts', async () => {
            await registerUser(app, 'ana');
            await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ana@example.com' }).expect(200);
            const token = await tokenFromMail();

            await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'abc' }).expect(400);
            // And the link is still good, because a rejected body must not burn it.
            await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'parola-noua' }).expect(200);
        });
    });

    describe('POST /auth/change-password', () => {
        it('changes the password when the current one is right', async () => {
            const parent = await registerUser(app, 'ana', 'parola-veche');

            await request(app.getHttpServer())
                .post('/auth/change-password')
                .set('Authorization', parent.auth)
                .send({ currentPassword: 'parola-veche', newPassword: 'parola-noua' })
                .expect(200);

            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola-veche' }).expect(401);
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola-noua' }).expect(200);
            await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
        });

        it('refuses a wrong current password and changes nothing', async () => {
            const parent = await registerUser(app, 'ana', 'parola-veche');

            const res = await request(app.getHttpServer())
                .post('/auth/change-password')
                .set('Authorization', parent.auth)
                .send({ currentPassword: 'gresita', newPassword: 'parola-noua' })
                .expect(400);

            expect(res.body.code).toBe('CURRENT_PASSWORD_WRONG');
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola-veche' }).expect(200);
        });

        it('needs a token', async () => {
            await registerUser(app, 'ana', 'parola-veche');

            await request(app.getHttpServer()).post('/auth/change-password').send({ currentPassword: 'parola-veche', newPassword: 'parola-noua' }).expect(401);
        });

        it('cannot be used to change anybody else', async () => {
            const ana = await registerUser(app, 'ana', 'parola-ana');
            await registerUser(app, 'bogdan', 'parola-bogdan');

            // There is no id to point anywhere: the account comes from the token. The closest a
            // caller can get is knowing somebody else's password, which changes their own account.
            await request(app.getHttpServer())
                .post('/auth/change-password')
                .set('Authorization', ana.auth)
                .send({ currentPassword: 'parola-bogdan', newPassword: 'parola-noua' })
                .expect(400);

            await request(app.getHttpServer()).post('/auth/login').send({ username: 'bogdan', password: 'parola-bogdan' }).expect(200);
        });
    });
});
