import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolChild, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { RetentionService } from 'src/modules/privacy/retention.service';
import { addMonthsToDay } from 'src/modules/privacy/retention.rules';
import { schoolDay } from 'src/common/school-clock';
import { Lead } from 'src/entities/lead.entity';
import { LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';

/**
 * E04/S5 and E22/S3, against a real database: a family the school records as gone keeps its data
 * for the term, and then really loses it. The acceptance in the epic's words — "se poate arăta că o
 * familie retrasă acum N luni nu mai are date personale în platformă" — is the test in the middle.
 *
 * The pass is called directly, like every scheduled job's work: `@Cron` is off under test.
 */
describe('Retention (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let retention: RetentionService;

    let admin: TestUser;
    let ana: TestUser;
    let anaProfileId: number;
    let bogdanProfileId: number;
    let anaChildId: number;

    const today = schoolDay(new Date());
    const monthsAgo = (months: number) => addMonthsToDay(today, -months);

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
        retention = app.get(RetentionService);
    });

    afterAll(async () => {
        await app.close();
    });

    /** A family with one child who was enrolled and has left the group — the usual way out. */
    const familyThatLeft = async (username: string, childName: string): Promise<{ user: TestUser; profileId: number; childId: number }> => {
        const user = await registerUser(app, username);
        const profileId = await ownProfileId(app, user);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', user.auth)
            .send({ firstName: childName, lastName: 'Retras', birthDate: '2016-04-02', parentId: profileId })
            .expect(201);
        await enrolInNewGroup(app, admin, [child.body.id as number]);
        return { user, profileId, childId: child.body.id as number };
    };

    const endEnrolments = async (childId: number) => {
        const rows = await dataSource.query<{ id: number }[]>(`SELECT id FROM enrollments WHERE child_id = $1 AND status IN ('ACTIVE', 'TRIAL')`, [childId]);
        for (const row of rows) {
            await request(app.getHttpServer())
                .put(`/enrollments/${row.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN', endDate: today, exitReason: 'S-a mutat' })
                .expect(200);
        }
    };

    const withdraw = (profileId: number, withdrawnOn?: string) =>
        request(app.getHttpServer())
            .post(`/privacy/retention/${profileId}`)
            .set('Authorization', admin.auth)
            .send(withdrawnOn ? { withdrawnOn } : {});

    const profileRow = async (profileId: number) =>
        // `::text`: a raw read hands a `date` column back as a `Date` at local midnight, which is the
        // day before in UTC — the one-day trap, in a test. The service reads it through TypeORM.
        (
            await dataSource.query<Record<string, unknown>[]>(
                `SELECT "firstName", "lastName", email, phone, address, "erasedAt", "withdrawnAt"::text AS "withdrawnAt" FROM profiles WHERE id = $1`,
                [profileId],
            )
        )[0];

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.retentie'));
        ({ user: ana, profileId: anaProfileId, childId: anaChildId } = await familyThatLeft('ana.retentie', 'Maria'));
        ({ profileId: bogdanProfileId } = await familyThatLeft('bogdan.retentie', 'Andrei'));
    });

    describe('the withdrawal', () => {
        it('is refused while a child is still enrolled — the enrolment ends through its own door', async () => {
            const res = await withdraw(anaProfileId).expect(409);

            expect(res.body.code).toBe('FAMILY_HAS_ENROLMENTS_IN_FORCE');
        });

        it('records the day and says when the data goes, with the term it counted by', async () => {
            await endEnrolments(anaChildId);

            const res = await withdraw(anaProfileId, '2026-01-10').expect(200);

            expect(res.body).toEqual({
                terms: { familyMonths: 12, enquiryMonths: 12, messageMonths: 12, expiredLinkDays: 30 },
                row: expect.objectContaining({ profileId: anaProfileId, withdrawnAt: '2026-01-10', dueOn: '2027-01-10', hold: null }),
            });
            expect(await profileRow(anaProfileId)).toMatchObject({ withdrawnAt: '2026-01-10' });
        });

        it('refuses a day that has not happened yet', async () => {
            await endEnrolments(anaChildId);

            const res = await withdraw(anaProfileId, addMonthsToDay(today, 1)).expect(400);

            expect(res.body.code).toBe('WITHDRAWAL_IN_FUTURE');
        });

        it('is taken back from the family page, and by enrolling a child again', async () => {
            await endEnrolments(anaChildId);
            await withdraw(anaProfileId).expect(200);
            await request(app.getHttpServer()).delete(`/privacy/retention/${anaProfileId}`).set('Authorization', admin.auth).expect(204);
            expect(await profileRow(anaProfileId)).toMatchObject({ withdrawnAt: null });

            await withdraw(anaProfileId).expect(200);
            const [previous] = await dataSource.query<{ group_id: number }[]>(`SELECT group_id FROM enrollments WHERE child_id = $1`, [anaChildId]);
            await enrolChild(app, admin, anaChildId, previous.group_id);

            expect(await profileRow(anaProfileId)).toMatchObject({ withdrawnAt: null });
            const trail = await dataSource.query<{ note: string }[]>(
                `SELECT note FROM audit_log WHERE entity_type = 'Profile' AND entity_id = $1 ORDER BY id`,
                [anaProfileId],
            );
            expect(trail.map((entry) => entry.note)).toEqual(
                expect.arrayContaining(['familie retrasă', 'retragere anulată', `retragere anulată: copilul ${anaChildId} înscris`]),
            );
        });

        it('is not a parent’s to see or to make', async () => {
            await request(app.getHttpServer()).get('/privacy/retention').set('Authorization', ana.auth).expect(403);
            await request(app.getHttpServer()).post(`/privacy/retention/${anaProfileId}`).set('Authorization', ana.auth).send({}).expect(403);
        });
    });

    describe('the nightly pass', () => {
        it('leaves a family withdrawn thirteen months ago with no personal data, and one withdrawn eleven months ago as it was', async () => {
            await endEnrolments(anaChildId);
            await withdraw(anaProfileId, monthsAgo(13)).expect(200);
            const bogdanChild = await dataSource.query<{ id: number }[]>(`SELECT id FROM children WHERE parent_id = $1`, [bogdanProfileId]);
            await endEnrolments(bogdanChild[0].id);
            await withdraw(bogdanProfileId, monthsAgo(11)).expect(200);

            const report = await retention.run(today);

            expect(report).toMatchObject({ familiesErased: 1, familiesHeld: 0 });
            expect(await profileRow(anaProfileId)).toMatchObject({
                firstName: 'Familie',
                lastName: 'ștearsă',
                email: null,
                phone: null,
                address: null,
                erasedAt: expect.any(Date),
            });
            expect(await dataSource.query(`SELECT id FROM children WHERE parent_id = $1`, [anaProfileId])).toEqual([]);
            expect(await dataSource.query(`SELECT id FROM users WHERE username = 'ana.retentie'`)).toEqual([]);
            expect(await dataSource.query(`SELECT id FROM outbox WHERE "to" = 'ana.retentie@example.com'`)).toEqual([]);
            // The trail says it was the calendar, not a request — and names nobody.
            const [entry] = await dataSource.query<{ note: string; changes: unknown }[]>(
                `SELECT note, changes FROM audit_log WHERE entity_type = 'Profile' AND entity_id = $1 AND changes ? 'erasedAt'`,
                [anaProfileId],
            );
            expect(entry.note).toBe('ștergere la termen, după retragerea familiei');
            expect(JSON.stringify(entry.changes)).not.toContain('ana.retentie');

            // Eleven months: still here, due in one.
            expect(await profileRow(bogdanProfileId)).toMatchObject({ email: 'bogdan.retentie@example.com', erasedAt: null });
            const schedule = await request(app.getHttpServer()).get('/privacy/retention').set('Authorization', admin.auth).expect(200);
            expect(schedule.body.rows).toEqual([expect.objectContaining({ profileId: bogdanProfileId, dueOn: addMonthsToDay(monthsAgo(11), 12), due: false })]);
        });

        it('keeps a family that still owes money, and says so', async () => {
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [anaProfileId], monthIssued: '2026-03', dateIssued: '2026-04-01' })
                .expect(201);
            await endEnrolments(anaChildId);
            await withdraw(anaProfileId, monthsAgo(13)).expect(200);

            const report = await retention.run(today);

            expect(report).toMatchObject({ familiesErased: 0, familiesHeld: 1 });
            expect(await profileRow(anaProfileId)).toMatchObject({ email: 'ana.retentie@example.com', erasedAt: null });
            const family = await request(app.getHttpServer()).get(`/privacy/retention/${anaProfileId}`).set('Authorization', admin.auth).expect(200);
            expect(family.body.row).toMatchObject({ due: true, hold: 'owes_money' });
        });

        it('holds a family whose paid invoice is still on its way to SmartBill', async () => {
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [anaProfileId], monthIssued: '2026-03', dateIssued: '2026-04-01' })
                .expect(201);
            const [invoice] = await dataSource.query<{ id: number; amount: string }[]>('SELECT id, amount FROM invoices WHERE parent_id = $1', [anaProfileId]);
            await request(app.getHttpServer())
                .post('/payments')
                .set('Authorization', admin.auth)
                .send({ invoiceId: invoice.id, amount: Number(invoice.amount), method: 'cash', date: '2026-04-02' })
                .expect(201);
            // Paid, and not issued yet: SmartBill refused it and it waits for somebody to fix it.
            await dataSource.query(`UPDATE invoices SET "fiscalStatus" = 'failed' WHERE id = $1`, [invoice.id]);
            await endEnrolments(anaChildId);
            await withdraw(anaProfileId, monthsAgo(13)).expect(200);

            const report = await retention.run(today);

            expect(report).toMatchObject({ familiesErased: 0, familiesHeld: 1 });
            const family = await request(app.getHttpServer()).get(`/privacy/retention/${anaProfileId}`).set('Authorization', admin.auth).expect(200);
            expect(family.body.row).toMatchObject({ due: true, hold: 'fiscal_in_progress' });
        });

        it('removes an enquiry nobody has touched for a year — and only that one', async () => {
            const leads = dataSource.getRepository(Lead);
            const enquiry = (parentName: string, months: number, extra: Partial<Lead> = {}) =>
                leads.save({
                    status: LeadStatus.CONTACTED,
                    source: LeadSource.PHONE,
                    parentName,
                    childFirstName: 'Ioana',
                    childLastName: 'Test',
                    childBirthDate: new Date(2016, 3, 2),
                    lastActivityAt: new Date(`${monthsAgo(months)}T12:00:00Z`),
                    ...extra,
                });
            await enquiry('Veche', 13);
            await enquiry('Recentă', 11);
            await enquiry('Înscrisă', 13, { status: LeadStatus.ENROLLED });
            // No link, but the address of a family on file: it is that family's, and goes with them.
            await enquiry('A Anei', 13, { parentEmail: 'ana.retentie@example.com' });

            const report = await retention.run(today);

            expect(report.enquiriesRemoved).toBe(1);
            const left = await leads.find({ order: { parentName: 'ASC' } });
            expect(left.map((lead) => lead.parentName)).toEqual(['A Anei', 'Recentă', 'Înscrisă']);
        });

        /**
         * The same rule as the erasure, from the other side: a family keeps an enquiry past its term
         * only by an address it has vouched for. A number it typed vouches for nothing, so an
         * enquiry that nothing else ties to a family goes on its own day.
         */
        it('does not keep an enquiry because a family typed its phone number', async () => {
            const [{ phone }] = await dataSource.query<{ phone: string }[]>('SELECT phone FROM profiles WHERE id = $1', [anaProfileId]);
            await dataSource.getRepository(Lead).save({
                status: LeadStatus.CONTACTED,
                source: LeadSource.PHONE,
                parentName: 'Alta familie',
                parentPhone: phone,
                childFirstName: 'Ioana',
                childLastName: 'Test',
                childBirthDate: new Date(2016, 3, 2),
                lastActivityAt: new Date(`${monthsAgo(13)}T12:00:00Z`),
            });

            const report = await retention.run(today);

            expect(report.enquiriesRemoved).toBe(1);
            expect(await dataSource.getRepository(Lead).count()).toBe(0);
        });

        it('takes the shell profile a booking made with its enquiry', async () => {
            const shell = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Probă', lastName: 'Fără Cont' })
                .expect(201);
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: shell.body.id, firstName: 'Radu', lastName: 'Fără Cont', birthDate: '2017-01-01' })
                .expect(201);
            await dataSource.getRepository(Lead).save({
                status: LeadStatus.LOST,
                source: LeadSource.TRIAL_FORM,
                parentName: 'Probă Fără Cont',
                childFirstName: 'Radu',
                childLastName: 'Fără Cont',
                childBirthDate: new Date(2017, 0, 1),
                lastActivityAt: new Date(`${monthsAgo(13)}T12:00:00Z`),
                profile: { id: shell.body.id as number },
            });

            await retention.run(today);

            expect(await profileRow(shell.body.id as number)).toMatchObject({ erasedAt: expect.any(Date), firstName: 'Familie' });
            expect(await dataSource.query(`SELECT id FROM children WHERE parent_id = $1`, [shell.body.id])).toEqual([]);
            expect(await dataSource.getRepository(Lead).count()).toBe(0);
        });

        it('deletes copies of messages sent more than a year ago, and never one still waiting', async () => {
            const rows = await dataSource.query<{ id: number }[]>(`SELECT id FROM outbox ORDER BY id LIMIT 3`);
            expect(rows).toHaveLength(3);
            const [old, recent, waiting] = rows.map((row) => row.id);
            await dataSource.query(`UPDATE outbox SET status = 'sent', "sentAt" = $2 WHERE id = $1`, [old, `${monthsAgo(13)}T12:00:00Z`]);
            await dataSource.query(`UPDATE outbox SET status = 'sent', "sentAt" = $2 WHERE id = $1`, [recent, `${monthsAgo(11)}T12:00:00Z`]);
            await dataSource.query(`UPDATE outbox SET status = 'pending', "createdAt" = $2 WHERE id = $1`, [waiting, `${monthsAgo(13)}T12:00:00Z`]);

            const report = await retention.run(today);

            expect(report.messagesRemoved).toBe(1);
            const left = (await dataSource.query<{ id: number }[]>(`SELECT id FROM outbox WHERE id IN ($1, $2, $3)`, [old, recent, waiting])).map(
                (row) => row.id,
            );
            expect(left.sort()).toEqual([recent, waiting].sort());
        });

        it('deletes confirmation links a month after they stopped working', async () => {
            const links = await dataSource.query<{ id: number }[]>(`SELECT id FROM email_confirmations ORDER BY id LIMIT 2`);
            expect(links).toHaveLength(2);
            const now = Date.now();
            await dataSource.query(`UPDATE email_confirmations SET "expiresAt" = $2 WHERE id = $1`, [links[0].id, new Date(now - 40 * 86_400_000)]);
            await dataSource.query(`UPDATE email_confirmations SET "expiresAt" = $2 WHERE id = $1`, [links[1].id, new Date(now - 10 * 86_400_000)]);

            const report = await retention.run(today);

            expect(report.expiredLinksRemoved).toBe(1);
            expect((await dataSource.query<{ id: number }[]>(`SELECT id FROM email_confirmations WHERE id = $1`, [links[1].id])).length).toBe(1);
        });
    });
});
