import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Issuing a month from session counts — E15, the model actually in force.
 *
 * The school charges per session held, not per month, and did the arithmetic by hand. This is that
 * arithmetic, done once from numbers an admin has checked, plus the two things that make the screen
 * safe to use: it can be run twice, and a month that comes to nothing is recorded rather than
 * skipped.
 */
describe('Issuing invoices from sessions (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;

    const childSeq = { n: 0 };

    const makeChild = async (): Promise<number> => {
        childSeq.n += 1;
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: `Copil${childSeq.n}`, lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        const childId = res.body.id as number;
        await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
        return childId;
    };

    const issue = (families: { parentId: number; children: { childId: number; sessions: number }[] }[], monthIssued = '2026-10') =>
        request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued, dateIssued: `${monthIssued}-01`, families });

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
        it('lists a family with its children and their groups, and no amounts', async () => {
            await makeChild();

            const res = await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ alreadyInvoiced: false, children: [expect.objectContaining({ groupName: 'Scratch Începători' })] });
            // No amount on the wire: the arithmetic belongs on the screen, where somebody reads it.
            expect(res.body[0]).not.toHaveProperty('amount');
        });

        it('leaves out a family with no child in any group', async () => {
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ parentId: await ownProfileId(app, parent), firstName: 'Nerepartizat', lastName: 'Test', birthDate: '2016-05-04' })
                .expect(201);

            const res = await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(0);
        });

        it('marks a family that already has an invoice for the month', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue([{ parentId, children: [{ childId, sessions: 4 }] }]).expect(201);

            const res = await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);
            expect(res.body[0].alreadyInvoiced).toBe(true);
        });
    });

    describe('the amounts', () => {
        it('bills the sessions given, not a flat month', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);

            // June had two classes and was invoiced at 175 by hand. That is the rule now.
            const res = await issue([{ parentId, children: [{ childId, sessions: 2 }] }]).expect(201);
            expect(res.body.issued[0].amount).toBe(175);
        });

        it('applies the sibling rate to the child with fewer sessions', async () => {
            const first = await makeChild();
            const second = await makeChild();
            const parentId = await ownProfileId(app, parent);

            const res = await issue([
                {
                    parentId,
                    children: [
                        { childId: first, sessions: 3 },
                        { childId: second, sessions: 5 },
                    ],
                },
            ]).expect(201);
            // 5 × 87.50 + 3 × 62.50 — the full rate follows the sessions, not the row order.
            expect(res.body.issued[0].amount).toBe(625);
        });

        it('issues one invoice per family, not per child', async () => {
            await makeChild();
            await makeChild();
            const parentId = await ownProfileId(app, parent);
            const worksheet = await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);

            const res = await issue([
                { parentId, children: worksheet.body[0].children.map((child: { childId: number }) => ({ childId: child.childId, sessions: 4 })) },
            ]).expect(201);

            expect(res.body.issued).toHaveLength(1);
            expect(res.body.issued[0].amount).toBe(600);
        });
    });

    describe('a month that comes to nothing', () => {
        it('is recorded as a row, not skipped', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);

            const res = await issue([{ parentId, children: [{ childId, sessions: 0 }] }]).expect(201);

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
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);
            const waived = await issue([{ parentId, children: [{ childId, sessions: 0 }] }]).expect(201);

            // Nothing to print, nobody to ask for money. The download is a 404, not an empty page.
            await request(app.getHttpServer()).get(`/invoices/${waived.body.waived[0].id}/pdf`).set('Authorization', admin.auth).expect(404);
        });

        it('still blocks a second invoice for that month', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue([{ parentId, children: [{ childId, sessions: 0 }] }]).expect(201);

            const second = await issue([{ parentId, children: [{ childId, sessions: 4 }] }]).expect(201);
            expect(second.body.skipped).toEqual([{ parentId, reason: 'ALREADY_INVOICED' }]);
        });
    });

    describe('running the screen twice', () => {
        it('skips the families already invoiced and issues only the new one', async () => {
            const firstChild = await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue([{ parentId, children: [{ childId: firstChild, sessions: 4 }] }]).expect(201);

            // A second family enrols on the fifth. The whole month must not fail because of it.
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
                .send({ childId: otherChild.body.id as number, groupId })
                .expect(201);

            const res = await issue([
                { parentId, children: [{ childId: firstChild, sessions: 4 }] },
                { parentId: otherProfileId, children: [{ childId: otherChild.body.id as number, sessions: 2 }] },
            ]).expect(201);

            expect(res.body.skipped).toEqual([{ parentId, reason: 'ALREADY_INVOICED' }]);
            expect(res.body.issued).toHaveLength(1);
            expect(res.body.issued[0].amount).toBe(175);
        });
    });

    describe('validation and authorization', () => {
        it('refuses a missing session count, because an amount nobody stated must not be invoiced', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);

            await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [{ parentId, children: [{ childId }] }] })
                .expect(400);
        });

        it('refuses a negative count', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue([{ parentId, children: [{ childId, sessions: -1 }] }]).expect(400);
        });

        it('accepts zero, which is a different thing from missing', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);
            await issue([{ parentId, children: [{ childId, sessions: 0 }] }]).expect(201);
        });

        it('refuses a parent', async () => {
            const childId = await makeChild();
            const parentId = await ownProfileId(app, parent);

            await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', parent.auth)
                .send({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [{ parentId, children: [{ childId, sessions: 4 }] }] })
                .expect(403);
        });
    });
});
