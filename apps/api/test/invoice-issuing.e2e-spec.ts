import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Issuing a month from the registers — E15/S9, against a real database.
 *
 * The unit spec holds the rule case by case; this holds the chain: sessions in the timetable,
 * marks on them, enrolments with dates, and at the end an invoice whose amount nobody typed.
 *
 * **October 2026, the teaching month.** The 1st is a Thursday, so the month opens on Monday the 5th
 * and closes on Sunday 1 November — four Mondays: the 5th, 12th, 19th and 26th. The group meets on
 * Mondays (`groupBody`'s weekday). Every session is written directly, dated inside that range.
 */
describe('Issuing invoices from the registers (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;

    const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
    const childSeq = { n: 0 };

    const makeChild = async (enrolment: Record<string, unknown> = {}): Promise<number> => {
        childSeq.n += 1;
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: `Copil${childSeq.n}`, lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        const childId = res.body.id as number;
        await request(app.getHttpServer())
            .post('/enrollments')
            .set('Authorization', admin.auth)
            .send({ childId, groupId, startDate: '2026-09-01', ...enrolment })
            .expect(201);
        return childId;
    };

    /** The four Mondays of the month, as rows. */
    const october = async (group = groupId) => Promise.all(MONDAYS.map((date) => createClassSession(dataSource, group, { date })));

    const mark = (sessionId: number, childId: number, present: boolean) =>
        request(app.getHttpServer()).put(`/attendance/session/${sessionId}/child/${childId}`).set('Authorization', admin.auth).send({ present }).expect(200);

    const worksheet = (month = '2026-10') => request(app.getHttpServer()).get(`/invoices/worksheet?monthIssued=${month}`).set('Authorization', admin.auth);

    const issue = (monthIssued = '2026-10') =>
        request(app.getHttpServer()).post('/invoices/issue').set('Authorization', admin.auth).send({ monthIssued, dateIssued: '2026-11-01' });

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        childSeq.n = 0;
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'ana');
        const roomId = await createRoom(app, admin);
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
    });

    afterAll(async () => {
        await app.close();
    });

    describe('the worksheet', () => {
        it('lists a family with its children, the count read from the registers, and the sessions behind it', async () => {
            const childId = await makeChild();
            const [first, second] = await october();
            await mark(first, childId, true);
            await mark(second, childId, false);

            const res = await worksheet().expect(200);

            expect(res.body).toMatchObject({ month: '2026-10', from: '2026-10-05', to: '2026-11-01' });
            expect(res.body.families).toHaveLength(1);
            const [child] = res.body.families[0].children;
            expect(child).toMatchObject({ groupName: 'Scratch Începători', sessions: 2 });
            expect(child.lines).toEqual([
                expect.objectContaining({ date: '2026-10-05', present: true, counted: true, isVacation: false }),
                expect.objectContaining({ date: '2026-10-12', present: false, counted: true, isVacation: false }),
            ]);
            // Two sessions at the first-child rate. The screen shows what the server will write.
            expect(res.body.families[0].amount).toBe(175);
        });

        it('lists the sessions of the month with no register, first', async () => {
            const childId = await makeChild();
            const sessions = await october();
            await mark(sessions[1], childId, true);

            const res = await worksheet().expect(200);

            expect(res.body.unmarked.map((row: { date: string }) => row.date)).toEqual(['2026-10-05', '2026-10-19', '2026-10-26']);
            expect(res.body.unmarked[0]).toMatchObject({ groupName: 'Scratch Începători', startTime: '16:00:00' });
        });

        it('leaves out a family with no enrolment in the month, and a trial', async () => {
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ parentId: await ownProfileId(app, parent), firstName: 'Nerepartizat', lastName: 'Test', birthDate: '2016-05-04' })
                .expect(201);
            await makeChild({ status: 'TRIAL' });
            await october();

            const res = await worksheet().expect(200);
            expect(res.body.families).toHaveLength(0);
        });

        it('marks a family that already has an invoice for the month', async () => {
            const childId = await makeChild();
            const [first] = await october();
            await mark(first, childId, true);
            await issue().expect(201);

            const res = await worksheet().expect(200);
            expect(res.body.families[0].alreadyInvoiced).toBe(true);
        });
    });

    describe('the rule, end to end', () => {
        it('a session with no register bills nobody; a held one bills the whole group, present or absent', async () => {
            const ana = await makeChild();
            const radu = await makeChild();
            const [, second, third, fourth] = await october();
            // Nobody marked the first Monday. Radu missed two of the other three.
            await mark(second, ana, true);
            await mark(second, radu, false);
            await mark(third, ana, true);
            await mark(third, radu, false);
            await mark(fourth, ana, true);
            await mark(fourth, radu, true);

            const res = await issue().expect(201);

            // Three each: 3 × 87,50 + 3 × 62,50.
            expect(res.body.issued[0].amount).toBe(450);
        });

        it('a vacation session bills only the children marked present', async () => {
            const ana = await makeChild();
            const radu = await makeChild();
            const [first, second, third, fourth] = await october();
            for (const session of [first, second]) {
                await mark(session, ana, true);
                await mark(session, radu, true);
            }
            // The last two Mondays are the autumn break: the school runs the hour for whoever comes.
            for (const session of [third, fourth]) {
                await request(app.getHttpServer())
                    .put(`/class-sessions/${session}/vacation`)
                    .set('Authorization', admin.auth)
                    .send({ isVacation: true })
                    .expect(200);
                await mark(session, ana, true);
                await mark(session, radu, false);
            }

            const sheet = await worksheet().expect(200);
            const counts = Object.fromEntries(
                sheet.body.families[0].children.map((child: { childId: number; sessions: number }) => [child.childId, child.sessions]),
            );
            expect(counts[ana]).toBe(4);
            expect(counts[radu]).toBe(2);

            // 4 × 87,50 for Ana, 2 × 62,50 for Radu.
            const res = await issue().expect(201);
            expect(res.body.issued[0].amount).toBe(475);
        });

        it('a child enrolled on the 20th owes only what came after', async () => {
            const childId = await makeChild({ startDate: '2026-10-20' });
            const sessions = await october();
            for (const session of sessions) await mark(session, childId, true);

            const sheet = await worksheet().expect(200);
            expect(sheet.body.families[0].children[0].sessions).toBe(1);
            expect(sheet.body.families[0].children[0].lines.map((line: { date: string }) => line.date)).toEqual(['2026-10-26']);
        });

        it('a register made entirely of absences still bills', async () => {
            const childId = await makeChild();
            const [first] = await october();
            await mark(first, childId, false);

            const res = await issue().expect(201);
            expect(res.body.issued[0].amount).toBe(87.5);
        });

        it('the week rule: a Sunday in November whose Monday was in October is October', async () => {
            // Monday 26 October opens the last week of the teaching month, and Sunday 1 November
            // closes it. A group meeting on that Sunday is billed in October, not November.
            const roomId = (await dataSource.query<{ room_id: number }[]>('SELECT room_id FROM groups WHERE id = $1', [groupId]))[0].room_id;
            const sunday = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(roomId, { name: 'Duminică', weekday: 7, startTime: '10:00', endTime: '11:30' }))
                .expect(201);
            const childId = await makeChild({ groupId: sunday.body.id as number });
            const session = await createClassSession(dataSource, sunday.body.id as number, { date: '2026-11-01' });
            await mark(session, childId, true);

            const inOctober = await worksheet('2026-10').expect(200);
            const inNovember = await worksheet('2026-11').expect(200);

            expect(inOctober.body.families[0].children[0].sessions).toBe(1);
            // The family is still enrolled in November, so November lists them — with nothing held:
            // the 1st belongs to October's last week, not to November's first.
            expect(inNovember.body.families[0].children[0]).toMatchObject({ sessions: 0, lines: [] });
        });
    });

    describe('a month that comes to nothing', () => {
        it('is recorded as a row, not skipped', async () => {
            await makeChild();
            await october();
            const parentId = await ownProfileId(app, parent);

            const res = await issue().expect(201);

            // The record is the point: a family with no October row looks the same as a family whose
            // October nobody got round to, and only the second needs chasing.
            expect(res.body.issued).toHaveLength(0);
            expect(res.body.waived).toHaveLength(1);
            expect(res.body.waived[0]).toMatchObject({ amount: 0, status: 'waived' });

            const rows = await dataSource.query(`SELECT status, amount FROM invoices WHERE parent_id = $1`, [parentId]);
            expect(rows).toHaveLength(1);
            expect(rows[0].status).toBe('waived');
        });

        it('generates no PDF for it', async () => {
            await makeChild();
            const waived = await issue().expect(201);

            // Nothing to print, nobody to ask for money. The download is a 404, not an empty page.
            await request(app.getHttpServer()).get(`/invoices/${waived.body.waived[0].id}/pdf`).set('Authorization', admin.auth).expect(404);
        });

        it('still blocks a second invoice for that month', async () => {
            await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue().expect(201);

            const second = await issue().expect(201);
            expect(second.body.skipped).toEqual([{ parentId, reason: 'ALREADY_INVOICED' }]);
        });
    });

    describe('running the screen twice', () => {
        it('skips the families already invoiced and issues only the new one', async () => {
            const firstChild = await makeChild();
            const parentId = await ownProfileId(app, parent);
            const [first, second] = await october();
            await mark(first, firstChild, true);
            await mark(second, firstChild, true);
            await issue().expect(201);

            // A second family enrols mid-month. The whole month must not fail because of it.
            const other = await registerUser(app, 'bogdan');
            const otherProfileId = await ownProfileId(app, other);
            const otherChild = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', other.auth)
                .send({ parentId: otherProfileId, firstName: 'Nou', lastName: 'Venit', birthDate: '2016-05-04' })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: otherChild.body.id as number, groupId, startDate: '2026-10-10' })
                .expect(201);
            await mark(second, otherChild.body.id as number, true);

            const res = await issue().expect(201);

            expect(res.body.skipped).toEqual([{ parentId, reason: 'ALREADY_INVOICED' }]);
            expect(res.body.issued).toHaveLength(1);
            // One session after the 10th at the first-child rate.
            expect(res.body.issued[0].amount).toBe(87.5);
        });
    });

    describe('validation and authorization', () => {
        it('refuses a request that still sends session counts — the number is not the client’s to state', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);

            await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({ monthIssued: '2026-10', dateIssued: '2026-11-01', families: [{ parentId, children: [{ childId, sessions: 4 }] }] })
                .expect(400);
        });

        it('refuses a parent', async () => {
            await makeChild();

            await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', parent.auth)
                .send({ monthIssued: '2026-10', dateIssued: '2026-11-01' })
                .expect(403);
        });
    });
});
