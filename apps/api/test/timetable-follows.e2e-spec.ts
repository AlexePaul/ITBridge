import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { schoolDay } from 'src/common/school-clock';
import { Weekday } from 'src/enum/weekday.enum';
import { addDays, isoWeekOf, isoWeekday, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * The timetable after a class moves, or its group does — the review of 25 September 2026.
 *
 * Generation was idempotent on the day and on nothing else, so a class moved off its day left the
 * day free and the next run wrote it again; and a group moved to another day kept its old classes
 * while the next run wrote the new ones beside them. Either way the week had two classes, and the
 * phantom one was sold on `/proba`, offered for replacements and reported unmarked.
 */
describe('The timetable follows moves (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;

    /** Mondays in a far week, which is `groupBody`'s weekday — for the tests that pin their dates. */
    const MONDAY = '2027-04-05';
    const NEXT_MONDAY = '2027-04-12';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.orar'));
        parent = await registerUser(app, 'parinte.orar');
        const roomId = await createRoom(app, admin, { slug: 'orar-loc', name: 'Orar' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
    });

    const generate = (body: Record<string, unknown>) =>
        request(app.getHttpServer())
            .post('/class-sessions/generate')
            .set('Authorization', admin.auth)
            .send({ groupId, ...body })
            .expect(201);

    const move = (id: number, date: string) =>
        request(app.getHttpServer()).put(`/class-sessions/${id}/move`).set('Authorization', admin.auth).send({ date, reason: 'Sala e ocupată' }).expect(200);

    const days = async (): Promise<{ id: number; date: string }[]> =>
        dataSource.query<{ id: number; date: string }[]>('SELECT id, "date"::text AS date FROM class_sessions WHERE group_id = $1 ORDER BY "date"', [groupId]);

    it('does not write a class again for the day it was moved off', async () => {
        await generate({ from: MONDAY, weeks: 2 });
        const [first] = await days();
        await move(first.id, '2027-04-06');

        await generate({ from: MONDAY, weeks: 2 });

        expect((await days()).map((row) => row.date)).toEqual(['2027-04-06', NEXT_MONDAY]);
    });

    /**
     * A move into another week is the case a "one class a week" rule would have got wrong: that
     * week still has its own class, and the week the class left has none.
     */
    it('leaves the week a class left empty, and the week it went to with its own class too', async () => {
        await generate({ from: MONDAY, weeks: 2 });
        const [first] = await days();
        await move(first.id, '2027-04-14');

        await generate({ from: MONDAY, weeks: 2 });

        expect((await days()).map((row) => row.date)).toEqual([NEXT_MONDAY, '2027-04-14']);
    });

    describe('a group moved to another day', () => {
        const tomorrow = toIsoDate(addDays(parseIsoDate(schoolDay(new Date())), 1));
        /** Monday a week from now: from there on every week is wholly in the future. */
        const fromNextWeek = toIsoDate(addDays(parseIsoDate(isoWeekOf(tomorrow).from), 7));

        const futureDays = async (): Promise<string[]> => (await days()).map((row) => row.date).filter((date) => date >= fromNextWeek);

        beforeEach(async () => {
            const profileId = await ownProfileId(app, parent);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ firstName: 'Maria', lastName: 'Orar', birthDate: '2016-04-02', parentId: profileId })
                .expect(201);
            await request(app.getHttpServer())
                .post(`/children/${child.body.id as number}/groups/${groupId}`)
                .set('Authorization', admin.auth)
                .expect(201);
            await generate({ weeks: 4 });
            await dataSource.query('DELETE FROM outbox');
        });

        it('takes its coming classes along, one a week, and tells each family once', async () => {
            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ weekday: 3 }).expect(200);

            const coming = await futureDays();
            expect(coming.length).toBeGreaterThan(0);
            // Every class from next week on is a Wednesday, and no week holds two.
            expect(coming.every((date) => isoWeekday(parseIsoDate(date)) === Weekday.WEDNESDAY)).toBe(true);
            expect(new Set(coming.map((date) => isoWeekOf(date).from)).size).toBe(coming.length);

            const mail = await dataSource.query<{ subject: string }[]>('SELECT subject FROM outbox');
            expect(mail).toEqual([{ subject: expect.stringContaining('își schimbă programul') }]);
        });

        /** The office moved that one on purpose; the group's change does not undo it. */
        it('leaves a class the office moved where it was, without a second one beside it', async () => {
            const handMoved = (await days()).find((row) => row.date >= fromNextWeek);
            if (!handMoved) throw new Error('Expected a class from next week on');
            const tuesday = toIsoDate(addDays(parseIsoDate(handMoved.date), 1));
            await move(handMoved.id, tuesday);

            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ weekday: 3 }).expect(200);

            const inThatWeek = (await days()).filter((row) => isoWeekOf(row.date).from === isoWeekOf(tuesday).from);
            expect(inThatWeek).toEqual([{ id: handMoved.id, date: tuesday }]);
        });

        it('stays put when only the name changes', async () => {
            const before = await futureDays();

            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ name: 'Scratch Avansați' }).expect(200);

            expect(await futureDays()).toEqual(before);
            expect(await dataSource.query('SELECT 1 FROM outbox')).toEqual([]);
        });
    });
});
