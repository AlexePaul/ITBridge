import { INestApplication, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { LocationService } from 'src/modules/location/location.service';
import { ErrorReportService } from 'src/modules/error-report/error-report.service';
import { RetentionService } from 'src/modules/privacy/retention.service';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * E06 S1 — the error record. A 500 a family met, a job that failed at night and a screen that broke
 * in a browser all end up on one list, under the code the screen showed, with the account that met
 * them; and nothing about recording one can change what the caller got.
 */
describe('Error record (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let reports: ErrorReportService;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
        reports = app.get(ErrorReportService);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        jest.restoreAllMocks();
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'parinte');
    });

    const server = () => app.getHttpServer();

    /** Everything handed to the recorder so far, written — it never makes a caller wait. */
    const listed = async (query = '') => {
        await reports.flush();
        const res = await request(server()).get(`/errors${query}`).set('Authorization', admin.auth).expect(200);
        return res.body as Array<Record<string, any>>;
    };

    const breakLocations = (message = 'relation "locations" is gone') =>
        jest.spyOn(app.get(LocationService), 'findLocations').mockRejectedValue(new Error(message));

    it('lists a 500 under the code its response carried, with the route and the account that met it', async () => {
        breakLocations();

        const res = await request(server()).get('/locations').set('Authorization', parent.auth).expect(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');

        const found = await listed(`?ref=${String(res.body.requestId).slice(0, 8)}`);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
            source: 'request',
            origin: 'GET /locations',
            errorName: 'Error',
            message: 'relation "locations" is gone',
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            occurrences: 1,
            resolvedAt: null,
        });
        expect(found[0].stack).toContain('at ');
        expect(found[0].recent[0]).toMatchObject({
            ref: res.body.requestId,
            userId: parent.userId,
            username: 'parinte',
            familyName: 'parinte Test',
            path: '/locations',
        });
    });

    it('counts a fault met again as one report, whatever ids the addresses carried', async () => {
        jest.spyOn(app.get(LocationService), 'findLocationById').mockRejectedValue(new Error('boom'));

        await request(server()).get('/locations/1').set('Authorization', admin.auth).expect(500);
        await request(server()).get('/locations/2').set('Authorization', parent.auth).expect(500);

        const open = await listed();
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({ origin: 'GET /locations/:id', occurrences: 2 });
        expect(open[0].recent.map((o: { path: string }) => o.path)).toEqual(['/locations/2', '/locations/1']);
    });

    it('opens a new report when a fault marked fixed comes back', async () => {
        breakLocations();
        await request(server()).get('/locations').set('Authorization', admin.auth).expect(500);
        const [first] = await listed();

        const resolved = await request(server()).post(`/errors/${first.id}/resolve`).set('Authorization', admin.auth).expect(200);
        expect(resolved.body.resolvedAt).not.toBeNull();
        expect(await listed()).toEqual([]);

        await request(server()).get('/locations').set('Authorization', admin.auth).expect(500);

        const [again] = await listed();
        expect(again.id).not.toBe(first.id);
        expect(again.occurrences).toBe(1);
        expect(await listed('?state=all')).toHaveLength(2);
        expect(await listed('?state=resolved')).toEqual([expect.objectContaining({ id: first.id })]);
    });

    it('records what a job logs, and does not record a 500 twice', async () => {
        breakLocations();
        await request(server()).get('/locations').set('Authorization', admin.auth).expect(500);

        new Logger('FiscalIssuingJob').error(
            'Could not issue invoice 12',
            'Error: SmartBill said no\n    at FiscalIssuingService.tick (/srv/api/src/x.ts:1:1)',
        );
        // A job that throws is caught by the scheduler, which logs the error object itself.
        new Logger('Scheduler').error(new TypeError("Cannot read properties of undefined (reading 'id')"));

        const logged = await listed('?source=logged');
        expect(logged.map((r) => r.origin).sort()).toEqual(['FiscalIssuingJob', 'Scheduler']);
        expect(logged.find((r) => r.origin === 'Scheduler')).toMatchObject({ errorName: 'TypeError', recent: [expect.objectContaining({ userId: null })] });
        expect(logged.find((r) => r.origin === 'FiscalIssuingJob')?.stack).toContain('FiscalIssuingService.tick');

        // The filter's own log line (context `Exception`) is not a second report of the same 500.
        expect(await listed('?source=request')).toHaveLength(1);
        expect(await listed()).toHaveLength(3);
    });

    it("records a screen that broke in a family's browser, scrubbed, under the browser's reference", async () => {
        await request(server())
            .post('/errors/client')
            .set('Authorization', parent.auth)
            .send({
                name: 'TypeError',
                message: 'Cannot read properties of undefined, invoice for ana.pop@example.com',
                stack: 'TypeError: x\n    at Proxy.render (https://stage.example/_nuxt/Bx3k.js:1:2345)',
                route: '/user/plati',
                path: '/user/plati?token=secret',
                component: 'PaymentsTable < PortalPage',
                kind: 'vue',
                reference: 'b7e1c04a',
            })
            .expect(202);

        const [report] = await listed('?ref=b7e1c04a');
        expect(report).toMatchObject({
            source: 'browser',
            origin: '/user/plati · PaymentsTable < PortalPage',
            code: 'vue',
            message: 'Cannot read properties of undefined, invoice for [email]',
            recent: [expect.objectContaining({ ref: 'b7e1c04a', userId: parent.userId, path: '/user/plati?token=[redacted]' })],
        });
    });

    it('refuses a report with no route, and one from nobody', async () => {
        await request(server()).post('/errors/client').set('Authorization', parent.auth).send({ name: 'Error', message: 'x', kind: 'vue' }).expect(400);
        await request(server()).post('/errors/client').send({ name: 'Error', message: 'x', route: '/', kind: 'vue' }).expect(401);
        expect(await listed('?state=all')).toEqual([]);
    });

    it('shows the record to the office only', async () => {
        await request(server()).get('/errors').set('Authorization', parent.auth).expect(403);
        await request(server()).get('/errors/summary').set('Authorization', parent.auth).expect(403);
        await request(server()).post('/errors/1/resolve').set('Authorization', parent.auth).expect(403);
    });

    it('counts the open reports for the menu', async () => {
        breakLocations();
        await request(server()).get('/locations').set('Authorization', admin.auth).expect(500);
        new Logger('ArrearsJob').error('Could not send reminder 4');
        await reports.flush();

        const res = await request(server()).get('/errors/summary').set('Authorization', admin.auth).expect(200);
        expect(res.body).toEqual({ open: 2 });
    });

    it('lets a report go thirty days after it was last seen, like the server logs', async () => {
        breakLocations();
        await request(server()).get('/locations').set('Authorization', admin.auth).expect(500);
        new Logger('ArrearsJob').error('Could not send reminder 4');
        await reports.flush();
        await dataSource.query(`UPDATE error_reports SET "lastSeenAt" = now() - interval '31 days' WHERE origin = 'ArrearsJob'`);

        const report = await app.get(RetentionService).run();

        expect(report.errorReportsRemoved).toBe(1);
        expect((await listed('?state=all')).map((r) => r.origin)).toEqual(['GET /locations']);
    });
});
