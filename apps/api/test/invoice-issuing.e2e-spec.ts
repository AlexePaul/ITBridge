import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { schoolToday } from 'src/modules/enrollment/enrollment.service';
import { setIssuingClock } from 'src/modules/invoice/issuing-clock';

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

        /**
         * QA of 26 September 2026: the card showed the discounted total above session lines that added
         * up to the list price, with the discount nowhere — the mismatch E20/S5 warns makes somebody
         * "fix" a bill that is right. The row now carries what the discounts take off, one by one.
         */
        it('shows the price before discounts and what each discount takes off', async () => {
            const childId = await makeChild();
            const sessions = await october();
            for (const session of sessions) await mark(session, childId, true);
            const parentId = await ownProfileId(app, parent);
            await request(app.getHttpServer())
                .post('/discounts')
                .set('Authorization', admin.auth)
                .send({ name: 'Recomandare', type: 'percent', value: 10, monthIssued: '2026-10', parentId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/discounts')
                .set('Authorization', admin.auth)
                .send({ name: 'Bursă', type: 'fixed', value: 50, monthIssued: '2026-10', parentId })
                .expect(201);

            const [family] = (await worksheet().expect(200)).body.families;

            expect(family.listAmount).toBe(350);
            expect(family.discounts).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Recomandare', type: 'percent', value: 10, off: 35 }),
                    expect.objectContaining({ name: 'Bursă', type: 'fixed', value: 50, off: 50 }),
                ]),
            );
            expect(family.amount).toBe(265);
        });

        it('answers 400, not 500, when the month is missing or malformed', async () => {
            // It reached the month arithmetic and failed there (review of 26 September 2026).
            await request(app.getHttpServer()).get('/invoices/worksheet').set('Authorization', admin.auth).expect(400);
            await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-13').set('Authorization', admin.auth).expect(400);
        });

        it('lets the office ask which months have invoices, and for one month of them', async () => {
            // The overview downloaded every invoice to learn the months, the month's page to keep
            // thirty rows: 6.9 MB at three years (review of 26 September 2026).
            const childId = await makeChild();
            const [first] = await october();
            await mark(first, childId, true);
            await issue().expect(201);

            const months = await request(app.getHttpServer()).get('/invoices/months').set('Authorization', admin.auth).expect(200);
            const october2026 = await request(app.getHttpServer()).get('/invoices?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);
            const november2026 = await request(app.getHttpServer()).get('/invoices?monthIssued=2026-11').set('Authorization', admin.auth).expect(200);

            expect(months.body).toEqual(['2026-10']);
            expect(october2026.body).toHaveLength(1);
            expect(november2026.body).toHaveLength(0);
            await request(app.getHttpServer()).get('/invoices/months').set('Authorization', parent.auth).expect(403);
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

        // Finding 7 of the review of 25 September 2026: a register marked after the month was issued
        // moved the worksheet's count while the invoice kept its sum, and the screen showed only
        // "Deja facturat" — nothing said the two now disagree.
        it('shows what the invoice says beside what the registers come to now', async () => {
            const childId = await makeChild();
            const [first, second] = await october();
            await mark(first, childId, true);
            await issue().expect(201);
            await mark(second, childId, true);

            const res = await worksheet().expect(200);
            expect(res.body.families[0]).toMatchObject({ alreadyInvoiced: true, invoicedAmount: 87.5, amount: 175 });
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

    /**
     * The review of 25 September 2026. The decisions stamp today and a close refuses a day ahead, so
     * each test takes the stamp through the API and then moves the day into October with SQL: what
     * is under test there is what the bill makes of the dates, not the clock.
     */
    describe('trials, and the days an enrolment starts and ends', () => {
        const enrolmentsOf = (childId: number) =>
            dataSource.query<{ id: number; status: string; startDate: string; endDate: string | null; trialUntil: string | null }[]>(
                `SELECT "id", "status", to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("endDate", 'YYYY-MM-DD') AS "endDate",
                        to_char("trialUntil", 'YYYY-MM-DD') AS "trialUntil"
                 FROM "enrollments" WHERE "child_id" = $1 ORDER BY "id"`,
                [childId],
            );
        const resolveTrial = async (childId: number, accepted: boolean) => {
            const [row] = await enrolmentsOf(childId);
            await request(app.getHttpServer()).put(`/enrollments/${row.id}/resolve-trial`).set('Authorization', admin.auth).send({ accepted }).expect(200);
            return row.id;
        };
        const linesOf = (sheet: request.Response, childId: number): string[] =>
            (
                sheet.body.families
                    .flatMap((family: { children: { childId: number; lines: { date: string; counted: boolean }[] }[] }) => family.children)
                    .find((child: { childId: number }) => child.childId === childId)?.lines ?? []
            )
                .filter((line: { counted: boolean }) => line.counted)
                .map((line: { date: string }) => line.date);

        it('bills a trial accepted on the same row only after the day it was decided', async () => {
            const childId = await makeChild({ status: 'TRIAL' });
            const enrolmentId = await resolveTrial(childId, true);
            expect((await enrolmentsOf(childId))[0]).toMatchObject({ status: 'ACTIVE', trialUntil: schoolToday() });

            // Decided on Monday the 12th, after the trial class of the 5th and that day's own class.
            await dataSource.query(`UPDATE "enrollments" SET "trialUntil" = '2026-10-12' WHERE "id" = $1`, [enrolmentId]);
            for (const session of await october()) await mark(session, childId, true);

            expect(linesOf(await worksheet().expect(200), childId)).toEqual(['2026-10-19', '2026-10-26']);
        });

        it('does not invoice a family whose only trial came to nothing — not even at zero', async () => {
            const childId = await makeChild({ status: 'TRIAL' });
            const enrolmentId = await resolveTrial(childId, false);
            expect((await enrolmentsOf(childId))[0]).toMatchObject({ status: 'WITHDRAWN', endDate: schoolToday(), trialUntil: schoolToday() });

            // The trial class on the 5th, declined on the 12th.
            await dataSource.query(
                `UPDATE "enrollments" SET "startDate" = '2026-10-01', "endDate" = '2026-10-12', "trialUntil" = '2026-10-12' WHERE "id" = $1`,
                [enrolmentId],
            );
            const [first] = await october();
            await mark(first, childId, true);

            expect((await worksheet().expect(200)).body.families).toHaveLength(0);
            const res = await issue().expect(201);
            expect([...res.body.issued, ...res.body.waived]).toHaveLength(0);
        });

        it('bills the last day only to a child who was on its register', async () => {
            // Both leave on Monday the 12th: Ana that morning, before the class; Radu at pickup.
            const ana = await makeChild();
            const radu = await makeChild();
            const [first, second] = await october();
            await mark(first, ana, true);
            await mark(first, radu, true);
            await mark(second, radu, true);
            await dataSource.query(`UPDATE "enrollments" SET "status" = 'WITHDRAWN', "endDate" = '2026-10-12' WHERE "child_id" = ANY($1)`, [[ana, radu]]);

            const sheet = await worksheet().expect(200);

            expect(linesOf(sheet, ana)).toEqual(['2026-10-05']);
            expect(linesOf(sheet, radu)).toEqual(['2026-10-05', '2026-10-12']);
        });

        it('bills once a class reached by two rows — a child taken out and put back the same day', async () => {
            const childId = await makeChild();
            const sessions = await october();
            for (const session of sessions) await mark(session, childId, true);
            await dataSource.query(`UPDATE "enrollments" SET "status" = 'WITHDRAWN', "endDate" = '2026-10-12' WHERE "child_id" = $1`, [childId]);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId, startDate: '2026-10-12' })
                .expect(201);

            const sheet = await worksheet().expect(200);

            expect(linesOf(sheet, childId)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
            expect(sheet.body.families[0].amount).toBe(350);
        });
    });

    /**
     * The review of 25 September 2026: issuing read the month on its own snapshot, and each writer
     * of what the month is made of checked "not invoiced yet" on its own. A correction, a discount
     * or a vacation tick saved in the same second as "emite" was then neither on the invoice nor
     * refused. A second connection plays the issue here: it holds the month's lock, and the request
     * under test has to wait for it — or, on the code before the lock, does not wait at all.
     */
    describe("the month's lock", () => {
        type Runner = ReturnType<DataSource['createQueryRunner']>;

        const holdMonth = async (month = '2026-10'): Promise<Runner> => {
            const runner = dataSource.createQueryRunner();
            await runner.connect();
            await runner.startTransaction();
            await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoice-month:${month}`]);
            return runner;
        };

        const release = async (runner: Runner) => {
            await runner.commitTransaction();
            await runner.release();
        };

        /** Until the request waits on a lock — or has already answered, which is what the old code did. */
        const blockedOrDone = async (pending: Promise<unknown>): Promise<void> => {
            let done = false;
            void pending.then(() => (done = true));
            for (let attempt = 0; attempt < 300 && !done; attempt++) {
                const [{ waiting }] = await dataSource.query<{ waiting: string }[]>('SELECT COUNT(*) AS waiting FROM pg_locks WHERE NOT granted');
                if (Number(waiting) > 0) return;
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        };

        /** The issue's own write, made on the connection that holds the month. */
        const invoiceTheFamily = async (runner: Runner) => {
            await runner.query(
                `INSERT INTO "invoices" ("amount", "dateIssued", "monthIssued", "status", "parent_id") VALUES (87.5, '2026-11-01', '2026-10', 'pending', $1)`,
                [await ownProfileId(app, parent)],
            );
        };

        it('refuses a correction that waited on an issue of its month', async () => {
            const childId = await makeChild();
            const runner = await holdMonth();

            const pending = request(app.getHttpServer())
                .put('/invoices/overrides')
                .set('Authorization', admin.auth)
                .send({ monthIssued: '2026-10', childId, sessions: 3 })
                .then((res) => res);
            await blockedOrDone(pending);
            await invoiceTheFamily(runner);
            await release(runner);

            const res = await pending;
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MONTH_ALREADY_INVOICED');
            const [{ count }] = await dataSource.query<{ count: string }[]>('SELECT COUNT(*) AS count FROM "session_count_overrides"');
            expect(Number(count)).toBe(0);
        });

        it('refuses a discount that waited on an issue of its month', async () => {
            await makeChild();
            const runner = await holdMonth();

            const pending = request(app.getHttpServer())
                .post('/discounts')
                .set('Authorization', admin.auth)
                .send({ name: 'Frate', value: 50, monthIssued: '2026-10', parentId: await ownProfileId(app, parent) })
                .then((res) => res);
            await blockedOrDone(pending);
            await invoiceTheFamily(runner);
            await release(runner);

            const res = await pending;
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DISCOUNT_MONTH_INVOICED');
        });

        it('refuses a vacation tick that waited on an issue of its month', async () => {
            await makeChild();
            const [first] = await october();
            const runner = await holdMonth();

            const pending = request(app.getHttpServer())
                .put(`/class-sessions/${first}/vacation`)
                .set('Authorization', admin.auth)
                .send({ isVacation: true })
                .then((res) => res);
            await blockedOrDone(pending);
            await invoiceTheFamily(runner);
            await release(runner);

            const res = await pending;
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MONTH_ALREADY_INVOICED');
        });

        it('does not tick a class cancelled while the tick waited — and leaves it cancelled', async () => {
            await makeChild();
            const [first] = await october();
            const runner = await holdMonth();

            const pending = request(app.getHttpServer())
                .put(`/class-sessions/${first}/vacation`)
                .set('Authorization', admin.auth)
                .send({ isVacation: true })
                .then((res) => res);
            await blockedOrDone(pending);
            await runner.query(`UPDATE "class_sessions" SET "status" = 'cancelled' WHERE "id" = $1`, [first]);
            await release(runner);

            const res = await pending;
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('CLASS_SESSION_CANCELLED');
            const [row] = await dataSource.query<{ status: string; isVacation: boolean }[]>(
                'SELECT "status", "isVacation" FROM "class_sessions" WHERE "id" = $1',
                [first],
            );
            expect(row).toEqual({ status: 'cancelled', isVacation: false });
        });

        it('issues from a correction committed while the issue waited', async () => {
            const childId = await makeChild();
            for (const session of await october()) await mark(session, childId, true);
            const runner = await holdMonth();
            await runner.query(`INSERT INTO "session_count_overrides" ("monthIssued", "sessions", "reason", "child_id") VALUES ('2026-10', 3, 'test', $1)`, [
                childId,
            ]);

            const pending = issue().then((res) => res);
            await blockedOrDone(pending);
            await release(runner);

            const res = await pending;
            expect(res.status).toBe(201);
            // Three sessions at the first-child rate, as the correction says — not the four the
            // registers hold, which is what a month read before the correction committed would bill.
            expect(res.body.issued[0].amount).toBe(262.5);
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

            // Nothing to print, nobody to ask for money. The download is a 404, not an empty page — with
            // its own code, so the screen can say the month was free rather than "not found".
            const res = await request(app.getHttpServer()).get(`/invoices/${waived.body.waived[0].id}/pdf`).set('Authorization', admin.auth).expect(404);
            expect(res.body.code).toBe('INVOICE_WAIVED_HAS_NO_PDF');
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

        // E15 S9. The QA of 26 September 2026 issued October on the 26th of September: every family
        // "0 lei", the month frozen, the real October impossible to issue afterwards.
        it('refuses a month not taught yet, and a date not reached yet', async () => {
            await makeChild();
            setIssuingClock(() => new Date('2026-10-02T09:00:00Z'));
            try {
                const early = await issue('2026-09').expect(409);
                expect(early.body.code).toBe('MONTH_NOT_TAUGHT_YET');
                const worksheet = await request(app.getHttpServer())
                    .get('/invoices/worksheet?monthIssued=2026-09')
                    .set('Authorization', admin.auth)
                    .expect(200);
                expect(worksheet.body.issuable).toBe(false);

                // September's last week runs to Sunday 4 October; from the 5th it is issued, dated
                // no later than the day it is.
                setIssuingClock(() => new Date('2026-10-05T09:00:00Z'));
                const ahead = await request(app.getHttpServer())
                    .post('/invoices/issue')
                    .set('Authorization', admin.auth)
                    .send({ monthIssued: '2026-09', dateIssued: '2026-10-06' })
                    .expect(400);
                expect(ahead.body.code).toBe('INVOICE_DATE_IN_FUTURE');
                await request(app.getHttpServer())
                    .post('/invoices/issue')
                    .set('Authorization', admin.auth)
                    .send({ monthIssued: '2026-09', dateIssued: '2026-10-05' })
                    .expect(201);
            } finally {
                setIssuingClock(() => new Date('2031-01-15T10:00:00Z'));
            }
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
