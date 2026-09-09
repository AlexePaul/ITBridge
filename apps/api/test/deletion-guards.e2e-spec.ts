import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * What a delete is allowed to take, against a real database — because the whole question is what
 * the *database* does after the statement, and no mock can answer it.
 *
 * `children.parent_id`, `invoices.parent_id` and `discounts.parent_id` are all `CASCADE`, and
 * `payments.invoice_id` is `CASCADE` after that. So one delete used to take the children, every
 * mark of attendance against them, every project they saved, every invoice the school issued and
 * every payment it recorded — from a screen whose own words promised that none of it would move.
 *
 * Keeping the invoices is not a preference: E04/S5 decided the platform keeps the evidence of what
 * a family paid, and E07/S4 leaves an emptied shell row behind precisely because `Invoice.parent`
 * cascades. The tests below assert the rows are still there afterwards rather than trusting the
 * status code, since a 409 with the delete having happened anyway is exactly the shape of failure
 * that would matter.
 */
describe('Deletion guards (e2e)', () => {
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
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.stergere.profil'));
        ana = await registerUser(app, 'ana.stergere.profil');
        anaProfileId = await ownProfileId(app, ana);
    });

    const countRows = async (sql: string, params: unknown[] = []): Promise<number> => {
        const rows = await dataSource.query(sql, params);
        return Number(rows[0].count);
    };

    /** Enrolled, not merely added: the invoice counts enrolments in force, so a child in no group bills nothing. */
    const addChild = async (): Promise<number> => {
        const created = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', ana.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-02', parentId: anaProfileId })
            .expect(201);
        const childId = created.body.id as number;
        await enrolInNewGroup(app, admin, [childId]);
        return childId;
    };

    const groupOf = async (childId: number): Promise<number> => {
        const rows = await dataSource.query<{ group_id: number }[]>('SELECT group_id FROM enrollments WHERE child_id = $1 LIMIT 1', [childId]);
        return rows[0].group_id;
    };

    const issueInvoice = () =>
        request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [anaProfileId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
            .expect(201);

    const deleteProfile = (auth: string) => request(app.getHttpServer()).delete(`/profiles/${anaProfileId}`).set('Authorization', auth);

    describe('deleting a profile', () => {
        it('lets an admin remove a profile that has nothing hanging off it', async () => {
            await deleteProfile(admin.auth).expect(204);

            expect(await countRows('SELECT COUNT(*) FROM profiles WHERE id = $1', [anaProfileId])).toBe(0);
        });

        it('refuses when the family has invoices, and the invoices are still there', async () => {
            await addChild();
            await issueInvoice();

            const refused = await deleteProfile(admin.auth).expect(409);

            expect(refused.body.code).toBe('PROFILE_HAS_INVOICES');
            expect(await countRows('SELECT COUNT(*) FROM invoices WHERE parent_id = $1', [anaProfileId])).toBe(1);
            expect(await countRows('SELECT COUNT(*) FROM profiles WHERE id = $1', [anaProfileId])).toBe(1);
        });

        it('refuses when the family has children, and the children are still there', async () => {
            await addChild();

            const refused = await deleteProfile(admin.auth).expect(409);

            expect(refused.body.code).toBe('PROFILE_HAS_CHILDREN');
            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [anaProfileId])).toBe(1);
        });

        /**
         * The route is on the parent-writable list in `authorization.spec.ts`, so a family could reach
         * it for their own profile. Erasure is a right, but it is not a right to delete the school's
         * accounting record — that door is `/admin/stergeri`, and it keeps the invoices.
         */
        it('refuses a parent deleting their own family out from under the invoices', async () => {
            await addChild();
            await issueInvoice();

            const refused = await deleteProfile(ana.auth).expect(409);

            expect(refused.body.code).toBe('PROFILE_HAS_INVOICES');
            expect(await countRows('SELECT COUNT(*) FROM invoices WHERE parent_id = $1', [anaProfileId])).toBe(1);
        });

        it('names the invoices first when the family has both', async () => {
            await addChild();
            await issueInvoice();

            const refused = await deleteProfile(admin.auth).expect(409);

            expect(refused.body.code).toBe('PROFILE_HAS_INVOICES');
        });
    });

    /**
     * The same cascade one level down, and reachable by the family themselves: everything that
     * hangs off a `Child` is CASCADE, so `DELETE /children/:id` used to take the enrolment and the
     * register with it — measured before this guard existed: one child, one enrolment and one mark
     * before; zero of each after, 200 OK, from a parent's own token.
     */
    describe('deleting a child', () => {
        it('is allowed for a child who has been nowhere', async () => {
            const created = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', ana.auth)
                .send({ firstName: 'Ilinca', lastName: 'Pop', birthDate: '2017-01-05', parentId: anaProfileId })
                .expect(201);

            await request(app.getHttpServer())
                .delete(`/children/${created.body.id as number}`)
                .set('Authorization', ana.auth)
                .expect(200);

            expect(await countRows('SELECT COUNT(*) FROM children WHERE parent_id = $1', [anaProfileId])).toBe(0);
        });

        it('refuses once the child has been marked, and the register is still there', async () => {
            const childId = await addChild();
            const sessionId = await createClassSession(dataSource, await groupOf(childId));
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);

            const refused = await request(app.getHttpServer()).delete(`/children/${childId}`).set('Authorization', ana.auth).expect(409);

            expect(refused.body.code).toBe('CHILD_HAS_ATTENDANCE');
            expect(await countRows('SELECT COUNT(*) FROM attendances WHERE "childId" = $1', [childId])).toBe(1);
            expect(await countRows('SELECT COUNT(*) FROM enrollments WHERE child_id = $1', [childId])).toBe(1);
        });

        /** An enrolment records an intention, not an event, so undoing a mis-entry stays possible. */
        it('still allows it for a child placed in a group but never marked', async () => {
            const childId = await addChild();

            await request(app.getHttpServer()).delete(`/children/${childId}`).set('Authorization', admin.auth).expect(200);

            expect(await countRows('SELECT COUNT(*) FROM children WHERE id = $1', [childId])).toBe(0);
        });
    });
});
