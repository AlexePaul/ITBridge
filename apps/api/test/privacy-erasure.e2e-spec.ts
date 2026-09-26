import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { S3Service } from 'src/modules/storage/s3.service';
import { officeAddress } from 'src/modules/mail/office-address';

/**
 * Erasure on request, against a real database — E07 S4.
 *
 * This is the suite that has to be right. The code deletes a family, and the questions it answers
 * cannot be answered by a mock: did the cascades really take the enrolments and the attendance, did
 * the invoice really survive, and — the one that would be a catastrophe — did anybody else's data
 * move. Two families go through every test for that last reason.
 */
describe('Privacy erasure (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;
    let anaProfileId: number;
    let bogdanProfileId: number;
    let anaChildId: number;
    let groupId: number;

    /** A real 1x1 PNG, so the ingestion pipeline runs rather than rejecting the bytes. */
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.stergere'));
        ana = await registerUser(app, 'ana.stergere');
        bogdan = await registerUser(app, 'bogdan.stergere');

        anaProfileId = await ownProfileId(app, ana);
        bogdanProfileId = await ownProfileId(app, bogdan);

        const anaChild = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', ana.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-02', parentId: anaProfileId })
            .expect(201);
        anaChildId = anaChild.body.id as number;
        groupId = await enrolInNewGroup(app, admin, [anaChildId]);

        const bogdanChild = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', bogdan.auth)
            .send({ firstName: 'Andrei', lastName: 'Ionescu', birthDate: '2015-09-09', parentId: bogdanProfileId })
            .expect(201);
        await request(app.getHttpServer())
            .post(`/children/${bogdanChild.body.id as number}/groups/${groupId}`)
            .set('Authorization', admin.auth)
            .expect(201);

        for (const parentId of [anaProfileId, bogdanProfileId]) {
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [parentId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
                .expect(201);
        }
    });

    /**
     * Raw SQL rather than the repositories, because the question is whether the rows are *gone* —
     * a repository that filters or joins could answer "no rows" while the data is still there,
     * which is the exact failure this suite exists to catch. Column names are per-table in this
     * schema (a relation key is snake_case only where a `@JoinColumn` names it so), and these were
     * read off the live schema rather than guessed.
     */
    const countRows = async (sql: string, params: unknown[] = []): Promise<number> => {
        const rows = await dataSource.query(sql, params);
        return Number(rows[0].count);
    };

    /**
     * The stubbed storage client `createTestApp` installs: `helpers.ts` replaces `S3Service` with
     * plain `jest.fn()`s, so its methods carry jest's surface rather than the real signatures.
     *
     * Written as a narrowing from `unknown` rather than a double assertion on the call, because
     * `no-unnecessary-type-assertion` strips `as unknown as X` under `--fix` and leaves the real
     * type behind — which typechecks locally right up until the moment `lint:fix` runs.
     */
    const stubbedStorage = (): { deleteObject: jest.Mock } => {
        const client: unknown = app.get(S3Service);
        return client as { deleteObject: jest.Mock };
    };

    const erase = (profileId: number) => request(app.getHttpServer()).post(`/privacy/erasure/${profileId}`).set('Authorization', admin.auth);

    describe('the request', () => {
        it('records the day without deleting anything', async () => {
            const res = await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', ana.auth).expect(201);

            expect(Date.parse(res.body.requestedAt as string)).not.toBeNaN();
            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [anaProfileId])).toBe(1);
        });

        // A second press is the same request made twice, and the first day is the one the term runs
        // from — moving it would hand the school another month for free.
        it('keeps the first day when the family asks twice', async () => {
            const first = await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', ana.auth).expect(201);
            const second = await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', ana.auth).expect(201);

            expect(second.body.requestedAt).toBe(first.body.requestedAt);
        });

        it('can be withdrawn, and then the family is not in the queue', async () => {
            await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', ana.auth).expect(201);
            await request(app.getHttpServer()).delete('/privacy/erasure').set('Authorization', ana.auth).expect(204);

            const pending = await request(app.getHttpServer()).get('/privacy/erasure/pending').set('Authorization', admin.auth).expect(200);
            expect(pending.body).toEqual([]);
        });

        it('puts the family in the office queue, oldest first', async () => {
            await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', bogdan.auth).expect(201);
            await request(app.getHttpServer()).post('/privacy/erasure').set('Authorization', ana.auth).expect(201);

            const pending = await request(app.getHttpServer()).get('/privacy/erasure/pending').set('Authorization', admin.auth).expect(200);

            expect(pending.body.map((row: { id: number }) => row.id)).toEqual([bogdanProfileId, anaProfileId]);
        });

        it('is not something a parent can carry out', async () => {
            await request(app.getHttpServer()).post(`/privacy/erasure/${anaProfileId}`).set('Authorization', ana.auth).expect(403);
            await request(app.getHttpServer()).get('/privacy/erasure/pending').set('Authorization', ana.auth).expect(403);
        });
    });

    describe('the erasure', () => {
        it('removes the family and everything hanging off the children', async () => {
            const sessionId = await createClassSession(dataSource, groupId, { date: '2026-03-04' });
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${anaChildId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);

            const res = await erase(anaProfileId).expect(201);

            expect(res.body.childrenRemoved).toBe(1);
            expect(res.body.invoicesKept).toBe(1);
            expect(res.body.accountRemoved).toBe(true);

            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [anaProfileId])).toBe(0);
            // The cascades, checked rather than assumed: enrolments and attendance hang off the
            // child and go with it.
            expect(await countRows('SELECT COUNT(*) FROM enrollments WHERE child_id = $1', [anaChildId])).toBe(0);
            expect(await countRows('SELECT COUNT(*) FROM attendances WHERE "childId" = $1', [anaChildId])).toBe(0);
        });

        /** The accounting obligation, and the reason the profile row survives at all. */
        it('keeps the invoices, and the row they point at', async () => {
            await erase(anaProfileId).expect(201);

            expect(await countRows('SELECT COUNT(*) FROM invoices WHERE parent_id = $1', [anaProfileId])).toBe(1);
            expect(await countRows('SELECT COUNT(*) FROM profiles WHERE id = $1', [anaProfileId])).toBe(1);
        });

        it('leaves nothing on the row that could identify anybody', async () => {
            await erase(anaProfileId).expect(201);

            const rows = await dataSource.query('SELECT * FROM profiles WHERE id = $1', [anaProfileId]);
            const profile = rows[0];

            expect(profile.firstName).toBe('Familie');
            expect(profile.lastName).toBe('ștearsă');
            expect(profile.email).toBeNull();
            expect(profile.phone).toBeNull();
            expect(profile.address).toBeNull();
            expect(profile.emergencyContactName).toBeNull();
            expect(profile.emergencyContactPhone).toBeNull();
            expect(profile.marketingOptIn).toBe(false);
            expect(profile.erasedAt).not.toBeNull();
            expect(profile.user_id).toBeNull();
        });

        it('takes the account with it, so nobody can log in afterwards', async () => {
            await erase(anaProfileId).expect(201);

            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana.stergere', password: 'parola123' }).expect(401);
            expect(await countRows('SELECT COUNT(*) FROM users WHERE username = $1', ['ana.stergere'])).toBe(0);
        });

        /** The one that would be a catastrophe. */
        it('does not touch the other family', async () => {
            const before = {
                children: await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [bogdanProfileId]),
                invoices: await countRows('SELECT COUNT(*) FROM invoices WHERE parent_id = $1', [bogdanProfileId]),
            };

            await erase(anaProfileId).expect(201);

            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [bogdanProfileId])).toBe(before.children);
            expect(await countRows('SELECT COUNT(*) FROM invoices WHERE parent_id = $1', [bogdanProfileId])).toBe(before.invoices);

            const stillThere = await request(app.getHttpServer()).get('/privacy/export').set('Authorization', bogdan.auth).expect(200);
            expect(stillThere.body.copii[0].nume).toBe('Andrei Ionescu');
            expect(stillThere.body.parinte.email).toBe('bogdan.stergere@example.com');
        });

        /**
         * The one a link cannot find. `Lead.profile` is written by the public trial form and by
         * nothing else, so a family whose first contact was a telephone call has a row carrying
         * their name, their address, their telephone number and their child's name and date of
         * birth, with nothing pointing at it from the family. Left behind, it is the erasure
         * telling a family their data is gone while it is not.
         */
        it('takes a lead an admin typed in from a phone call, matched by address', async () => {
            await request(app.getHttpServer())
                .post('/leads')
                .set('Authorization', admin.auth)
                .send({
                    parentName: 'Ana Test',
                    parentEmail: 'ana.stergere@example.com',
                    childFirstName: 'Maria',
                    childLastName: 'Pop',
                    childBirthDate: '2016-04-02',
                    source: 'phone',
                })
                .expect(201);
            expect(await countRows('SELECT COUNT(*) FROM leads WHERE profile_id IS NULL')).toBe(1);

            const report = await erase(anaProfileId).expect(201);

            expect(report.body.leadsRemoved).toBe(1);
            expect(await countRows('SELECT COUNT(*) FROM leads')).toBe(0);
        });

        it('finds the enquiry and the mail whatever capitals the address was typed in', async () => {
            // One mailbox, as registration and `forgot-password` read one: the office typed the
            // address from a phone call with capitals, and an old message went out the same way.
            await request(app.getHttpServer())
                .post('/leads')
                .set('Authorization', admin.auth)
                .send({
                    parentName: 'Ana Test',
                    parentEmail: 'Ana.Stergere@Example.com',
                    childFirstName: 'Maria',
                    childLastName: 'Pop',
                    childBirthDate: '2016-04-02',
                    source: 'phone',
                })
                .expect(201);
            await dataSource.query(`UPDATE outbox SET "to" = upper("to") WHERE "to" = 'ana.stergere@example.com'`);
            const shouted = await countRows(`SELECT COUNT(*) FROM outbox WHERE "to" = 'ANA.STERGERE@EXAMPLE.COM'`);
            expect(shouted).toBeGreaterThan(0);

            const report = await erase(anaProfileId).expect(201);

            expect(report.body.leadsRemoved).toBe(1);
            expect(report.body.messagesRemoved).toBeGreaterThanOrEqual(shouted);
            expect(await countRows('SELECT COUNT(*) FROM leads')).toBe(0);
            expect(await countRows(`SELECT COUNT(*) FROM outbox WHERE lower("to") = 'ana.stergere@example.com'`)).toBe(0);
        });

        it("leaves the other family's unlinked lead exactly where it was", async () => {
            await request(app.getHttpServer())
                .post('/leads')
                .set('Authorization', admin.auth)
                .send({
                    parentName: 'Bogdan Test',
                    parentEmail: 'bogdan.stergere@example.com',
                    childFirstName: 'Andrei',
                    childLastName: 'Ionescu',
                    childBirthDate: '2015-09-09',
                    source: 'phone',
                })
                .expect(201);

            const report = await erase(anaProfileId).expect(201);

            expect(report.body.leadsRemoved).toBe(0);
            const rows = await dataSource.query('SELECT "parentEmail" FROM leads');
            expect(rows).toEqual([{ parentEmail: 'bogdan.stergere@example.com' }]);
        });

        /**
         * A number a family typed into its own profile names nobody — nothing in the platform ever
         * checks one. Matched by it, this erasure would delete another family's enquiry.
         */
        /**
         * An erased child's seat is a freed seat. The cascade that takes the enrolment asks nobody,
         * so the family waiting for this group was never told — and the group's own occupancy
         * showed the seat free beside them.
         */
        it('hands the seats the erased children held to the waiting list', async () => {
            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ capacity: 2 }).expect(200);
            const waiting = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', bogdan.auth)
                .send({ firstName: 'Ilinca', lastName: 'Ionescu', birthDate: '2016-02-02', parentId: bogdanProfileId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: waiting.body.id as number, groupId })
                .expect(201);

            await erase(anaProfileId).expect(201);

            const [{ status }] = await dataSource.query<{ status: string }[]>('SELECT status FROM waitlist_entries WHERE child_id = $1', [
                waiting.body.id as number,
            ]);
            expect(status).toBe('OFFERED');
        });

        it('leaves an enquiry alone when all that matches it is a phone number the family typed', async () => {
            await request(app.getHttpServer())
                .post('/leads')
                .set('Authorization', admin.auth)
                .send({
                    parentName: 'Elena Vasile',
                    parentPhone: '0722000111',
                    childFirstName: 'Ioana',
                    childLastName: 'Vasile',
                    childBirthDate: '2017-05-06',
                    source: 'phone',
                })
                .expect(201);
            await request(app.getHttpServer()).put(`/profiles/${anaProfileId}`).set('Authorization', ana.auth).send({ phone: '0722000111' }).expect(200);

            const report = await erase(anaProfileId).expect(201);

            expect(report.body.leadsRemoved).toBe(0);
            expect(await countRows('SELECT COUNT(*) FROM leads')).toBe(1);
        });

        /**
         * The office's address, typed into a profile, would otherwise take the office's copy of
         * every registration notice and digest down with the family: the queue is searched by
         * address, and that one is not theirs until they have opened a link sent to it.
         */
        it("leaves the office's mail alone when the family typed the office's address", async () => {
            const office = officeAddress();
            await request(app.getHttpServer()).put(`/profiles/${anaProfileId}`).set('Authorization', ana.auth).send({ email: office }).expect(200);
            // Counted after the edit, which sent its own confirmation link to that address.
            const toOffice = await countRows('SELECT COUNT(*) FROM outbox WHERE "to" = $1', [office]);
            expect(toOffice).toBeGreaterThan(0);

            const report = await erase(anaProfileId).expect(201);

            expect(report.body.messagesRemoved).toBe(0);
            expect(await countRows('SELECT COUNT(*) FROM outbox WHERE "to" = $1', [office])).toBe(toOffice);
        });

        it('clears the note an admin wrote on a payment, and keeps the figures', async () => {
            const invoices = await request(app.getHttpServer()).get('/invoices').query({ parentId: anaProfileId }).set('Authorization', admin.auth).expect(200);
            const invoiceId = invoices.body[0].id as number;
            await request(app.getHttpServer())
                .post('/payments')
                .set('Authorization', admin.auth)
                .send({ invoiceId, amount: 100, date: '2026-03-05', notes: 'Ana a plătit cash la birou' })
                .expect(201);

            await erase(anaProfileId).expect(201);

            const rows = await dataSource.query('SELECT amount, notes FROM payments WHERE invoice_id = $1', [invoiceId]);
            expect(rows).toHaveLength(1);
            expect(Number(rows[0].amount)).toBe(100);
            expect(rows[0].notes).toBeNull();
        });

        /**
         * E16/S8. The line stays, like the payment it became — but with the payer's name and the
         * transfer's text on it, an emptied profile would be one join away from its name again.
         */
        it('blanks the bank line a payment came from, keeps its figures, and does not let it come back', async () => {
            const invoices = await request(app.getHttpServer()).get('/invoices').query({ parentId: anaProfileId }).set('Authorization', admin.auth).expect(200);
            const statement = 'Data;Nume platitor;Detalii;Referinta;Credit\n05.03.2026;POP ELENA;plata martie Maria Pop;RB2026030501;100,00';
            const importStatement = () =>
                request(app.getHttpServer()).post('/reconciliation/statements').set('Authorization', admin.auth).send({ content: statement }).expect(200);
            await importStatement();
            const [line] = await dataSource.query('SELECT id FROM bank_statement_lines');
            await request(app.getHttpServer())
                .post(`/reconciliation/lines/${line.id as number}/match`)
                .set('Authorization', admin.auth)
                .send({ invoiceId: invoices.body[0].id as number })
                .expect(200);

            await erase(anaProfileId).expect(201);

            const rows = await dataSource.query('SELECT amount, "bookedOn", counterparty, description, "bankReference", payment_id FROM bank_statement_lines');
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ counterparty: null, description: 'Șters la cererea familiei', bankReference: 'RB2026030501' });
            expect(Number(rows[0].amount)).toBe(100);
            expect(rows[0].payment_id).not.toBeNull();
            const [payment] = await dataSource.query('SELECT "externalReference", notes FROM payments WHERE id = $1', [rows[0].payment_id]);
            expect(payment).toEqual({ externalReference: 'RB2026030501', notes: null });
            // The same statement again is a duplicate, not a fresh line carrying the name back in.
            const again = await importStatement();
            expect(again.body).toMatchObject({ imported: 0, duplicates: 1 });
            expect(await countRows('SELECT count(*) FROM bank_statement_lines')).toBe(1);
        });

        /**
         * The review of 25 September 2026. The consents go with the children, and the erasure told
         * nobody — while the work may still be on the school's page, which the platform does not
         * publish and cannot take down. A withdrawal tells the office; the erasure has to as well.
         */
        it('tells the office when it takes a consent still in force, so published work can come down', async () => {
            await request(app.getHttpServer()).put(`/privacy/consents/${anaChildId}/promotion`).set('Authorization', ana.auth).expect(200);

            await erase(anaProfileId).expect(201);

            const notices = await dataSource.query<{ to: string; subject: string }[]>(
                `SELECT "to", subject FROM outbox WHERE "dedupeKey" LIKE 'publication-consent-erased-office:%'`,
            );
            expect(notices).toHaveLength(1);
            expect(notices[0].subject).toContain('Maria');
            expect(await countRows('SELECT COUNT(*) FROM publication_consents')).toBe(0);
        });

        /**
         * The review of 25 September 2026: the payment's note — the transfer's own text, which
         * families fill with their child's name — was copied into the trail as a value. The trail
         * outlives the family by design, so it was the one copy the erasure could not reach.
         */
        it('leaves no words the family wrote in the trail of a payment it kept', async () => {
            const invoices = await request(app.getHttpServer()).get('/invoices').query({ parentId: anaProfileId }).set('Authorization', admin.auth).expect(200);
            const statement = 'Data;Nume platitor;Detalii;Referinta;Credit\n05.03.2026;POP ELENA;plata martie Maria Pop;RB2026030501;100,00';
            await request(app.getHttpServer()).post('/reconciliation/statements').set('Authorization', admin.auth).send({ content: statement }).expect(200);
            const [line] = await dataSource.query('SELECT id FROM bank_statement_lines');
            await request(app.getHttpServer())
                .post(`/reconciliation/lines/${line.id as number}/match`)
                .set('Authorization', admin.auth)
                .send({ invoiceId: invoices.body[0].id as number })
                .expect(200);

            await erase(anaProfileId).expect(201);

            const trail = await request(app.getHttpServer()).get('/audit').query({ entityType: 'Payment' }).set('Authorization', admin.auth).expect(200);
            expect(trail.body.length).toBeGreaterThan(0);
            expect(JSON.stringify(trail.body)).not.toContain('Maria');
            expect(JSON.stringify(trail.body)).not.toContain('plata martie');
        });

        /**
         * The trail has to survive the family, and safely: it stores identifiers rather than names
         * (E07 S3), so "who erased profile 412 and when" stays answerable precisely because
         * everything else is gone.
         */
        it('leaves an audit entry, with no name in it', async () => {
            await erase(anaProfileId).expect(201);

            const trail = await request(app.getHttpServer())
                .get('/audit')
                .query({ entityType: 'Profile', entityId: anaProfileId })
                .set('Authorization', admin.auth)
                .expect(200);

            expect(trail.body.length).toBeGreaterThan(0);
            expect(trail.body[0].actorUsername).toBe('admin.stergere');
            expect(JSON.stringify(trail.body)).not.toContain('Maria');
            expect(JSON.stringify(trail.body)).not.toContain('ana.stergere@example.com');
        });

        /**
         * Deleting the rows is not deleting the data. A child's work lives in the bucket, and an
         * erasure that leaves it there has erased nothing a family would recognise as theirs. The
         * keys are derived from identifiers, so they have to be read *before* the rows go — after,
         * there is no way left to work out what to remove.
         */
        it("takes the children's files out of the bucket, and says how many", async () => {
            const storage = stubbedStorage();
            storage.deleteObject.mockClear();

            await request(app.getHttpServer())
                .post('/projects/ingest')
                .set('Authorization', admin.auth)
                .field('childId', String(anaChildId))
                .field('capturedOn', '2026-03-04')
                .attach('file', PNG, 'robot.png')
                .expect(201);

            const res = await erase(anaProfileId).expect(201);

            expect(res.body.filesRemoved).toBeGreaterThan(0);
            // Identifiers only, never a name — the keys travel into signed URLs and logs.
            for (const [key] of storage.deleteObject.mock.calls) {
                expect(String(key)).toMatch(/^projects\/\d+\//);
            }
        });

        /** The other half of what the accounting obligation keeps stays where it is. */
        it('leaves the invoice PDFs alone', async () => {
            const storage = stubbedStorage();
            storage.deleteObject.mockClear();

            await erase(anaProfileId).expect(201);

            for (const [key] of storage.deleteObject.mock.calls) {
                expect(String(key)).not.toContain('invoices/');
            }
        });

        /**
         * The whole argument for recording field names and not values, made testable — E07/S3.
         *
         * A `Profile`'s fields are held under the `account` retention rule and go when the family
         * goes; the trail is held under `audit` and outlives what it describes. If the values
         * crossed that line they would sit here afterwards, and nothing could clean them up: the
         * log has no relation to a profile, deliberately, so an erasure has nothing to walk.
         */
        it('holds no personal value of the family it just erased', async () => {
            await request(app.getHttpServer())
                .put(`/profiles/${anaProfileId}`)
                .set('Authorization', admin.auth)
                .send({ address: 'Str. Secretă 12', emergencyContactName: 'Bunica Ioana' })
                .expect(200);

            await erase(anaProfileId).expect(201);

            const trail = await request(app.getHttpServer()).get('/audit').query({ limit: 200 }).set('Authorization', admin.auth).expect(200);
            const wholeTrail = JSON.stringify(trail.body);

            // The edit is recorded — the fields are named — and the values are not there.
            expect(wholeTrail).toContain('address');
            expect(wholeTrail).not.toContain('Str. Secretă 12');
            expect(wholeTrail).not.toContain('Bunica Ioana');
            expect(wholeTrail).not.toContain('ana.stergere@example.com');
            expect(wholeTrail).not.toContain('Maria');
        });

        it('waits while an invoice of theirs is still on its way to SmartBill', async () => {
            // SmartBill's document is written from the family's name when it is sent: erased first,
            // it would go to SPV in the name of an emptied row.
            await dataSource.query(`UPDATE invoices SET "fiscalStatus" = 'pending' WHERE parent_id = $1`, [anaProfileId]);

            const refused = await erase(anaProfileId).expect(409);

            expect(refused.body.code).toBe('FAMILY_HAS_FISCAL_WORK');
            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [anaProfileId])).toBe(1);

            await dataSource.query(`UPDATE invoices SET "fiscalStatus" = 'issued' WHERE parent_id = $1`, [anaProfileId]);
            await erase(anaProfileId).expect(201);
        });

        it('refuses to do it twice', async () => {
            await erase(anaProfileId).expect(201);
            const res = await erase(anaProfileId).expect(409);

            // `AllExceptionsFilter` publishes a service's own `error` as `code` on the wire.
            expect(res.body.code).toBe('ALREADY_ERASED');
        });

        it('answers 404 for a family that does not exist', async () => {
            await request(app.getHttpServer()).post('/privacy/erasure/999999').set('Authorization', admin.auth).expect(404);
        });
    });
});
