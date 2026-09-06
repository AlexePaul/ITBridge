import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, holdSessions, ownProfileId, promoteToAdmin, registerUser, teachingMondays, TestUser, truncateAll } from './helpers';

/**
 * The preference, and the promise around it — E17/S4.
 *
 * The acceptance criterion is not really about the switch; it is about everything the switch does
 * **not** reach. So most of what follows asserts that a family who refused marketing still gets
 * what the school owes them.
 */
describe('Marketing preference (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.pref'));
        parent = await registerUser(app, 'parinte.pref');
        profileId = await ownProfileId(app, parent);
    });

    /** `GET /profiles` narrows to the caller's own for a parent, so the first row is theirs. */
    const myProfile = async () => {
        const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', parent.auth).expect(200);
        return res.body[0] as { marketingOptIn: boolean };
    };

    const setPreference = (value: boolean, user: TestUser = parent) =>
        request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', user.auth).send({ marketingOptIn: value });

    describe('the default', () => {
        it('a new family is opted out — consent nobody gave is not consent', async () => {
            expect((await myProfile()).marketingOptIn).toBe(false);
        });
    });

    describe('setting it', () => {
        it('a parent turns it on and off from their own settings', async () => {
            await setPreference(true).expect(200);
            expect((await myProfile()).marketingOptIn).toBe(true);

            await setPreference(false).expect(200);
            expect((await myProfile()).marketingOptIn).toBe(false);
        });

        it("refuses to set another family's preference", async () => {
            const other = await registerUser(app, 'alta.familie.pref');

            // 401, not 403 — and that is `ProfileService` throwing `UnauthorizedException` for a
            // caller who *is* authenticated and merely has no business with this row. It predates
            // E17/S4 and is asserted here as the behaviour that exists, not as the behaviour that
            // is right; changing it is a separate change with its own blast radius.
            await setPreference(true, other).expect(401);
        });
    });

    describe('what the switch does not reach', () => {
        it('a family that refused marketing still gets the account mail the school owes them', async () => {
            // Registered inactive, so the confirmation link is still outstanding and resending it
            // is a live transactional act rather than a 400.
            const unconfirmed = await registerUser(app, 'neconfirmat.pref', 'parola123', { active: false });
            const theirProfile = await ownProfileId(app, unconfirmed);
            await request(app.getHttpServer())
                .put(`/profiles/${theirProfile}`)
                .set('Authorization', unconfirmed.auth)
                .send({ marketingOptIn: false })
                .expect(200);

            await request(app.getHttpServer()).post('/auth/resend-confirmation').set('Authorization', unconfirmed.auth).expect(200);

            const rows = await dataSource.query<{ n: number }[]>(
                `SELECT count(*)::int AS n FROM "outbox" WHERE "to" = $1 AND "subject" LIKE 'Confirmă adresa%'`,
                ['neconfirmat.pref@example.com'],
            );
            // Two: the one from registration, and the one just asked for. The preference did not
            // come into it at any point — nothing transactional consults it.
            expect(rows[0].n).toBe(2);
        });

        it('and still gets an invoice', async () => {
            await setPreference(false).expect(200);

            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            // Enrolled, and present at four April Mondays: since E15/S9 the invoice is counted from
            // the registers, so the month has to have been held for there to be one.
            const childId = child.body.id as number;
            const groupId = await enrolInNewGroup(app, admin, [childId], {}, { startDate: '2026-01-01' });
            await holdSessions(app, dataSource, admin, groupId, [childId], teachingMondays('2026-04').slice(0, 4));

            const res = await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({ monthIssued: '2026-04', dateIssued: '2026-04-01' })
                .expect(201);

            // The invoice is issued regardless: it is the contract, not a message the family may
            // decline.
            expect(res.body.issued).toHaveLength(1);
            expect(Number(res.body.issued[0].amount)).toBe(350);
        });
    });
});
