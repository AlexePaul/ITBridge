import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { ParentNotificationsJob } from 'src/modules/attendance/parent-notifications.job';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The parent-facing half of E12/S7, against a real database.
 *
 * A `@Cron` never fires under `NODE_ENV=test` — jest sets it, and both suites build the real
 * `AppModule` — so the job's selection is a plain method and this suite calls it. What the cron
 * decides is the hour, and the hour is not what is being tested.
 */
describe('Parent notifications (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let job: ParentNotificationsJob;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let groupId: number;
    let sessionId: number;

    const TODAY = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    beforeAll(async () => {
        const created = await createTestApp();
        app = created.app;
        dataSource = created.dataSource;
        job = app.get(ParentNotificationsJob);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.notif'));
        parent = await registerUser(app, 'parinte.notif');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin, { slug: 'notif-loc', name: 'Notificări' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);

        sessionId = await createClassSession(dataSource, groupId, { date: iso(TODAY) });
    });

    const markAbsent = () =>
        request(app.getHttpServer()).put(`/attendance/session/${sessionId}/child/${childId}`).set('Authorization', admin.auth).send({ present: false });

    const mailTo = (address: string) =>
        dataSource.query<{ subject: string; bodyText: string }[]>('SELECT "subject", "bodyText" FROM "outbox" WHERE "to" = $1 ORDER BY id DESC', [address]);

    describe('an unannounced absence', () => {
        it('reaches the family the same day', async () => {
            await markAbsent().expect(200);

            const result = await job.notifyAbsences(TODAY);

            expect(result.notified).toBe(1);
            const mail = await mailTo('parinte.notif@example.com');
            expect(mail[0].subject).toContain('nu a fost azi la curs');
            expect(mail[0].bodyText).toContain('Maria');
        });

        it('does not write about one the family announced itself', async () => {
            // Announce a *future* class, then mark absent — announcing is only possible before the
            // register is taken, so the order matters and mirrors real life.
            const future = await createClassSession(dataSource, groupId, { date: iso(new Date(Date.now() + 7 * 86400000)) });
            await request(app.getHttpServer())
                .post('/attendance/absences')
                .set('Authorization', parent.auth)
                .send({ childId, classSessionId: future, reason: 'Plecăm din oraș' })
                .expect(201);
            await request(app.getHttpServer())
                .put(`/attendance/session/${future}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: false })
                .expect(200);

            const result = await job.notifyAbsences(new Date(Date.now() + 7 * 86400000));

            expect(result.notified).toBe(0);
        });

        it('says nothing about a child who was there', async () => {
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);

            expect((await job.notifyAbsences(TODAY)).notified).toBe(0);
        });

        it('writes once, however many times the job runs that evening', async () => {
            await markAbsent().expect(200);

            await job.notifyAbsences(TODAY);
            await job.notifyAbsences(TODAY);

            // The dedupe key is per parent per day; the second insert is refused by the database.
            const mail = await mailTo('parinte.notif@example.com');
            expect(mail.filter((row) => row.subject.includes('nu a fost azi')).length).toBe(1);
        });

        it('goes out even to a family that refused marketing — it is not marketing', async () => {
            const profileId = await ownProfileId(app, parent);
            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send({ marketingOptIn: false }).expect(200);

            await markAbsent().expect(200);

            expect((await job.notifyAbsences(TODAY)).notified).toBe(1);
        });
    });

    describe('a make-up about to lapse', () => {
        it('reminds the family seven days out, naming the child and the last day', async () => {
            // Earn a credit: announce a future class in time, then be marked absent at it.
            const future = new Date(Date.now() + 2 * 86400000);
            const futureSession = await createClassSession(dataSource, groupId, { date: iso(future) });
            await request(app.getHttpServer())
                .post('/attendance/absences')
                .set('Authorization', parent.auth)
                .send({ childId, classSessionId: futureSession, reason: 'Răcit' })
                .expect(201);
            await request(app.getHttpServer())
                .put(`/attendance/session/${futureSession}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: false })
                .expect(200);

            // The credit expires 30 days after the missed class; the reminder goes out 7 days
            // before that.
            const rows = await dataSource.query<{ expiresOn: string }[]>('SELECT "expiresOn"::text FROM "make_up_credits"');
            const expires = new Date(`${rows[0].expiresOn}T00:00:00`);
            const runOn = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate() - 7);

            const result = await job.remindExpiring(runOn);

            expect(result.notified).toBe(1);
            const mail = await mailTo('parinte.notif@example.com');
            expect(mail[0].subject).toContain('Maria');
            expect(mail[0].bodyText).toContain('/user/absente');
        });

        it('says nothing on any other day', async () => {
            expect((await job.remindExpiring(TODAY)).notified).toBe(0);
        });
    });
});
