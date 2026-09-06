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

    /**
     * A class in the week that has not started yet — the Tuesday of next week.
     *
     * The deadline of E12/S3 is Monday noon of the class's own week, so "a couple of days ahead"
     * is only in time on some days of the week: run on a Wednesday, a class two days out is a
     * Friday whose Monday is already gone, no credit is earned and the whole suite fails for a
     * reason that has nothing to do with what it tests. Next week's Monday is always still ahead.
     */
    const nextWeekTuesday = () => {
        const monday = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
        // `getDay()` is 0 on Sunday; the Monday that opens the *next* week is 8 days on from it.
        const toNextMonday = monday.getDay() === 0 ? 1 : 8 - monday.getDay();
        monday.setDate(monday.getDate() + toNextMonday);
        return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1);
    };

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

    /** Announce a future class in time, then be marked absent at it — the only way to earn one. */
    const earnCredit = async () => {
        const session = await createClassSession(dataSource, groupId, { date: iso(nextWeekTuesday()) });
        await request(app.getHttpServer())
            .post('/attendance/absences')
            .set('Authorization', parent.auth)
            .send({ childId, classSessionId: session, reason: 'Răcit' })
            .expect(201);
        await request(app.getHttpServer())
            .put(`/attendance/session/${session}/child/${childId}`)
            .set('Authorization', admin.auth)
            .send({ present: false })
            .expect(200);
        return session;
    };

    describe('a make-up just earned', () => {
        it('reaches the family the evening the register was taken', async () => {
            await earnCredit();

            const result = await job.notifyCreditsEarned(TODAY);

            expect(result.notified).toBe(1);
            const mail = await mailTo('parinte.notif@example.com');
            expect(mail[0].subject).toContain('recuperare');
            expect(mail[0].bodyText).toContain('Maria');
            expect(mail[0].bodyText).toContain('/user/absente');
        });

        it('says nothing about an absence that earned nothing', async () => {
            // No notice, so no credit — and, since E12/S7 was revised, no message either. The old
            // same-day absence mail fired here, and this is the case where a mistyped register
            // frightened a family for nothing.
            await markAbsent().expect(200);

            expect((await job.notifyCreditsEarned(TODAY)).notified).toBe(0);
        });

        it('a mark corrected back to present takes the credit away, so nothing is written', async () => {
            const session = await earnCredit();
            await request(app.getHttpServer())
                .put(`/attendance/session/${session}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);

            // The correction lands before the evening run, which is the window the old message did
            // not have: it had already gone out.
            expect((await job.notifyCreditsEarned(TODAY)).notified).toBe(0);
        });

        it('writes once, however many times the job runs that evening', async () => {
            await earnCredit();

            await job.notifyCreditsEarned(TODAY);
            await job.notifyCreditsEarned(TODAY);

            const mail = await mailTo('parinte.notif@example.com');
            expect(mail.filter((row) => row.subject.includes('recuperare')).length).toBe(1);
        });

        it('goes out even to a family that refused marketing — it is not marketing', async () => {
            const profileId = await ownProfileId(app, parent);
            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send({ marketingOptIn: false }).expect(200);

            await earnCredit();

            expect((await job.notifyCreditsEarned(TODAY)).notified).toBe(1);
        });
    });
});
