import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * A family's own data, against a real database — E07 S4.
 *
 * The unit spec holds the coverage question: does the export read every table the inventory names.
 * What only the whole stack shows is the one that matters most — that the document a family gets is
 * *theirs*. The payload here is everything the school holds, so a leak is not a field, it is a life.
 */
describe('Privacy export (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;
    let anaProfileId: number;
    let bogdanProfileId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.export'));
        ana = await registerUser(app, 'ana.export');
        bogdan = await registerUser(app, 'bogdan.export');

        anaProfileId = await ownProfileId(app, ana);
        bogdanProfileId = await ownProfileId(app, bogdan);

        const anaChild = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', ana.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-02', parentId: anaProfileId })
            .expect(201);
        await enrolInNewGroup(app, admin, [anaChild.body.id as number]);

        await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', bogdan.auth)
            .send({ firstName: 'Andrei', lastName: 'Ionescu', birthDate: '2015-09-09', parentId: bogdanProfileId })
            .expect(201);

        await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [anaProfileId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
            .expect(201);
    });

    const exportOwn = (user: TestUser) => request(app.getHttpServer()).get('/privacy/export').set('Authorization', user.auth);

    it('gives a family its own record, with the children in it', async () => {
        const res = await exportOwn(ana).expect(200);

        // `registrationBody` derives the parent's name from the username, so this is what the
        // helper really writes — asserted rather than assumed, since the point is that the document
        // carries the row the database holds.
        expect(res.body.parinte.nume).toBe('ana.export Test');
        expect(res.body.parinte.email).toBe('ana.export@example.com');
        expect(res.body.copii).toHaveLength(1);
        expect(res.body.copii[0].nume).toBe('Maria Pop');
        expect(res.body.copii[0].dataNasterii).toBe('2016-04-02');
        expect(res.body.facturi).toHaveLength(1);
        expect(res.body.facturi[0].luna).toBe('2026-03');
        expect(Date.parse(res.body.generatedAt as string)).not.toBeNaN();
    });

    /** The whole reason this suite runs against Postgres rather than a mock. */
    it("carries nothing about anybody else's family", async () => {
        const res = await exportOwn(ana).expect(200);
        const wholeDocument = JSON.stringify(res.body);

        expect(wholeDocument).not.toContain('Andrei');
        expect(wholeDocument).not.toContain('Ionescu');
        expect(wholeDocument).not.toContain('bogdan.export');
    });

    it('takes the family from the token, not from anything the caller can set', async () => {
        // There is no `:id` on this route, so the closest a parent can come is asking for the
        // admin's version — which the role guard refuses.
        await request(app.getHttpServer()).get(`/privacy/export/${bogdanProfileId}`).set('Authorization', ana.auth).expect(403);
        await request(app.getHttpServer()).get(`/privacy/export/${anaProfileId}`).set('Authorization', ana.auth).expect(403);
    });

    it('is closed to a caller with no token', async () => {
        await request(app.getHttpServer()).get('/privacy/export').expect(401);
        await request(app.getHttpServer()).get(`/privacy/export/${anaProfileId}`).expect(401);
    });

    it('lets the office produce the same document for a family that phoned', async () => {
        const res = await request(app.getHttpServer()).get(`/privacy/export/${anaProfileId}`).set('Authorization', admin.auth).expect(200);

        expect(res.body.parinte.nume).toBe('ana.export Test');
        expect(res.body.copii[0].nume).toBe('Maria Pop');
    });

    /**
     * A hash is personal data and it is in the inventory as such, but handing it back gives a
     * family nothing and gives anybody who reads the file something to guess against.
     */
    /**
     * The enquiry that started it all, which no link can find: `Lead.profile` is written only by the
     * public trial form, so a family who first telephoned has a row about them and their child that
     * a link-only query does not return. „Everything the school holds about you" has to include the
     * first thing it ever held.
     */
    it('includes the enquiry an admin typed in before the family had an account', async () => {
        await request(app.getHttpServer())
            .post('/leads')
            .set('Authorization', admin.auth)
            .send({
                parentName: 'Ana Test',
                parentEmail: 'ana.export@example.com',
                childFirstName: 'Maria',
                childLastName: 'Pop',
                childBirthDate: '2016-04-02',
                source: 'phone',
            })
            .expect(201);

        const mine = await exportOwn(ana).expect(200);
        const theirs = await exportOwn(bogdan).expect(200);

        expect(mine.body.solicitari).toHaveLength(1);
        expect(mine.body.solicitari[0].copil).toBe('Maria Pop');
        expect(theirs.body.solicitari).toHaveLength(0);
    });

    it('never returns a credential', async () => {
        const res = await exportOwn(ana).expect(200);
        const wholeDocument = JSON.stringify(res.body);

        expect(wholeDocument).not.toContain('passwordHash');
        expect(wholeDocument).not.toContain('tokenHash');
        expect(wholeDocument).not.toContain('$2b$');
    });

    it('answers for a family that has barely started, without inventing anything', async () => {
        const res = await exportOwn(bogdan).expect(200);

        expect(res.body.copii).toHaveLength(1);
        expect(res.body.copii[0].inscrieri).toEqual([]);
        expect(res.body.copii[0].prezente).toEqual([]);
        expect(res.body.facturi).toEqual([]);
        expect(res.body.reduceri).toEqual([]);
    });

    it('carries the attendance the school actually recorded', async () => {
        const child = await request(app.getHttpServer()).get('/children').set('Authorization', ana.auth).expect(200);
        const childId = child.body[0].id as number;
        const groupId = child.body[0].group.id as number;
        const sessionId = await createClassSession(dataSource, groupId, { date: '2026-03-04' });

        await request(app.getHttpServer())
            .put(`/attendance/session/${sessionId}/child/${childId}`)
            .set('Authorization', admin.auth)
            .send({ present: true })
            .expect(200);

        const res = await exportOwn(ana).expect(200);

        expect(res.body.copii[0].prezente).toEqual([expect.objectContaining({ data: '2026-03-04', prezent: true })]);
    });
});
