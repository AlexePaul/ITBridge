import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registerUser, registrationBody, truncateAll } from './helpers';
import { LEGAL_DOCUMENT_VERSIONS } from '../src/modules/auth/legal-documents';

describe('Authentication (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    afterAll(async () => {
        await app.close();
    });

    it('registers, then calls /auth/me with the returned token', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).toMatchObject({ username: 'ana', role: 'PARENT' });
    });

    it('never returns the password hash', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('refuses a second account with the same username', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer())
            .post('/auth/register')
            .send({ ...registrationBody('ana'), email: 'altcineva@example.com' })
            .expect(409);
    });

    it('login with the correct password returns tokens', async () => {
        await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200);

        expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    });

    it('login with a wrong password returns 401', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'gresita' }).expect(401);
    });

    it('refresh returns a fresh access token', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);

        expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('refresh with an access token instead of a refresh token returns 401', async () => {
        const user = await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.accessToken }).expect(401);
    });

    it('without an authorization header, /auth/me returns 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('with a made-up token, /auth/me returns 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer nu-e-un-jwt').expect(401);
    });

    it('rejects a register body carrying an unexpected field, such as role', async () => {
        // `forbidNonWhitelisted` refuses the request outright. Previously the field was silently
        // dropped, which worked but told the caller nothing.
        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ ...registrationBody('siret'), role: 'ADMIN' })
            .expect(400);

        expect(JSON.stringify(res.body)).toContain('role');
    });

    it('creates a PARENT for a well-formed register body', async () => {
        const user = await registerUser(app, 'obisnuit');

        const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(me.body.role).toBe('PARENT');
    });

    it('rejects a password shorter than six characters', async () => {
        // RegisterDto has asked for six since it was written; nothing enforced it until now.
        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ ...registrationBody('scurt'), password: 'abc' })
            .expect(400);

        expect(JSON.stringify(res.body)).toContain('password');
    });

    it('rejects a register body with no password at all', async () => {
        await request(app.getHttpServer()).post('/auth/register').send({ username: 'fara' }).expect(400);
    });

    describe('the terms and the privacy notice — E22 S2/S4', () => {
        it('refuses a registration that has not accepted them, naming the field', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('grabit'), acceptedTerms: false })
                .expect(400);

            // The refusal carries the DTO's own sentence, not the field name: it is what the form
            // would show if it ever let the request through.
            expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
            expect(JSON.stringify(res.body)).toContain('trebuie acceptate');
        });

        it('records which version of each document the parent accepted, one row per document', async () => {
            await registerUser(app, 'ana');

            const rows = await dataSource.query<{ document: string; version: string }[]>(
                `SELECT a.document, a.version FROM document_acceptances a JOIN users u ON u.id = a.user_id WHERE u.username = 'ana' ORDER BY a.id`,
            );

            expect(rows).toEqual([
                { document: 'terms', version: LEGAL_DOCUMENT_VERSIONS.terms },
                { document: 'privacy', version: LEGAL_DOCUMENT_VERSIONS.privacy },
                { document: 'unusual_clauses', version: LEGAL_DOCUMENT_VERSIONS.unusual_clauses },
            ]);
        });

        it('refuses a registration that accepted the document but not the clauses inside it', async () => {
            // Cod civil art. 1203: §14, §15 and §18 produce no effect on a tick that covered the
            // whole document, so the general checkbox on its own is not enough to create an account.
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('partial'), acceptedUnusualClauses: false })
                .expect(400);

            expect(JSON.stringify(res.body)).toContain('§14');
        });
    });

    describe('a new version, asked for at the next sign-in — E22 S4', () => {
        /** Leaves the ledger holding an older version of one document, as a bump would. */
        const staleAcceptance = async (username: string, document: string) => {
            await dataSource.query(
                `UPDATE document_acceptances SET version = '0.0' WHERE document = $1
                 AND user_id = (SELECT id FROM users WHERE username = $2)`,
                [document, username],
            );
        };

        it('has nothing outstanding for a family that has just registered', async () => {
            const user = await registerUser(app, 'ana');

            const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

            expect(res.body.pendingLegalDocuments).toEqual([]);
        });

        it('names the document whose version has moved on, and only that one', async () => {
            const user = await registerUser(app, 'ana');
            await staleAcceptance('ana', 'terms');

            const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

            expect(res.body.pendingLegalDocuments).toEqual(['terms']);
        });

        it('records the acceptance and stops asking, keeping the row from the older version', async () => {
            const user = await registerUser(app, 'ana');
            await staleAcceptance('ana', 'terms');

            await request(app.getHttpServer())
                .post('/auth/accept-documents')
                .set('Authorization', user.auth)
                .send({ documents: ['terms'] })
                .expect(200);

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);
            expect(me.body.pendingLegalDocuments).toEqual([]);

            // Both rows, because the ledger is append-only: "what did this family agree to, and
            // when" has to keep its answer for every version, not only the newest.
            const rows = await dataSource.query<{ version: string }[]>(
                `SELECT a.version FROM document_acceptances a JOIN users u ON u.id = a.user_id
                 WHERE u.username = 'ana' AND a.document = 'terms' ORDER BY a.id`,
            );
            expect(rows.map((row) => row.version)).toEqual(['0.0', LEGAL_DOCUMENT_VERSIONS.terms]);
        });

        it('writes only what was outstanding, however much the client names', async () => {
            const user = await registerUser(app, 'ana');
            await staleAcceptance('ana', 'terms');

            // The screen sends what the server said was outstanding, but nothing stops a client
            // sending more, and the DTO's claim is that extra names are harmless. Untested, the
            // service could write a second row for each of them — which would move the day the
            // family accepted the privacy notice to today, on a document nobody showed them again.
            await request(app.getHttpServer())
                .post('/auth/accept-documents')
                .set('Authorization', user.auth)
                .send({ documents: ['terms', 'privacy', 'unusual_clauses'] })
                .expect(200);

            const rows = await dataSource.query<{ document: string; version: string }[]>(
                `SELECT a.document, a.version FROM document_acceptances a JOIN users u ON u.id = a.user_id
                 WHERE u.username = 'ana' ORDER BY a.id`,
            );
            expect(rows).toEqual([
                { document: 'terms', version: '0.0' },
                { document: 'privacy', version: LEGAL_DOCUMENT_VERSIONS.privacy },
                { document: 'unusual_clauses', version: LEGAL_DOCUMENT_VERSIONS.unusual_clauses },
                { document: 'terms', version: LEGAL_DOCUMENT_VERSIONS.terms },
            ]);
        });

        it('survives the second submit of a double-click, without a duplicate row', async () => {
            const user = await registerUser(app, 'ana');
            await staleAcceptance('ana', 'terms');

            const accept = () =>
                request(app.getHttpServer())
                    .post('/auth/accept-documents')
                    .set('Authorization', user.auth)
                    .send({ documents: ['terms'] });

            // Two submits at once: both read the same thing outstanding, and the unique constraint
            // is what decides. The second one is not an error to show the family — they did accept.
            const [first, second] = await Promise.all([accept(), accept()]);
            expect([first.status, second.status]).toEqual([200, 200]);

            const rows = await dataSource.query<{ count: string }[]>(
                `SELECT count(*)::text AS count FROM document_acceptances a JOIN users u ON u.id = a.user_id
                 WHERE u.username = 'ana' AND a.document = 'terms' AND a.version = $1`,
                [LEGAL_DOCUMENT_VERSIONS.terms],
            );
            expect(rows[0].count).toBe('1');
        });

        it('refuses a list that leaves something outstanding, and writes nothing', async () => {
            const user = await registerUser(app, 'ana');
            await staleAcceptance('ana', 'terms');
            await staleAcceptance('ana', 'unusual_clauses');

            const res = await request(app.getHttpServer())
                .post('/auth/accept-documents')
                .set('Authorization', user.auth)
                .send({ documents: ['terms'] })
                .expect(400);
            expect(res.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_INCOMPLETE' });

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);
            expect(me.body.pendingLegalDocuments).toEqual(['terms', 'unusual_clauses']);
        });

        it('refuses an unauthenticated acceptance', async () => {
            await request(app.getHttpServer())
                .post('/auth/accept-documents')
                .send({ documents: ['terms'] })
                .expect(401);
        });

        it('cannot be pointed at another family — the rows land on the account in the token', async () => {
            const ana = await registerUser(app, 'ana');
            const bogdan = await registerUser(app, 'bogdan');
            await staleAcceptance('bogdan', 'terms');

            // There is no field to name a family with: the DTO declares `documents` and nothing
            // else, and `forbidNonWhitelisted` refuses the rest rather than ignoring it. Asserted
            // here rather than left to the DTO, because the consequence is Bogdan being recorded
            // as having accepted a document he was never shown.
            const res = await request(app.getHttpServer())
                .post('/auth/accept-documents')
                .set('Authorization', ana.auth)
                .send({ documents: ['terms'], userId: bogdan.userId })
                .expect(400);
            expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', bogdan.auth).expect(200);
            expect(me.body.pendingLegalDocuments).toEqual(['terms']);
        });
    });
});
