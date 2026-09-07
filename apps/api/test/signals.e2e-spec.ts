import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import {
    createRoom,
    createTestApp,
    enrolChild,
    groupBody,
    holdSessions,
    ownProfileId,
    promoteToAdmin,
    registerUser,
    teachingMondays,
    TestUser,
    truncateAll,
} from './helpers';

/**
 * The early signals — E21/S7, against a real database.
 *
 * As with the other reports, the assertions are about agreement and timing rather than
 * arithmetic: the same history is asked about on two different days, and the list has to say
 * something on the later one and nothing on the earlier — which is the story's own acceptance,
 * "o scădere de prezență generează alertă înainte de abandon, verificat retroactiv".
 */
describe('Early signals (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parentA: TestUser;
    let parentB: TestUser;
    let profileA: number;
    let profileB: number;
    let ana: number;
    let bogdan: number;
    let bianca: number;
    let groupId: number;

    /** The Mondays of the six weeks the histories below are written on. */
    const MONDAYS = ['2026-02-16', '2026-02-23', '2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'];

    const http = () => request(app.getHttpServer());

    const newChild = async (parent: TestUser, profileId: number, firstName: string) => {
        const child = await http()
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName, lastName: 'Test', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        return child.body.id as number;
    };

    const signalsAt = (asOf?: string) =>
        http()
            .get(asOf ? `/reports/signals?asOf=${asOf}` : '/reports/signals')
            .set('Authorization', admin.auth)
            .expect(200);

    const mark = (sessionId: number, childId: number, present: boolean) =>
        http().put(`/attendance/session/${sessionId}/child/${childId}`).set('Authorization', admin.auth).send({ present }).expect(200);

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.semnale'));
        parentA = await registerUser(app, 'familia.a');
        parentB = await registerUser(app, 'familia.b');
        profileA = await ownProfileId(app, parentA);
        profileB = await ownProfileId(app, parentB);
        ana = await newChild(parentA, profileA, 'Ana');
        bogdan = await newChild(parentB, profileB, 'Bogdan');
        bianca = await newChild(parentB, profileB, 'Bianca');

        const roomId = await createRoom(app, admin);
        const group = await http().post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        for (const childId of [ana, bogdan, bianca]) {
            await enrolChild(app, admin, childId, groupId, { startDate: '2026-01-01' });
        }
    });

    it('is for admins only, and refuses a day that is not a day', async () => {
        await http().get('/reports/signals').set('Authorization', parentA.auth).expect(403);
        await http().get('/reports/signals').expect(401);
        await http().get('/reports/signals?asOf=2026-13-01').set('Authorization', admin.auth).expect(400);
        await http().get('/reports/signals?asOf=2026-02-30').set('Authorization', admin.auth).expect(400);
    });

    it('starts empty on attendance and money, and already names the group that is under-filled', async () => {
        const res = await signalsAt();

        expect(res.body.children).toEqual([]);
        expect(res.body.groups).toEqual([]);
        expect(res.body.families).toEqual([]);
        // Three of ten seats: the occupancy report's own line, repeated here.
        expect(res.body.underfilled).toEqual([expect.objectContaining({ groupId, taken: 3, capacity: 10, fillRate: 0.3 })]);
        expect(res.body.totals).toEqual({ children: 0, groups: 0, families: 0, underfilled: 1, all: 1 });
        expect(res.body.basis).toMatchObject({ marksRead: 0, sessionsWithRegister: 0, occupancyAsOfToday: true });
        expect(res.body.thresholds).toMatchObject({ childAbsenceStreak: 3, familyOverdueInvoices: 2, occupancy: 0.6 });
    });

    describe('a child who stops coming', () => {
        it('is flagged after the third absence in a row, and would not have been a week earlier', async () => {
            const sessions = await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], MONDAYS.slice(2));
            // Ana comes on 2 March, then misses the 9th, the 16th and the 23rd.
            await mark(sessions[1], ana, false);
            await mark(sessions[2], ana, false);
            await mark(sessions[3], ana, false);

            const later = await signalsAt('2026-03-24');
            expect(later.body.children).toEqual([
                expect.objectContaining({
                    childId: ana,
                    childName: 'Ana Test',
                    groupId,
                    streak: 3,
                    since: '2026-03-09',
                    lastMarkOn: '2026-03-23',
                    announced: 0,
                }),
            ]);
            expect(later.body.children[0]).toMatchObject({ parentId: profileA });

            // Read as of the 17th, only two absences had happened: not yet a pattern.
            const earlier = await signalsAt('2026-03-17');
            expect(earlier.body.children).toEqual([]);
            // And as of the 8th, before any absence, nothing at all.
            expect((await signalsAt('2026-03-08')).body.children).toEqual([]);
        });

        it('lets go the moment the child comes back', async () => {
            const sessions = await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], MONDAYS.slice(2));
            await mark(sessions[1], ana, false);
            await mark(sessions[2], ana, false);
            await mark(sessions[3], ana, false);
            expect((await signalsAt('2026-03-24')).body.children).toHaveLength(1);

            // The register is corrected: Ana was there on the 23rd after all.
            await mark(sessions[3], ana, true);

            expect((await signalsAt('2026-03-24')).body.children).toEqual([]);
        });

        it('goes quiet once the last mark is three weeks old', async () => {
            const sessions = await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], MONDAYS.slice(2));
            await mark(sessions[1], ana, false);
            await mark(sessions[2], ana, false);
            await mark(sessions[3], ana, false);

            expect((await signalsAt('2026-04-13')).body.children).toHaveLength(1);
            expect((await signalsAt('2026-04-14')).body.children).toEqual([]);
        });
    });

    describe('a group that empties', () => {
        it('is flagged when its last three sessions are emptier than the three before', async () => {
            const sessions = await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], MONDAYS);
            // Three full weeks, then three weeks with only Ana in the room.
            for (const sessionId of sessions.slice(3)) {
                await mark(sessionId, bogdan, false);
                await mark(sessionId, bianca, false);
            }

            const res = await signalsAt('2026-03-24');

            expect(res.body.groups).toEqual([
                expect.objectContaining({ groupId, previousRate: 1, recentRate: 0.33, drop: 0.67, sessions: 6, lastSessionOn: '2026-03-23' }),
            ]);
            expect(res.body.basis).toMatchObject({ sessionsWithRegister: 6, groupsWithHistory: 1 });
            // The two children behind the fall are on their own list too.
            expect((res.body.children as { childId: number }[]).map((child) => child.childId).sort()).toEqual([bogdan, bianca].sort());
        });

        it('is not judged on three weeks of history alone', async () => {
            const sessions = await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], MONDAYS.slice(3));
            for (const sessionId of sessions) {
                await mark(sessionId, bogdan, false);
                await mark(sessionId, bianca, false);
            }

            const res = await signalsAt('2026-03-24');

            expect(res.body.groups).toEqual([]);
            expect(res.body.basis).toMatchObject({ sessionsWithRegister: 3, groupsWithHistory: 0 });
        });
    });

    describe('a family two invoices behind', () => {
        const issue = (monthIssued: string, dateIssued: string) =>
            http().post('/invoices/issue').set('Authorization', admin.auth).send({ monthIssued, dateIssued }).expect(201);

        it('is flagged from the arrears list as of the day, and drops off once one invoice is settled', async () => {
            await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], teachingMondays('2026-01').slice(0, 4));
            await holdSessions(app, dataSource, admin, groupId, [ana, bogdan, bianca], teachingMondays('2026-02').slice(0, 4));
            const january = await issue('2026-01', '2026-01-05');
            await issue('2026-02', '2026-02-02');

            // Both invoices are past their fourteen days by the end of March; neither was in January.
            const march = await signalsAt('2026-03-24');
            expect((march.body.families as { parentId: number; invoices: number }[]).map((family) => [family.parentId, family.invoices]).sort()).toEqual(
                [
                    [profileA, 2],
                    [profileB, 2],
                ].sort(),
            );
            expect((await signalsAt('2026-01-10')).body.families).toEqual([]);

            // Family A settles January. One invoice past due is a normal invoice, not a signal.
            const invoiceA = (january.body.issued as { id: number; amount: number }[]).find((row) => row.amount === 350)!.id;
            await http()
                .post('/payments')
                .set('Authorization', admin.auth)
                .send({ invoiceId: invoiceA, amount: 350, date: '2026-03-20', method: 'cash' })
                .expect(201);

            const after = await signalsAt('2026-03-24');
            expect(after.body.families).toEqual([expect.objectContaining({ parentId: profileB, invoices: 2, outstanding: 1200, oldestDaysOverdue: 64 })]);
        });
    });
});
