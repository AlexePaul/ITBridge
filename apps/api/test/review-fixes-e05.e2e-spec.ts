import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, ownProfileId, promoteToAdmin, registerUser, registrationBody, truncateAll, TestUser, createRoom, groupBody } from './helpers';

/**
 * Regression cover for the defects a second review pass turned up on E05.
 *
 * Every test here failed before the accompanying fix. They are grouped by the defect rather than by
 * endpoint, because that is what they are about — each one pins a specific way the code used to be
 * wrong, and several of them only reproduce with concurrency or with a second real user, which is
 * why the original suites missed them.
 */
describe('E05 review fixes (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.review'));
        ana = await registerUser(app, 'ana.review');
        bogdan = await registerUser(app, 'bogdan.review');
    });

    /** Two parents, each with a profile, a child, an invoice and a payment on it. */
    async function seedTwoFamilies(): Promise<{ anaPaymentId: number; bogdanPaymentId: number }> {
        const ids: Record<string, number> = {};

        for (const [key, user] of Object.entries({ ana, bogdan })) {
            // Registration already wrote the profile (E11/S2); a second one for the same account is
            // a 409 by design.
            const profileId = await ownProfileId(app, user);

            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', user.auth)
                .send({ firstName: 'Copil', lastName: 'Test', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);

            const invoices = await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [profileId], dateIssued: '2026-03-01', monthIssued: key === 'ana' ? '2026-03' : '2026-04' })
                .expect(201);

            const payment = await request(app.getHttpServer())
                .post('/payments')
                .set('Authorization', admin.auth)
                .send({ invoiceId: invoices.body[0].id, method: 'cash', date: '2026-03-05' })
                .expect(201);

            ids[key] = payment.body.id as number;
        }

        return { anaPaymentId: ids.ana, bogdanPaymentId: ids.bogdan };
    }

    describe('payment ownership', () => {
        /**
         * `findOne` built the query with `andWhere` for the ownership narrowing and then called
         * `where` for the id — and `where` *replaces* the clause, so the narrowing was discarded.
         * Every parent could read every other family's payment, with the invoice and the full
         * parent profile joined in: email, phone, address.
         */
        it('a parent cannot read another family payment by id', async () => {
            const { bogdanPaymentId } = await seedTwoFamilies();

            await request(app.getHttpServer()).get(`/payments/${bogdanPaymentId}`).set('Authorization', ana.auth).expect(404);
        });

        it('a parent can still read their own payment', async () => {
            const { anaPaymentId } = await seedTwoFamilies();

            const res = await request(app.getHttpServer()).get(`/payments/${anaPaymentId}`).set('Authorization', ana.auth).expect(200);
            expect(res.body.id).toBe(anaPaymentId);
        });

        it('an admin reads any payment', async () => {
            const { bogdanPaymentId } = await seedTwoFamilies();

            await request(app.getHttpServer()).get(`/payments/${bogdanPaymentId}`).set('Authorization', admin.auth).expect(200);
        });
    });

    describe('refresh token rotation under concurrency', () => {
        /**
         * Five refreshes fired at once with the same token. Exactly one may succeed, and the
         * successor it mints must not survive: the losers detected the replay and swept the family,
         * but the sweep could run before the winner had inserted the successor row, so the token
         * stayed live. Reuse was reported and then not acted on.
         */
        it('a replay revokes the successor too, even when it races the legitimate refresh', async () => {
            const responses = await Promise.all(
                Array.from({ length: 5 }, () => request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: ana.refreshToken })),
            );

            const succeeded = responses.filter((r) => r.status === 200);
            expect(succeeded).toHaveLength(1);

            const successor = succeeded[0].body.refreshToken as string;
            await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: successor }).expect(401);

            // Scoped to this user: the other two accounts registered in `beforeEach` have live
            // sessions of their own, and they are none of this test's business.
            const live = await dataSource.query<{ count: string }[]>('SELECT count(*) FROM sessions WHERE "revokedAt" IS NULL AND user_id = $1', [ana.userId]);
            expect(Number(live[0].count)).toBe(0);
        });

        it('a sequential refresh still works and returns a usable successor', async () => {
            const first = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: ana.refreshToken }).expect(200);

            await request(app.getHttpServer())
                .post('/auth/refresh')
                .send({ refreshToken: first.body.refreshToken as string })
                .expect(200);
        });
    });

    describe('optional fields left blank', () => {
        /**
         * An untouched text input submits `''`, and `@IsOptional()` does not skip an empty string —
         * so `@Length(1, 255)` on the address rejected the exact payload the setup form always
         * sends. Together with the phone format this made the mandatory onboarding screen
         * impossible to complete.
         */
        // These go through the admin token now. E11/S2 gave `register` the parent's contact
        // details, so a parent already has a profile and a second one is a 409 — but the flow these
        // tests are about, an admin entering a family with whatever details they happen to have, is
        // deliberately unchanged, and that is the road where the fields are still optional.
        it('accepts a profile with an empty address', async () => {
            const res = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Test', phone: '0712345678', address: '' })
                .expect(201);

            expect(res.body.address).toBeNull();
        });

        it('accepts a Romanian phone written the local way', async () => {
            await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Test', phone: '0712345678' })
                .expect(201);
        });

        it('still accepts the international form', async () => {
            await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Bogdan', lastName: 'Test', phone: '+40712345679' })
                .expect(201);
        });

        it('still rejects a phone number that is not one', async () => {
            const res = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Test', phone: 'nu-e-telefon' })
                .expect(400);

            expect(res.body.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('usernames', () => {
        it('refuses a username that differs only by case', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('ANA.REVIEW'), email: 'ana.review.upper@example.com' })
                .expect(409);

            // `USERNAME_TAKEN` since E11/S2: registration can now conflict on three different
            // things, and one shared `CONFLICT` left the parent to guess which.
            expect(res.body.code).toBe('USERNAME_TAKEN');
        });

        it('signs in regardless of how the username is capitalised', async () => {
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ANA.REVIEW', password: 'parola123' }).expect(200);
        });
    });

    describe('error bodies', () => {
        /**
         * Nest's not-found handler builds its message from the raw URL, so a 404 answered with a
         * redacted `path` and, in the same object, a `message` carrying the query string in clear
         * text — email and token included.
         */
        it('does not echo a raw query string back through the 404 message', async () => {
            const res = await request(app.getHttpServer()).get('/nu-exista?email=secret@example.com&token=abc123').expect(404);

            expect(res.body.path).not.toContain('secret@example.com');
            expect(res.body.message).not.toContain('secret@example.com');
            expect(res.body.message).not.toContain('abc123');
            expect(res.body.message).toContain('[redacted]');
        });

        it('always carries a request id, even when the body never reaches Nest', async () => {
            const res = await request(app.getHttpServer()).post('/auth/login').set('Content-Type', 'application/json').send('{"username": broken').expect(400);

            expect(res.body.requestId).toBeDefined();
            expect(res.body.requestId).not.toBe('unknown');
        });
    });

    describe('invoice PDFs', () => {
        /**
         * The key used to be rebuilt from the parent's *current* name at download time, while the
         * object had been stored under the name at issue time — so renaming a profile made every
         * invoice that parent had ever received permanently unreachable.
         */
        it('a stored PDF survives the parent being renamed', async () => {
            const profileId = await ownProfileId(app, ana);

            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', ana.auth)
                .send({ firstName: 'Copil', lastName: 'Popescu', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);

            const invoices = await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [profileId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
                .expect(201);

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', admin.auth).send({ lastName: 'Ionescu' }).expect(200);

            // S3 is stubbed in this suite, so what is asserted is that the lookup still resolves —
            // `invoice-pdf.e2e-spec.ts` covers the real round trip against MinIO.
            await request(app.getHttpServer()).get(`/invoices/${invoices.body[0].id}/pdf`).set('Authorization', admin.auth).expect(200);
        });
    });

    describe('decimal columns', () => {
        /**
         * `decimal` comes back from the driver as a string. The entity and the shared contract both
         * declare `number`, and `contract.ts` compares declarations, so nothing caught that the
         * wire format disagreed with both of them.
         *
         * The two age columns became `integer` in E08 — an age in half-years was never meaningful —
         * so this now guards the conversion rather than the transformer. It still fails the same
         * way if either column goes back to `decimal` without one.
         */
        it('returns group ages as numbers, not strings', async () => {
            await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(await createRoom(app, admin)))
                .expect(201);

            const res = await request(app.getHttpServer()).get('/groups').set('Authorization', admin.auth).expect(200);
            expect(typeof res.body[0].minAge).toBe('number');
            expect(typeof res.body[0].maxAge).toBe('number');
        });

        it('returns a discount value as a number', async () => {
            const profile = { body: { id: await ownProfileId(app, ana) } };

            await request(app.getHttpServer())
                .post('/discounts')
                .set('Authorization', admin.auth)
                .send({ parentId: profile.body.id, name: 'Frate', value: 50, monthIssued: '2026-03' })
                .expect(201);

            const res = await request(app.getHttpServer()).get('/discounts').set('Authorization', admin.auth).expect(200);
            expect(typeof res.body[0].value).toBe('number');
        });
    });
});
