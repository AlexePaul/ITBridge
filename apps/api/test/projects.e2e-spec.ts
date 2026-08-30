import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Whose work a parent can see, and what actually leaves the building. E14.
 *
 * The unit specs check the *shape* of the authorization queries. This checks the effect, which is
 * the only thing a family experiences: two real parents, a child each in the same group, and neither
 * of them able to reach the other's documents by any route the API offers — the list, the mailed
 * link, or the download.
 *
 * That is not a theoretical worry here. E14/S7 opens by naming it: a file is saved into a folder,
 * the folder next to it belongs to another child, and the consequence is one family receiving
 * another child's work with their name on it. Everything below is that failure, refused.
 */
describe('Student projects (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let maria: TestUser;
    let elena: TestUser;

    let groupId: number;
    let andreiId: number;
    let ioanaId: number;

    /** A real 1x1 PNG. Small, and genuinely decodable, so the thumbnail pipeline runs for real. */
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

    /** A ZIP header. Used to prove the extension is not what decides the type. */
    const ZIP = Buffer.concat([Buffer.from('504b0304140000000800', 'hex'), Buffer.alloc(64)]);

    async function ingest(childId: number, fileName: string, bytes: Buffer, expected = 201) {
        return request(app.getHttpServer())
            .post('/projects/ingest')
            .set('Authorization', admin.auth)
            .field('childId', String(childId))
            .field('capturedOn', '2026-09-14')
            .attach('file', bytes, fileName)
            .expect(expected);
    }

    async function enrol(parent: TestUser, firstName: string): Promise<number> {
        const parentId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId, firstName, lastName: 'Pop', birthDate: '2015-05-05' })
            .expect(201);
        await request(app.getHttpServer())
            .post(`/children/${child.body.id as number}/groups/${groupId}`)
            .set('Authorization', admin.auth)
            .expect(201);
        return child.body.id as number;
    }

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'adminp'));
        const roomId = await createRoom(app, admin);
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;

        maria = await registerUser(app, 'maria');
        elena = await registerUser(app, 'elena');
        andreiId = await enrol(maria, 'Andrei');
        ioanaId = await enrol(elena, 'Ioana');
    });

    describe('ingestion', () => {
        it('stores a file and puts it in front of an admin, in `nou`', async () => {
            const created = await ingest(andreiId, 'robot.png', PNG);

            expect(created.body.status).toBe('new');
            expect(created.body.child.id).toBe(andreiId);
            // A title rather than an empty string: the file name is a better default than nothing.
            expect(created.body.title).toBe('robot');
        });

        it('answers with the same project when the same file arrives twice', async () => {
            // The normal behaviour of an agent whose connection dropped mid-upload. Without this a
            // retry would produce a second project and, at send time, a second copy in the parent's
            // email.
            const first = await ingest(andreiId, 'robot.png', PNG);
            const second = await ingest(andreiId, 'robot.png', PNG);

            expect(second.body.id).toBe(first.body.id);
            const listed = await request(app.getHttpServer()).get('/projects').set('Authorization', admin.auth).expect(200);
            expect(listed.body).toHaveLength(1);
        });

        it('does not treat two children saving the same starter file as one upload', async () => {
            // A teacher hands the same file to the whole group. Keyed on content alone, the second
            // child's upload would be swallowed and one family would receive nothing.
            const first = await ingest(andreiId, 'start.png', PNG);
            const second = await ingest(ioanaId, 'start.png', PNG);

            expect(second.body.id).not.toBe(first.body.id);
        });

        it('refuses a file whose bytes disagree with its name', async () => {
            await ingest(andreiId, 'captura.png', ZIP, 415);
        });

        it('refuses an extension the school does not accept', async () => {
            await ingest(andreiId, 'setup.exe', PNG, 415);
        });

        it('is closed to parents, however much they would like to add their own', async () => {
            await request(app.getHttpServer())
                .post('/projects/ingest')
                .set('Authorization', maria.auth)
                .field('childId', String(andreiId))
                .field('capturedOn', '2026-09-14')
                .attach('file', PNG, 'robot.png')
                .expect(403);
        });
    });

    describe('what a parent can see', () => {
        it('shows nothing at all before an admin has sent it', async () => {
            // The portal must not be the back door around the screen where somebody looks first.
            await ingest(andreiId, 'robot.png', PNG);

            const mine = await request(app.getHttpServer()).get('/projects').set('Authorization', maria.auth).expect(200);
            expect(mine.body).toEqual([]);
        });

        it('shows each parent only their own child, once sent', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);
            const ioana = await ingest(ioanaId, 'labirint.png', Buffer.concat([PNG, Buffer.from('x')]));

            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number, ioana.body.id as number] })
                .expect(201);

            const mariaSees = await request(app.getHttpServer()).get('/projects').set('Authorization', maria.auth).expect(200);
            const elenaSees = await request(app.getHttpServer()).get('/projects').set('Authorization', elena.auth).expect(200);

            expect((mariaSees.body as { id: number }[]).map((project) => project.id)).toEqual([andrei.body.id]);
            expect((elenaSees.body as { id: number }[]).map((project) => project.id)).toEqual([ioana.body.id]);
        });

        it('answers 403, not 404, when a link belongs to another family', async () => {
            // The resource exists. A silent refusal is harder for a parent to report than an explicit
            // one, and the identifier is random precisely so this cannot be probed by counting.
            const andrei = await ingest(andreiId, 'robot.png', PNG);
            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(201);

            const publicId = andrei.body.publicId as string;

            await request(app.getHttpServer()).get(`/projects/link/${publicId}`).set('Authorization', maria.auth).expect(200);
            await request(app.getHttpServer()).get(`/projects/link/${publicId}`).set('Authorization', elena.auth).expect(403);
        });

        it('refuses to sign a download URL for another family, before anything is signed', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);
            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(201);

            const detail = await request(app.getHttpServer())
                .get(`/projects/link/${andrei.body.publicId as string}`)
                .set('Authorization', maria.auth)
                .expect(200);
            const fileId = (detail.body as { versions: { files: { id: number }[] }[] }).versions[0].files[0].id;

            await request(app.getHttpServer())
                .get(`/projects/${andrei.body.id as number}/files/${fileId}`)
                .set('Authorization', maria.auth)
                .expect(200);
            await request(app.getHttpServer())
                .get(`/projects/${andrei.body.id as number}/files/${fileId}`)
                .set('Authorization', elena.auth)
                .expect(403);
        });

        it('requires an account: no token, no document', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);

            await request(app.getHttpServer())
                .get(`/projects/link/${andrei.body.publicId as string}`)
                .expect(401);
        });
    });

    describe('sending', () => {
        it('sends nothing on a second press', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);

            const first = await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(201);
            const second = await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(201);

            expect(first.body.queued).toHaveLength(1);
            expect(second.body.queued).toHaveLength(0);
            expect(second.body.skipped).toEqual([{ projectId: andrei.body.id, reason: 'already_sent' }]);

            // Filtered by `dedupeKey`, because registering three accounts in `beforeEach` already
            // put six messages in this table — the two E11/S2 gates and the internal nudge, each.
            const queued = await dataSource.query<{ count: string }[]>(`SELECT count(*) FROM "outbox" WHERE "dedupeKey" LIKE 'project-delivery:%'`);
            expect(Number(queued[0].count)).toBe(1);
        });

        it('writes one message per parent, each addressed to exactly one person', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);
            const ioana = await ingest(ioanaId, 'labirint.png', Buffer.concat([PNG, Buffer.from('x')]));

            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number, ioana.body.id as number] })
                .expect(201);

            const messages = await dataSource.query<{ to: string; bodyText: string }[]>(
                `SELECT "to", "bodyText" FROM "outbox" WHERE "dedupeKey" LIKE 'project-delivery:%' ORDER BY "to"`,
            );
            expect(messages).toHaveLength(2);

            const toMaria = messages.find((message) => message.to === 'maria@example.com')!;
            // The assertion the whole epic turns on: nothing another child built is in this email.
            expect(toMaria.bodyText).toContain('Andrei');
            expect(toMaria.bodyText).not.toContain('Ioana');
            expect(toMaria.bodyText).not.toContain('labirint');
        });

        it('is closed to parents', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);

            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', maria.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(403);
        });
    });

    describe('corrections', () => {
        it('moves a document to the right child without re-uploading anything', async () => {
            const misfiled = await ingest(andreiId, 'robot.png', PNG);

            const moved = await request(app.getHttpServer())
                .put(`/projects/${misfiled.body.id as number}/reassign`)
                .set('Authorization', admin.auth)
                .send({ childId: ioanaId })
                .expect(200);

            expect(moved.body.child.id).toBe(ioanaId);

            // And the consequence that matters: it is now Elena's to see, and not Maria's.
            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [misfiled.body.id as number] })
                .expect(201);

            const mariaSees = await request(app.getHttpServer()).get('/projects').set('Authorization', maria.auth).expect(200);
            const elenaSees = await request(app.getHttpServer()).get('/projects').set('Authorization', elena.auth).expect(200);
            expect(mariaSees.body).toEqual([]);
            expect(elenaSees.body).toHaveLength(1);
        });

        it('lets a parent report a document, and nothing more', async () => {
            const andrei = await ingest(andreiId, 'robot.png', PNG);
            await request(app.getHttpServer())
                .post('/projects/send')
                .set('Authorization', admin.auth)
                .send({ projectIds: [andrei.body.id as number] })
                .expect(201);
            const publicId = andrei.body.publicId as string;

            await request(app.getHttpServer())
                .post(`/projects/link/${publicId}/report`)
                .set('Authorization', maria.auth)
                .send({ note: 'Nu pare al lui Andrei' })
                .expect(201);

            // The report reaches the office. The document itself is untouched — a parent deleting one
            // would need a new entry in `PARENT_WRITABLE`, which is what that list is for.
            const internal = await dataSource.query<{ subject: string }[]>(`SELECT "subject" FROM "outbox" WHERE "subject" LIKE 'Sesizare%'`);
            expect(internal).toHaveLength(1);

            await request(app.getHttpServer())
                .delete(`/projects/${andrei.body.id as number}`)
                .set('Authorization', maria.auth)
                .expect(403);
            await request(app.getHttpServer())
                .put(`/projects/${andrei.body.id as number}/reassign`)
                .set('Authorization', maria.auth)
                .send({ childId: ioanaId })
                .expect(403);
        });
    });

    describe('the agent', () => {
        it('mirrors the groups and children it should create folders for', async () => {
            const mirror = await request(app.getHttpServer()).get('/agent/mirror').set('Authorization', admin.auth).expect(200);

            const children = (mirror.body as { locations: { groups: { children: { id: number }[] }[] }[] }).locations[0].groups[0].children;
            // The id travels with the name because the folder is named after both: two children with
            // the same first name in one group is ordinary, and a renamed folder must not orphan the
            // files in it.
            expect(children.map((child) => child.id).sort()).toEqual([andreiId, ioanaId].sort());
        });

        it('records a file it could not place, once however many times it rescans', async () => {
            const stray = { groupId, relativePath: 'Drumul Taberei/Scratch Începători/proiect.sb3', fileName: 'proiect.sb3', reason: 'group_root' };

            await request(app.getHttpServer()).post('/agent/unassigned').set('Authorization', admin.auth).send(stray).expect(201);
            await request(app.getHttpServer()).post('/agent/unassigned').set('Authorization', admin.auth).send(stray).expect(201);

            const waiting = await request(app.getHttpServer()).get('/agent/unassigned').set('Authorization', admin.auth).expect(200);
            expect(waiting.body).toHaveLength(1);
            expect(waiting.body[0].reason).toBe('group_root');
        });

        it('names the children who have nothing yet, as a nudge and never as attendance', async () => {
            // A read, deliberately. E14 is explicit that attendance is not derived from files — a
            // document proves somebody saved a file, not that a child sat in a chair — but the
            // reverse direction is useful while the class is still in the room.
            await ingest(andreiId, 'robot.png', PNG);

            const missing = await request(app.getHttpServer())
                .get(`/projects/group/${groupId}/missing`)
                .query({ on: '2026-09-14' })
                .set('Authorization', admin.auth)
                .expect(200);

            expect((missing.body as { id: number }[]).map((child) => child.id)).toEqual([ioanaId]);
        });

        it('makes silence distinguishable from a quiet day', async () => {
            await request(app.getHttpServer())
                .post('/agent/heartbeat')
                .set('Authorization', admin.auth)
                .send({ agentName: 'birou', watchedRoot: 'P:\\Proiecte', pendingFiles: 0 })
                .expect(201);

            const statuses = await request(app.getHttpServer()).get('/agent/status').set('Authorization', admin.auth).expect(200);
            expect(statuses.body).toHaveLength(1);
            expect(statuses.body[0].agentName).toBe('birou');
        });

        it('keeps a parent away from all of it', async () => {
            await request(app.getHttpServer()).get('/agent/mirror').set('Authorization', maria.auth).expect(403);
            await request(app.getHttpServer()).get('/agent/status').set('Authorization', maria.auth).expect(403);
        });
    });
});
