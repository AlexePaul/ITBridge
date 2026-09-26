import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';
import { schoolDay } from 'src/common/school-clock';
import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * A family adds and corrects its children from Profil — terms §5 and §6, privacy notice §8.
 *
 * The routes existed; what this suite holds is the rules a second door onto the same rows needs:
 * a name is a name (trimmed, not empty, not longer than its column), a birth date is a day that has
 * already happened on the school's clock, and a parent removes only a row the school has no record
 * of. Every refusal a parent can cause arrives in Romanian, because the portal shows the server's
 * sentence.
 */
describe('Children from the family portal (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let anaProfileId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.copii.portal'));
        ana = await registerUser(app, 'ana.copii.portal');
        anaProfileId = await ownProfileId(app, ana);
    });

    const add = (body: Record<string, unknown>, user: TestUser = ana) =>
        request(app.getHttpServer())
            .post('/children')
            .set('Authorization', user.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-02', parentId: anaProfileId, ...body });

    const correct = (childId: number, body: Record<string, unknown>, user: TestUser = ana) =>
        request(app.getHttpServer()).put(`/children/${childId}`).set('Authorization', user.auth).send(body);

    const remove = (childId: number, user: TestUser = ana) => request(app.getHttpServer()).delete(`/children/${childId}`).set('Authorization', user.auth);

    const childRow = async (childId: number) => {
        const rows = await dataSource.query<{ firstName: string; lastName: string; birthDate: string }[]>(
            `SELECT "firstName", "lastName", to_char("birthDate", 'YYYY-MM-DD') AS "birthDate" FROM children WHERE id = $1`,
            [childId],
        );
        return rows[0];
    };

    const tomorrow = () => toIsoDate(addDays(parseIsoDate(schoolDay(new Date())), 1));

    describe('adding a child', () => {
        it('writes the child on the family, with the names trimmed', async () => {
            const created = await add({ firstName: '  Maria ', lastName: 'Pop  ' }).expect(201);

            expect(await childRow(created.body.id as number)).toEqual({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-02' });
        });

        /** `@IsNotEmpty()` passed "   ", so a name of spaces was stored as the child's name. */
        it('refuses a name of spaces, in Romanian, and writes nothing', async () => {
            const refused = await add({ firstName: '   ' }).expect(400);

            expect((refused.body.details as string[]).join(' ')).toContain('Prenumele copilului trebuie să aibă între 1 și 100 de caractere');
            expect(await dataSource.query('SELECT id FROM children')).toHaveLength(0);
        });

        /** The column is `varchar(100)`: a longer name was the driver's error, not a sentence. */
        it('refuses a name longer than its column, in Romanian', async () => {
            const refused = await add({ lastName: 'P'.repeat(101) }).expect(400);

            expect((refused.body.details as string[]).join(' ')).toContain('Numele de familie al copilului');
        });

        /** A timestamp is not a day; Postgres would have turned it into one on its own clock. */
        it('takes a birth date as a day and nothing else', async () => {
            const refused = await add({ birthDate: '2016-04-02T23:30:00.000Z' }).expect(400);

            expect((refused.body.details as string[]).join(' ')).toContain('Data nașterii nu pare validă');
        });

        it('refuses a birth date after today on the school clock', async () => {
            const refused = await add({ birthDate: tomorrow() }).expect(400);

            expect(refused.body.code).toBe('BIRTH_DATE_IN_FUTURE');
            expect(await dataSource.query('SELECT id FROM children')).toHaveLength(0);
        });

        it("still refuses a child on another family's profile", async () => {
            const other = await registerUser(app, 'bogdan.copii.portal');

            await add({}, other).expect(403);
        });
    });

    describe('correcting a child', () => {
        /** Rectification is the family's (GDPR art. 16), enrolled child or not; the trail keeps the field names. */
        it('lets the family correct the name and birth date of a child the school has enrolled', async () => {
            const childId = (await add({}).expect(201)).body.id as number;
            await enrolInNewGroup(app, admin, [childId]);

            await correct(childId, { firstName: 'Mara', birthDate: '2016-05-02' }).expect(200);

            expect(await childRow(childId)).toEqual({ firstName: 'Mara', lastName: 'Pop', birthDate: '2016-05-02' });
            const trail = await dataSource.query<{ changes: Record<string, unknown> }[]>(
                `SELECT changes FROM audit_log WHERE entity_type = 'Child' AND entity_id = $1 AND action = 'UPDATED'`,
                [childId],
            );
            expect(trail).toHaveLength(1);
            expect(Object.keys(trail[0].changes).sort()).toEqual(['birthDate', 'firstName']);
            expect(JSON.stringify(trail[0].changes)).not.toContain('Mara');
        });

        it('refuses a birth date corrected to a day after today', async () => {
            const childId = (await add({}).expect(201)).body.id as number;

            const refused = await correct(childId, { birthDate: tomorrow() }).expect(400);

            expect(refused.body.code).toBe('BIRTH_DATE_IN_FUTURE');
            expect((await childRow(childId)).birthDate).toBe('2016-04-02');
        });

        it('leaves a field sent empty as it was', async () => {
            const childId = (await add({}).expect(201)).body.id as number;

            await correct(childId, { firstName: '', lastName: 'Popa' }).expect(200);

            expect(await childRow(childId)).toMatchObject({ firstName: 'Maria', lastName: 'Popa' });
        });
    });

    describe('removing a child', () => {
        it('lets the family remove a child it added by mistake', async () => {
            const childId = (await add({}).expect(201)).body.id as number;

            await remove(childId).expect(200);

            expect(await dataSource.query('SELECT id FROM children WHERE id = $1', [childId])).toHaveLength(0);
        });

        /**
         * Terms §5: only the school enrols, moves or withdraws a child. Before, a parent's delete on a
         * child enrolled but not yet marked answered 200 and took the enrolment and the seat with it.
         */
        it('refuses the family a child the school has enrolled, and keeps the enrolment; the office still can', async () => {
            const childId = (await add({}).expect(201)).body.id as number;
            await enrolInNewGroup(app, admin, [childId]);

            const refused = await remove(childId).expect(409);

            expect(refused.body.code).toBe('CHILD_HAS_ENROLMENTS');
            expect(await dataSource.query('SELECT id FROM enrollments WHERE child_id = $1', [childId])).toHaveLength(1);

            await remove(childId, admin).expect(200);
            expect(await dataSource.query('SELECT id FROM children WHERE id = $1', [childId])).toHaveLength(0);
        });

        it('refuses the family a child on a waiting list, and keeps the entry', async () => {
            const placed = (await add({ firstName: 'Ilinca' }).expect(201)).body.id as number;
            const groupId = await enrolInNewGroup(app, admin, [placed], { capacity: 1 });
            const waiting = (await add({ firstName: 'Radu' }).expect(201)).body.id as number;
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId: waiting, groupId }).expect(201);

            const refused = await remove(waiting).expect(409);

            expect(refused.body.code).toBe('CHILD_ON_WAITLIST');
            expect(await dataSource.query('SELECT id FROM waitlist_entries WHERE child_id = $1', [waiting])).toHaveLength(1);
        });

        /** The consent goes with the child (`CASCADE`); the office hears, as it does at an erasure — E07/S2. */
        it('tells the office when a child with a consent in force is removed', async () => {
            const childId = (await add({ firstName: 'Ilinca' }).expect(201)).body.id as number;
            await request(app.getHttpServer()).put(`/privacy/consents/${childId}/promotion`).set('Authorization', ana.auth).expect(200);

            await remove(childId).expect(200);

            const notices = await dataSource.query<{ bodyText: string }[]>(
                `SELECT "bodyText" FROM outbox WHERE "dedupeKey" LIKE 'publication-consent-erased-office:%'`,
            );
            expect(notices).toHaveLength(1);
            expect(notices[0].bodyText).toContain('Ilinca Pop');
            expect(notices[0].bodyText).toContain('odată cu ștergerea copilului din evidență');
        });
    });
});
