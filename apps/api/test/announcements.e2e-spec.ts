import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, createRoom, enrolChild, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Announcements — E17/S7, against the real application and a real database.
 *
 * The unit tests cover the rules; what only shows up here is whether they survive contact with
 * Postgres — the unique index that refuses a second press, the foreign key that makes the delivery
 * report a live count, and the audience query, which is a four-table join whose shape a mocked
 * query builder cannot check.
 */
describe('Announcements (e2e)', () => {
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
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.anunturi'));
    });

    const post = (path: string, body: Record<string, unknown>, user: TestUser = admin) =>
        request(app.getHttpServer()).post(path).set('Authorization', user.auth).send(body);

    /** A family with `count` children, all in the same group. Returns the parent's profile id. */
    const familyIn = async (username: string, groupId: number, count = 1): Promise<number> => {
        const parent = await registerUser(app, username);
        const profileId = await ownProfileId(app, parent);
        for (let index = 0; index < count; index += 1) {
            const child = await post('/children', { firstName: `Copil${index}`, lastName: 'Test', birthDate: '2016-05-04', parentId: profileId }).expect(201);
            await enrolChild(app, admin, child.body.id as number, groupId);
        }
        return profileId;
    };

    const aGroup = async (overrides: { slug?: string; name?: string } = {}): Promise<{ groupId: number; locationId: number }> => {
        const roomId = await createRoom(app, admin, { slug: overrides.slug ?? 'titan', name: overrides.name ?? 'Sediul Titan' });
        const room = await request(app.getHttpServer()).get(`/rooms/${roomId}`).set('Authorization', admin.auth).expect(200);
        const group = await post('/groups', groupBody(roomId, { name: `Scratch ${overrides.slug ?? 'titan'}` })).expect(201);
        return { groupId: group.body.id as number, locationId: (room.body.location as { id: number }).id };
    };

    const dayOff = { subject: 'Sâmbătă e zi liberă', body: 'Sâmbătă nu se țin cursuri. Orele se reiau luni, la orele obișnuite.' };

    describe('the audience', () => {
        it('reaches every family of a group, once each, however many children they have', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.anunt', groupId, 2);
            await familyIn('bogdan.anunt', groupId, 1);

            const res = await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);

            expect(res.body.queued).toBe(2);
            expect(res.body.audienceLabel).toContain('Scratch');
        });

        it('reaches every family at a location, and nobody at the other one', async () => {
            const here = await aGroup({ slug: 'titan', name: 'Sediul Titan' });
            const elsewhere = await aGroup({ slug: 'drumul-taberei', name: 'Drumul Taberei' });
            await familyIn('ana.titan', here.groupId);
            await familyIn('bogdan.taberei', elsewhere.groupId);

            const res = await post('/announcements', { audience: 'location', locationId: here.locationId, ...dayOff }).expect(201);

            expect(res.body.queued).toBe(1);
            const messages = await dataSource.query<{ to: string }[]>(`SELECT "to" FROM outbox WHERE "announcement_id" = $1`, [res.body.id]);
            expect(messages.map((row) => row.to)).toEqual(['ana.titan@example.com']);
        });

        it('leaves out a family whose child is in no group — a day off does not concern them yet', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.grupa', groupId);
            // Registered, approved, and with no child placed anywhere.
            await registerUser(app, 'bogdan.fara.grupa');

            const res = await post('/announcements', { audience: 'all', ...dayOff }).expect(201);

            expect(res.body.queued).toBe(1);
        });
    });

    describe('the preview', () => {
        it('renders the real message and breaks the audience down', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.preview', groupId);

            const res = await post('/announcements/preview', { audience: 'group', groupId, ...dayOff }).expect(201);

            expect(res.body.bodyText).toContain('Sâmbătă nu se țin cursuri.');
            expect(res.body.bodyHtml).toContain('<p style=');
            expect(res.body.recipients).toMatchObject({ total: 1, deliverable: 1, noAddress: 0 });
            expect(res.body.warnings).toEqual([]);
        });

        it('writes nothing — a preview that queued a message would be a send with a softer name', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.preview.gol', groupId);

            await post('/announcements/preview', { audience: 'group', groupId, ...dayOff }).expect(201);

            const before = await request(app.getHttpServer()).get('/announcements').set('Authorization', admin.auth).expect(200);
            expect(before.body).toEqual([]);
        });
    });

    describe('the test send', () => {
        it('goes to the admin who asked for it, with the subject marked', async () => {
            const res = await post('/announcements/test', { audience: 'all', ...dayOff }).expect(201);

            expect(res.body.to).toBe('admin.anunturi@example.com');
            // Newest first: the admin's own registration already put a confirmation mail at that
            // address, which is the row an unordered query would hand back.
            const rows = await dataSource.query<{ subject: string }[]>(`SELECT subject FROM outbox WHERE "to" = $1 ORDER BY id DESC`, [
                'admin.anunturi@example.com',
            ]);
            expect(rows[0].subject).toBe('[TEST] Sâmbătă e zi liberă');
        });

        it('is not an announcement: nothing appears in the record', async () => {
            await post('/announcements/test', { audience: 'all', ...dayOff }).expect(201);

            const res = await request(app.getHttpServer()).get('/announcements').set('Authorization', admin.auth).expect(200);
            expect(res.body).toEqual([]);
        });
    });

    describe('the second press', () => {
        it('is refused, so a slow connection cannot mail a group twice', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.dubla', groupId);

            await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);
            const again = await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(409);

            expect(again.body.code).toBe('ANNOUNCEMENT_ALREADY_SENT');
            const count = await dataSource.query<{ count: string }[]>('SELECT COUNT(*) FROM outbox WHERE "announcement_id" IS NOT NULL');
            expect(Number(count[0].count)).toBe(1);
        });

        it('lets a corrected wording through — that one is a different message', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.corectura', groupId);

            await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);
            await post('/announcements', { audience: 'group', groupId, subject: dayOff.subject, body: 'Corectură: orele se reiau marți.' }).expect(201);
        });
    });

    describe('a text that names a child', () => {
        it('is refused once, then goes through when the admin confirms', async () => {
            const { groupId } = await aGroup();
            const profileId = await familyIn('ana.nume', groupId);
            await post('/children', { firstName: 'Ștefan', lastName: 'Popescu', birthDate: '2015-02-02', parentId: profileId }).expect(201);

            const body = { audience: 'group' as const, groupId, subject: dayOff.subject, body: 'Ne vedem în Sala Ștefan cel Mare.' };
            const refused = await post('/announcements', body).expect(409);
            expect(refused.body.code).toBe('ANNOUNCEMENT_NAMES_A_CHILD');

            await post('/announcements', { ...body, acknowledgeWarnings: true }).expect(201);
        });
    });

    describe('the delivery report', () => {
        it('counts the announcement`s own messages, live, and lists them', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.raport', groupId);
            const sent = await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);

            const list = await request(app.getHttpServer()).get('/announcements').set('Authorization', admin.auth).expect(200);
            expect(list.body[0]).toMatchObject({ recipientCount: 1, deliveries: { pending: 1, sent: 0, failed: 0, undeliverable: 0 } });
            expect(list.body[0].sentByUsername).toBe('admin.anunturi');

            const detail = await request(app.getHttpServer()).get(`/announcements/${sent.body.id}`).set('Authorization', admin.auth).expect(200);
            expect(detail.body.messages).toHaveLength(1);
            expect(detail.body.messages[0].to).toBe('ana.raport@example.com');
        });

        it('shows a family with no address as undeliverable rather than leaving them out', async () => {
            const { groupId } = await aGroup();
            const profileId = await familyIn('ana.fara.adresa', groupId);
            await dataSource.query('UPDATE profiles SET email = NULL WHERE id = $1', [profileId]);

            const res = await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);

            expect(res.body.undeliverable).toHaveLength(1);
            expect(res.body.undeliverable[0].reason).toBe('no_address');
            const detail = await request(app.getHttpServer()).get(`/announcements/${res.body.id}`).set('Authorization', admin.auth).expect(200);
            expect(detail.body.deliveries).toMatchObject({ pending: 0, undeliverable: 1 });
        });
    });

    describe('the marketing preference', () => {
        it('is what a marketing announcement obeys, while an operational one reaches everybody', async () => {
            const { groupId } = await aGroup();
            await familyIn('ana.marketing', groupId);

            const marketing = await post('/announcements', {
                audience: 'group',
                groupId,
                kind: 'marketing',
                subject: 'Tabăra de vară',
                body: 'Se deschid înscrierile la tabăra de vară.',
            }).expect(201);
            expect(marketing.body.queued).toBe(0);
            expect(marketing.body.declined).toBe(1);

            const operational = await post('/announcements', { audience: 'group', groupId, ...dayOff }).expect(201);
            expect(operational.body.queued).toBe(1);
        });
    });

    describe('who may use any of it', () => {
        it('refuses a parent — the record is a list of who else was written to', async () => {
            const parent = await registerUser(app, 'parinte.curios');

            await post('/announcements', { audience: 'all', ...dayOff }, parent).expect(403);
            await request(app.getHttpServer()).get('/announcements').set('Authorization', parent.auth).expect(403);
        });
    });
});
