import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { ArrearsJob } from 'src/modules/invoice/arrears.job';
import { createTestApp, enrolInNewGroup, holdSessions, ownProfileId, promoteToAdmin, registerUser, teachingMondays, TestUser, truncateAll } from './helpers';

/**
 * Arrears end to end — E16/S7.
 *
 * The acceptance is two sentences, and both are about consequences rather than mechanics: no
 * overdue invoice goes unnoticed, and reminders stop the moment the money arrives. The second is
 * the one worth proving against a real database, because it is not implemented as a rule anybody
 * applies — it is the absence of a row.
 */
describe('Arrears (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let job: ArrearsJob;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let invoiceId: number;

    beforeAll(async () => {
        const created = await createTestApp();
        app = created.app;
        dataSource = created.dataSource;
        job = app.get(ArrearsJob);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.restante'));
        parent = await registerUser(app, 'parinte.restante');
        profileId = await ownProfileId(app, parent);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        // Enrolled before March and present at four of its Mondays: a 350-lei month, counted from
        // the registers (E15/S9) rather than typed.
        const groupId = await enrolInNewGroup(app, admin, [child.body.id as number], {}, { startDate: '2026-01-01' });
        await holdSessions(app, dataSource, admin, groupId, [child.body.id as number], teachingMondays('2026-03').slice(0, 4));

        // Issued on 1 March, so the term ran out on the 15th.
        const issued = await request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2026-03', dateIssued: '2026-03-01' })
            .expect(201);
        invoiceId = issued.body.issued[0].id as number;
    });

    const arrears = (user: TestUser = admin) => request(app.getHttpServer()).get('/invoices/arrears').set('Authorization', user.auth);

    const pay = (amount: number) =>
        request(app.getHttpServer()).post('/payments').set('Authorization', admin.auth).send({ invoiceId, amount, method: 'cash', date: '2026-03-20' });

    describe('the list', () => {
        it('shows an unpaid invoice with its age and what is left', async () => {
            const res = await arrears().expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ invoiceId, outstanding: 350, dueOn: '2026-03-15' });
            expect(res.body[0].daysOverdue).toBeGreaterThan(0);
        });

        it('a partial payment leaves the family on the list, owing the rest', async () => {
            await pay(200).expect(201);

            const res = await arrears().expect(200);
            expect(res.body[0]).toMatchObject({ paid: 200, outstanding: 150 });
        });

        it('paying in full takes them off it — that is how the reminders stop', async () => {
            await pay(350).expect(201);

            // Not a rule anybody applies: the invoice is `paid`, so the query does not see it, so
            // the job has nobody to write to.
            await expect(arrears().expect(200)).resolves.toMatchObject({ body: [] });
        });

        it('is closed to parents — it is every family’s debts on one screen', async () => {
            await arrears(parent).expect(403);
        });
    });

    describe('the job', () => {
        it('marks a late invoice overdue', async () => {
            const result = await job.runFor(new Date(2026, 2, 20));

            expect(result.markedOverdue).toBe(1);
            const rows = await dataSource.query<{ status: string }[]>('SELECT "status" FROM "invoices" WHERE "id" = $1', [invoiceId]);
            expect(rows[0].status).toBe('overdue');
        });

        it('writes to the family on the weekly beat, and asks for what is left', async () => {
            await pay(200).expect(201);

            // 22 March: seven days past the term.
            const result = await job.runFor(new Date(2026, 2, 22));

            expect(result.notified).toBe(1);
            const mail = await dataSource.query<{ bodyText: string }[]>('SELECT "bodyText" FROM "outbox" WHERE "to" = $1 ORDER BY id DESC LIMIT 1', [
                'parinte.restante@example.com',
            ]);
            expect(mail[0].bodyText).toContain('150 lei');
        });

        it('writes nothing at all once the invoice is settled', async () => {
            await pay(350).expect(201);
            const result = await job.runFor(new Date(2026, 2, 22));
            expect(result.notified).toBe(0);
        });

        it('writes once, however many times it runs that day', async () => {
            await job.runFor(new Date(2026, 2, 22));
            await job.runFor(new Date(2026, 2, 22));

            const mail = await dataSource.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM "outbox" WHERE "to" = $1 AND "subject" LIKE '%martie%'`, [
                'parinte.restante@example.com',
            ]);
            expect(mail[0].n).toBe(1);
        });

        it('says nothing on a day that is not on the calendar', async () => {
            // 21 March: six days past, not a weekly beat.
            expect((await job.runFor(new Date(2026, 2, 21))).notified).toBe(0);
        });
    });
});
