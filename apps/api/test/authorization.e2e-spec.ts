import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Autorizarea pe date, verificată prin HTTP. Testele unitare arată că interogările *conțin*
 * restrângerea; aici se verifică efectul: doi părinți reali, cu date reale, iar unul nu are voie să
 * le vadă pe ale celuilalt.
 *
 * Distincția contează, fiindcă restrângerea trăiește în service, nu în guard — deci un guard corect
 * nu garantează nimic despre date.
 */
describe('Autorizare pe date (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;
    let anaProfileId: number;
    let bogdanProfileId: number;
    let anaInvoiceId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        const root = await registerUser(app, 'admin');
        admin = await promoteToAdmin(app, dataSource, root);
        ana = await registerUser(app, 'ana');
        bogdan = await registerUser(app, 'bogdan');

        // Email și telefon distincte, obligatoriu: vezi profile-creation.e2e-spec.ts. Un profil
        // fără date de contact face verificarea de unicitate să răspundă 409 pentru al doilea.
        anaProfileId = await createProfile(ana, 'Ana', 'Pop', 'ana@example.com', '+40700000001');
        bogdanProfileId = await createProfile(bogdan, 'Bogdan', 'Ion', 'bogdan@example.com', '+40700000002');

        await createChild(ana, anaProfileId, 'Maria');
        await createChild(bogdan, bogdanProfileId, 'Radu');

        anaInvoiceId = await createInvoice(anaProfileId);
    });

    const createProfile = async (user: TestUser, firstName: string, lastName: string, email: string, phone: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', user.auth)
            .send({ firstName, lastName, email, phone })
            .expect(201);
        return res.body.id as number;
    };

    const createChild = async (user: TestUser, parentId: number, firstName: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', user.auth)
            .send({ parentId, firstName, lastName: 'Test', birthDate: '2015-05-05' })
            .expect(201);
        return res.body.id as number;
    };

    const createInvoice = async (parentId: number): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [parentId], monthIssued: '2026-03', dateIssued: '2026-03-01' });

        if (res.status !== 201) {
            throw new Error(`POST /invoices pentru parentId=${parentId} a dat ${res.status}: ${JSON.stringify(res.body)}`);
        }
        return res.body[0].id as number;
    };

    describe('facturi', () => {
        it('adminul vede facturile tuturor', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it('părintele își vede propriile facturi', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it('părintele nu vede facturile altui părinte în listă', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', bogdan.auth).expect(200);
            expect(res.body).toHaveLength(0);
        });

        it('părintele nu poate cere direct factura altcuiva, nici după id', async () => {
            await request(app.getHttpServer()).get(`/invoices/${anaInvoiceId}`).set('Authorization', bogdan.auth).expect(404);
        });

        it('un filtru explicit pe alt părinte nu deschide nimic', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').query({ parentId: anaProfileId }).set('Authorization', bogdan.auth).expect(200);

            expect(res.body).toHaveLength(0);
        });

        it('părintele nu poate emite facturi', async () => {
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', ana.auth)
                .send({ parentIds: [bogdanProfileId], monthIssued: '2026-04', dateIssued: '2026-04-01' })
                .expect(403);
        });

        it('părintele nu poate modifica o factură, nici pe a lui', async () => {
            await request(app.getHttpServer()).put(`/invoices/${anaInvoiceId}`).set('Authorization', ana.auth).send({ status: 'paid' }).expect(403);
        });

        it('părintele nu poate șterge o factură', async () => {
            await request(app.getHttpServer()).delete(`/invoices/${anaInvoiceId}`).set('Authorization', ana.auth).expect(403);
        });
    });

    describe('copii', () => {
        it('părintele își vede propriii copii', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].firstName).toBe('Maria');
        });

        it('părintele nu vede copiii altui părinte', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', bogdan.auth).expect(200);
            expect(res.body.map((c: { firstName: string }) => c.firstName)).not.toContain('Maria');
        });

        it('adminul vede toți copiii', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(2);
        });

        it('părintele nu poate adăuga un copil pe profilul altcuiva', async () => {
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', bogdan.auth)
                .send({ parentId: anaProfileId, firstName: 'Intrus', lastName: 'X', birthDate: '2016-01-01' })
                .expect(403);
        });
    });

    describe('profiluri', () => {
        it('părintele își vede doar propriul profil', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].id).toBe(anaProfileId);
        });

        it('un filtru pe alt utilizator nu deschide nimic', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').query({ userId: ana.userId }).set('Authorization', bogdan.auth).expect(200);

            expect(res.body.every((p: { id: number }) => p.id === bogdanProfileId)).toBe(true);
        });

        it('adminul vede toate profilurile', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', admin.auth).expect(200);
            expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('endpoint-uri rezervate adminului', () => {
        it.each([
            ['GET', '/users'],
            ['GET', '/users/without-profile'],
        ])('%s %s refuză un PARENT cu 403', async (method, path) => {
            await request(app.getHttpServer())[method.toLowerCase() as 'get'](path).set('Authorization', ana.auth).expect(403);
        });

        it.each([
            ['POST', '/groups'],
            ['POST', '/discounts'],
        ])('%s %s refuză un PARENT cu 403', async (_method, path) => {
            await request(app.getHttpServer()).post(path).set('Authorization', ana.auth).send({}).expect(403);
        });

        it('aceleași endpoint-uri răspund adminului', async () => {
            await request(app.getHttpServer()).get('/users').set('Authorization', admin.auth).expect(200);
        });
    });

    describe('fără autentificare', () => {
        it.each([['/invoices'], ['/children'], ['/profiles'], ['/users']])('GET %s întoarce 401', async (path) => {
            await request(app.getHttpServer()).get(path).expect(401);
        });
    });
});
