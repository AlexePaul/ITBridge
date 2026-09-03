import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, enrolChild, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * What is waiting for somebody to press send, and for how long — E17/S8.
 *
 * The story's risk is that a button does not press itself: *ce depinde de un buton nu pleacă dacă nu
 * apasă nimeni*, and the mitigation it names is visibility rather than discipline. So what these
 * tests are about is the **age**, not the count — a count was already on the screen, and a count
 * cannot tell a busy afternoon from a document nobody has looked at since Tuesday.
 *
 * The grouped query is the reason this suite exists rather than only a unit test: `MIN(createdAt)`
 * per group, with the ungrouped documents counted in the total but absent from the per-group list,
 * is a shape a mocked query builder cannot check.
 */
describe('Pending projects (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.asteptare'));
    });

    const pending = () => request(app.getHttpServer()).get('/projects/pending').set('Authorization', admin.auth);

    /** A group with one enrolled child, returned as the pair the documents hang off. */
    const groupWithChild = async (slug: string, username: string): Promise<{ groupId: number; childId: number }> => {
        const roomId = await createRoom(app, admin, { slug, name: slug });
        const group = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: `Grupa ${slug}` }));
        const groupId = group.body.id as number;

        const parent = await registerUser(app, username);
        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Copil', lastName: 'Test', birthDate: '2016-04-04', parentId: profileId })
            .expect(201);
        const childId = child.body.id as number;
        await enrolChild(app, admin, childId, groupId);

        return { groupId, childId };
    };

    /**
     * A document in `new`, backdated by `daysAgo`.
     *
     * Written straight into the table: the ordinary road in is the agent's ingest endpoint, which
     * hashes bytes and talks to object storage, and none of that is what is under test here.
     */
    const uploaded = async (childId: number, title: string, daysAgo = 0): Promise<number> => {
        const rows = await dataSource.query<{ id: number }[]>(
            `INSERT INTO "projects" ("child_id", "title", "capturedOn", "status", "createdAt", "publicId")
             VALUES ($1, $2, CURRENT_DATE, 'new', now() - ($3 || ' days')::interval, gen_random_uuid())
             RETURNING "id"`,
            [childId, title, daysAgo],
        );
        return rows[0].id;
    };

    describe('the age, which is the part a count cannot say', () => {
        it('reports nothing waiting as a null age rather than as zero days', async () => {
            const res = await pending().expect(200);

            // Null, not 0: "waiting zero days" reads as "something arrived today".
            expect(res.body).toMatchObject({ total: 0, oldestDays: null, byGroup: [] });
        });

        it('counts whole days from the oldest document, not from the newest', async () => {
            const { childId } = await groupWithChild('titan', 'ana.varsta');
            await uploaded(childId, 'De ieri', 1);
            await uploaded(childId, 'De azi', 0);

            const res = await pending().expect(200);

            expect(res.body).toMatchObject({ total: 2, oldestDays: 1 });
        });

        it('publishes the line it draws, so the screen does not hard-code one', async () => {
            const res = await pending().expect(200);
            expect(res.body.staleAfterDays).toBeGreaterThan(0);
        });
    });

    describe('per group', () => {
        it('puts the group that has waited longest first', async () => {
            const fresh = await groupWithChild('proaspat', 'bogdan.proaspat');
            const stale = await groupWithChild('vechi', 'cristina.veche');
            await uploaded(fresh.childId, 'De azi', 0);
            await uploaded(stale.childId, 'De marți', 4);

            const res = await pending().expect(200);

            expect(res.body.byGroup[0]).toMatchObject({ groupId: stale.groupId, count: 1, oldestDays: 4 });
            expect(res.body.byGroup[1]).toMatchObject({ groupId: fresh.groupId, oldestDays: 0 });
        });

        it('leaves out a group with nothing waiting rather than listing it at zero', async () => {
            await groupWithChild('gol', 'dana.gol');
            const busy = await groupWithChild('plin', 'elena.plina');
            await uploaded(busy.childId, 'Ceva', 0);

            const res = await pending().expect(200);

            expect(res.body.byGroup).toHaveLength(1);
            expect(res.body.byGroup[0].groupId).toBe(busy.groupId);
        });

        /**
         * A document whose child sits in no group cannot be pressed from a group screen, so it must
         * not vanish from the total — otherwise the nav badge and the group cards would agree with
         * each other and both be wrong.
         */
        it('counts a document whose child has no group in the total, and in no group', async () => {
            const parent = await registerUser(app, 'florin.fara.grupa');
            const profileId = await ownProfileId(app, parent);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Nerepartizat', lastName: 'Test', birthDate: '2016-04-04', parentId: profileId })
                .expect(201);
            await uploaded(child.body.id as number, 'Orfan', 3);

            const res = await pending().expect(200);

            expect(res.body).toMatchObject({ total: 1, oldestDays: 3, byGroup: [] });
        });
    });

    describe('what stops counting', () => {
        it('drops a document once it has been sent', async () => {
            const { childId } = await groupWithChild('trimis', 'gabi.trimis');
            const id = await uploaded(childId, 'Plecat', 2);
            await dataSource.query(`UPDATE "projects" SET "status" = 'sent' WHERE id = $1`, [id]);

            const res = await pending().expect(200);

            expect(res.body).toMatchObject({ total: 0, oldestDays: null });
        });
    });

    describe('the overview asks rather than counting', () => {
        it('carries the same figures the group screen does, and the age with them', async () => {
            const { childId } = await groupWithChild('acord', 'horia.acord');
            await uploaded(childId, 'De marți', 4);

            const [summary, overview] = await Promise.all([
                pending().expect(200),
                request(app.getHttpServer()).get('/overview').set('Authorization', admin.auth).expect(200),
            ]);

            // One definition of "waiting", asked of one service — E21's rule, and the reason the
            // overview no longer counts these rows itself.
            expect(overview.body.projectsAwaitingSend).toBe(summary.body.total);
            expect(overview.body.projectsAwaitingSendOldestDays).toBe(summary.body.oldestDays);
            expect(overview.body.projectsAwaitingSendOldestDays).toBe(4);
        });
    });

    describe('who may ask', () => {
        it('refuses a parent — it is a backlog of other families documents', async () => {
            const parent = await registerUser(app, 'parinte.curios.asteptare');
            await request(app.getHttpServer()).get('/projects/pending').set('Authorization', parent.auth).expect(403);
        });
    });
});
