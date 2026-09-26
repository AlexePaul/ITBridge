import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, registrationBody, truncateAll, TestUser } from './helpers';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { AccountClaim } from 'src/entities/account-claim.entity';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { DocumentAcceptance } from 'src/entities/document-acceptance.entity';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AccountClaimService } from 'src/modules/auth/account-claim.service';
import { ACCEPTED_AT_REGISTRATION } from 'src/modules/auth/legal-documents';

/**
 * A family the office typed in creates its own account — E11 S2, review of 26 September 2026.
 *
 * `POST /profiles` is how most families enter the platform, and until this the road ended there:
 * `register` refused the office's address as "taken" although no account held it, and no screen
 * could attach one afterwards. What only this suite can show is the whole loop against Postgres: the
 * register form answering with a link instead of a refusal, the link out of the queued mail creating
 * the account on the office's row, and every way a link can be dead giving the same answer.
 */
describe('Account claim (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    const OFFICE_EMAIL = 'ana.popescu@example.com';

    /** The newest queued message to an address — the family's inbox, as far as the suite can see it. */
    const lastMailTo = async (to: string): Promise<OutboxMessage | null> =>
        dataSource.getRepository(OutboxMessage).findOne({ where: { to }, order: { id: 'DESC' } });

    /** The token that went into the mail. It exists nowhere on the server — the row holds a hash. */
    const tokenFromMail = async (to = OFFICE_EMAIL): Promise<string> => {
        const mail = await lastMailTo(to);
        const match = /cont-familie\?token=([^\s&"<]+)/.exec(mail?.bodyText ?? '');
        if (!match) throw new Error('No claim link in the queued message');
        return decodeURIComponent(match[1]);
    };

    /** The family the office wrote down from a phone call: a name and an address, no account. */
    const officeFamily = async (email: string | null = OFFICE_EMAIL): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Popescu', ...(email ? { email } : {}) })
            .expect(201);
        return (res.body as { id: number }).id;
    };

    const claimBody = (token: string, username = 'ana.popescu') => ({
        token,
        username,
        password: 'parola-noua',
        acceptedTerms: true,
        acceptedUnusualClauses: true,
    });

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /auth/register with an address the office typed in', () => {
        it('sends a claim link instead of refusing, and writes neither an account nor a second profile', async () => {
            const profileId = await officeFamily();
            const usersBefore = await dataSource.getRepository(User).count();

            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: OFFICE_EMAIL })
                .expect(201);

            expect(res.body).toEqual({ claimSent: true, message: expect.any(String) });
            expect(res.body).not.toHaveProperty('accessToken');
            expect(await dataSource.getRepository(User).count()).toBe(usersBefore);
            expect(await dataSource.getRepository(Profile).count({ where: { email: OFFICE_EMAIL } })).toBe(1);

            const claims = await dataSource.getRepository(AccountClaim).find({ relations: { profile: true } });
            expect(claims).toHaveLength(1);
            expect(claims[0].profile.id).toBe(profileId);
            expect(claims[0].email).toBe(OFFICE_EMAIL);
            const token = await tokenFromMail();
            expect(claims[0].tokenHash).toBe(AccountClaimService.hash(token));
            expect(JSON.stringify(await dataSource.query('SELECT * FROM account_claims'))).not.toContain(token);
        });

        it('matches the address whatever its capitals', async () => {
            await officeFamily();

            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: 'Ana.Popescu@Example.com' })
                .expect(201);

            expect(res.body.claimSent).toBe(true);
            await expect(tokenFromMail()).resolves.toBeTruthy();
        });

        it('still refuses an address that already has an account', async () => {
            await registerUser(app, 'bogdan');

            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('altcineva'), email: 'bogdan@example.com' })
                .expect(409);

            expect(res.body.code).toBe('EMAIL_TAKEN');
            expect(await dataSource.getRepository(AccountClaim).count()).toBe(0);
        });
    });

    describe('POST /auth/claim', () => {
        it('creates the account on the office profile: confirmed, pending, with its acceptances, and it can sign in', async () => {
            const profileId = await officeFamily();
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: OFFICE_EMAIL })
                .expect(201);
            const token = await tokenFromMail();

            const res = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token)).expect(201);
            expect(res.body.accessToken).toEqual(expect.any(String));
            expect(res.body.refreshToken).toEqual(expect.any(String));

            const profile = await dataSource.getRepository(Profile).findOneOrFail({ where: { id: profileId }, relations: { user: true } });
            expect(profile.user?.username).toBe('ana.popescu');
            const user = await dataSource.getRepository(User).findOneOrFail({ where: { id: profile.user?.id } });
            expect(user.role).toBe('PARENT');
            expect(user.emailConfirmedAt).not.toBeNull();
            expect(user.approvalStatus).toBe('PENDING');
            expect(await dataSource.getRepository(Profile).count()).toBe(2); // the admin's own, and the office's row

            const acceptances = await dataSource.getRepository(DocumentAcceptance).find({ where: { user: { id: user.id } } });
            expect(acceptances.map((row) => row.document).sort()).toEqual([...ACCEPTED_AT_REGISTRATION].sort());
            // Terms §4.7's confirmation of what was accepted, to the address the link just proved, and
            // the office's "somebody is waiting" notice — what `register` sends too.
            const queued = await dataSource.getRepository(OutboxMessage).find();
            expect(
                queued.some((m) => m.to === OFFICE_EMAIL && m.status === OutboxStatus.PENDING && m.dedupeKey?.startsWith(`legal-acceptance:${user.id}:`)),
            ).toBe(true);
            expect(queued.some((m) => m.subject === 'Cont nou de părinte: Ana Popescu')).toBe(true);

            const trail = await dataSource.getRepository(AuditLog).find({ where: { entityType: 'Profile', entityId: profileId } });
            expect(trail.map((entry) => Object.keys(entry.changes ?? {}))).toContainEqual(['user']);

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
            expect(me.body).toMatchObject({ emailConfirmed: true, approvalStatus: 'PENDING', active: false, pendingLegalDocuments: [] });

            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana.popescu', password: 'parola-noua' }).expect(200);
        });

        it('refuses a link used once already', async () => {
            await officeFamily();
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: OFFICE_EMAIL })
                .expect(201);
            const token = await tokenFromMail();
            await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token)).expect(201);

            const again = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token, 'a.doua')).expect(400);
            expect(again.body.code).toBe('CLAIM_TOKEN_INVALID');
        });

        it('refuses an expired link, an unknown one and one replaced by a newer one — with the same answer', async () => {
            const profileId = await officeFamily();
            await request(app.getHttpServer()).post(`/profiles/${profileId}/account-claim`).set('Authorization', admin.auth).expect(200);
            const first = await tokenFromMail();
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: OFFICE_EMAIL })
                .expect(201);
            const second = await tokenFromMail();
            expect(second).not.toBe(first);

            const replaced = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(first)).expect(400);
            const unknown = await request(app.getHttpServer()).post('/auth/claim').send(claimBody('nu-exista')).expect(400);
            await dataSource.query(`UPDATE account_claims SET "expiresAt" = now() - interval '1 minute' WHERE "usedAt" IS NULL`);
            const expired = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(second)).expect(400);

            const answer = (body: Record<string, unknown>) => ({ statusCode: body.statusCode, code: body.code, message: body.message });
            expect(answer(replaced.body)).toEqual(answer(unknown.body));
            expect(answer(expired.body)).toEqual(answer(unknown.body));
            expect(unknown.body.code).toBe('CLAIM_TOKEN_INVALID');
            expect(await dataSource.getRepository(User).count()).toBe(1); // the admin
        });

        it('refuses a link whose address the office has corrected since', async () => {
            const profileId = await officeFamily();
            await request(app.getHttpServer()).post(`/profiles/${profileId}/account-claim`).set('Authorization', admin.auth).expect(200);
            const token = await tokenFromMail();
            await request(app.getHttpServer())
                .put(`/profiles/${profileId}`)
                .set('Authorization', admin.auth)
                .send({ email: 'ana.corectat@example.com' })
                .expect(200);

            const res = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token)).expect(400);
            expect(res.body.code).toBe('CLAIM_TOKEN_INVALID');
        });

        it('keeps the username rules of registration', async () => {
            await officeFamily();
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ana'), email: OFFICE_EMAIL })
                .expect(201);
            const token = await tokenFromMail();

            const taken = await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token, 'ADMIN')).expect(409);
            expect(taken.body.code).toBe('USERNAME_TAKEN');
            await request(app.getHttpServer())
                .post('/auth/claim')
                .send({ ...claimBody(token), acceptedUnusualClauses: false })
                .expect(400);
            // Neither refusal spent the link.
            await request(app.getHttpServer()).post('/auth/claim').send(claimBody(token)).expect(201);
        });
    });

    describe('POST /profiles/:id/account-claim', () => {
        it('queues a link to the address on the profile and leaves a trail', async () => {
            const profileId = await officeFamily();

            await request(app.getHttpServer()).post(`/profiles/${profileId}/account-claim`).set('Authorization', admin.auth).expect(200);

            await expect(tokenFromMail()).resolves.toBeTruthy();
            const [claim] = await dataSource.getRepository(AccountClaim).find();
            const trail = await dataSource.getRepository(AuditLog).find({ where: { entityType: 'AccountClaim', entityId: claim.id } });
            expect(trail).toHaveLength(1);
            expect(trail[0].actorUsername).toBe('admin');
            expect(JSON.stringify(trail[0].changes)).not.toContain(OFFICE_EMAIL);
        });

        it('refuses a family that already has an account, one with no address, and one erased — each with its own code', async () => {
            const bogdan = await registerUser(app, 'bogdan');
            const withAccount = (await dataSource.getRepository(Profile).findOneOrFail({ where: { user: { id: bogdan.userId } } })).id;
            const noAddress = await officeFamily(null);
            const erased = await officeFamily();
            await dataSource.query(`UPDATE profiles SET "erasedAt" = now() WHERE id = $1`, [erased]);

            const send = (id: number) => request(app.getHttpServer()).post(`/profiles/${id}/account-claim`).set('Authorization', admin.auth);
            expect((await send(withAccount).expect(409)).body.code).toBe('PROFILE_HAS_ACCOUNT');
            expect((await send(noAddress).expect(409)).body.code).toBe('PROFILE_HAS_NO_EMAIL');
            expect((await send(erased).expect(409)).body.code).toBe('PROFILE_ERASED');
            expect(await dataSource.getRepository(AccountClaim).count()).toBe(0);
        });

        it('is refused to a parent', async () => {
            const parent = await registerUser(app, 'bogdan');
            const profileId = await officeFamily();

            await request(app.getHttpServer()).post(`/profiles/${profileId}/account-claim`).set('Authorization', parent.auth).expect(403);
            expect(await dataSource.getRepository(AccountClaim).count()).toBe(0);
        });
    });
});
