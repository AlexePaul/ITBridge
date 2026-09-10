import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The password hash never leaves the API.
 *
 * `User.passwordHash` is `select: false`, so a join that pulls an account onto a child, a profile
 * or a payment cannot carry the hash along — it used to, and two routes did: the saved absence
 * notice, and `PUT /children/:childId`, which handed a parent their own hash. This suite walks the
 * routes with an account one join away and reads the whole body, because the shape of each query
 * is no longer the only thing standing in the way and the column guard must actually hold over
 * HTTP. The last two cases are the other half of the guarantee: the one reader, `login`, still
 * gets the hash it needs.
 */
describe('The password hash never leaves the API (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let anaProfileId: number;
    let childId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.hash'));
        ana = await registerUser(app, 'ana.hash');
        anaProfileId = await ownProfileId(app, ana);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', ana.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: anaProfileId })
            .expect(201);
        childId = child.body.id as number;
    });

    const expectNoHash = (body: unknown) => {
        expect(JSON.stringify(body)).not.toContain('passwordHash');
    };

    describe('a child, edited', () => {
        it('gives the parent their child back, not their account', async () => {
            const res = await request(app.getHttpServer()).put(`/children/${childId}`).set('Authorization', ana.auth).send({ firstName: 'Anca' }).expect(200);

            expect(res.body.firstName).toBe('Anca');
            expect(res.body.parent).toMatchObject({ id: anaProfileId });
            // The account was loaded for the ownership check and is not part of the answer — it
            // carries the admin's rejection note, and carried the hash.
            expect(res.body.parent.user).toBeUndefined();
            expectNoHash(res.body);
        });

        it("gives an admin the child, not the family's account", async () => {
            const res = await request(app.getHttpServer())
                .put(`/children/${childId}`)
                .set('Authorization', admin.auth)
                .send({ lastName: 'Popescu' })
                .expect(200);

            expect(res.body.parent.user).toBeUndefined();
            expectNoHash(res.body);
        });

        it('lists children with the parent and without the account', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', admin.auth).expect(200);

            expect(res.body).toHaveLength(1);
            expectNoHash(res.body);
        });
    });

    describe('accounts, read by an admin', () => {
        it('the list carries every account and no hash', async () => {
            const res = await request(app.getHttpServer()).get('/users').set('Authorization', admin.auth).expect(200);

            const usernames = (res.body as { username: string }[]).map((row) => row.username).sort();
            expect(usernames).toEqual(['admin.hash', 'ana.hash']);
            expectNoHash(res.body);
        });

        it('one account, by id', async () => {
            const res = await request(app.getHttpServer()).get(`/users/${ana.userId}`).set('Authorization', admin.auth).expect(200);

            expect(res.body.username).toBe('ana.hash');
            expectNoHash(res.body);
        });

        it('the accounts still waiting for a profile', async () => {
            const res = await request(app.getHttpServer()).get('/users/without-profile').set('Authorization', admin.auth).expect(200);

            expectNoHash(res.body);
        });

        it('the profiles, joined to their accounts for the list', async () => {
            // `ProfileService.findAll` joins the account and then unsets it, keeping only `hasUser`;
            // the join is the part that would have carried the hash.
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', admin.auth).expect(200);

            expect(res.body).toHaveLength(2);
            expect((res.body as { hasUser: boolean }[]).every((row) => row.hasUser)).toBe(true);
            expectNoHash(res.body);
        });
    });

    describe("a project, opened from the link in the parent's email", () => {
        /**
         * `PROJECT_RELATIONS` pulls the account so the ownership branches can compare it to the
         * caller, and every answer used to hand it straight back — including the one route a parent
         * is actually mailed. The hash cannot ride along since the column became `select: false`,
         * but `rejectionReason` still could, and `user.entity.ts` says that note is for admins only.
         */
        const expectNoAccount = (project: { child: { parent: { user?: unknown } } }) => {
            expect(project.child.parent).toBeDefined();
            expect(project.child.parent.user).toBeUndefined();
        };

        it('gives the parent the document, not their own account row', async () => {
            const created = await request(app.getHttpServer())
                .post('/projects')
                .set('Authorization', admin.auth)
                .send({
                    childId,
                    capturedOn: '2026-09-14',
                    title: 'Orașul din Tinkercad',
                    links: [{ label: 'Macheta', url: 'https://www.tinkercad.com/things/abc123' }],
                })
                .expect(201);

            // The admin's own answer comes through `requireProject`, which carried it too.
            expectNoAccount(created.body);
            expectNoHash(created.body);

            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [created.body.id as number] })
                .expect(201);

            const opened = await request(app.getHttpServer())
                .get(`/projects/link/${created.body.publicId as string}`)
                .set('Authorization', ana.auth)
                .expect(200);

            expect(opened.body.title).toBe('Orașul din Tinkercad');
            expectNoAccount(opened.body);
            expectNoHash(opened.body);
        });

        it('and does not carry it on the second ingest of a file already on file', async () => {
            // A real 1x1 PNG, so the ingest runs for real. The second pass takes `ingest`'s fast
            // path, which answers with what it finds instead of going round through
            // `requireProject` — the one route on this service that could still have carried it.
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
            const upload = () =>
                request(app.getHttpServer())
                    .post('/projects/ingest')
                    .set('Authorization', admin.auth)
                    .field('childId', String(childId))
                    .field('capturedOn', '2026-09-14')
                    .attach('file', png, 'macheta.png')
                    .expect(201);

            const first = await upload();
            const again = await upload();

            expect(again.body.id).toBe(first.body.id);
            expectNoAccount(again.body);
            expectNoHash(again.body);
        });
    });

    describe('the one reader', () => {
        it('login still finds the hash it needs to compare', async () => {
            const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana.hash', password: 'parola123' }).expect(200);

            expect(res.body.accessToken).toBeDefined();
            expectNoHash(res.body);
        });

        it('and still refuses a wrong password — the hash was read, not skipped', async () => {
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana.hash', password: 'gresita123' }).expect(401);
        });
    });
});
