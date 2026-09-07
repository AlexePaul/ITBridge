import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The evidence that an enrolment contract was signed — E07/S8, against a real database.
 *
 * The contract is paper. What the platform keeps is the fact and the day, and what the story asks
 * is that "a semnat familia X?" be answerable from a list: an enrolment with nothing on file shows
 * up there, recording the day takes it off, and the overview's count agrees with the list.
 */
describe('Contract evidence (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;

    const http = () => request(app.getHttpServer());

    const makeChild = async (firstName: string): Promise<number> => {
        const res = await http()
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName, lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        return res.body.id as number;
    };

    const enrol = async (childId: number, body: Record<string, unknown> = {}): Promise<number> => {
        const res = await http()
            .post('/enrollments')
            .set('Authorization', admin.auth)
            .send({ childId, groupId, startDate: '2026-01-10', ...body })
            .expect(201);
        return res.body.id as number;
    };

    const withoutContract = () => http().get('/enrollments/without-contract').set('Authorization', admin.auth).expect(200);

    const record = (id: number, contractSignedAt: string | null) =>
        http().put(`/enrollments/${id}/contract`).set('Authorization', admin.auth).send({ contractSignedAt });

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.contracte'));
        parent = await registerUser(app, 'familia.contracte');
        const roomId = await createRoom(app, admin);
        const group = await http().post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
    });

    it('is for admins only', async () => {
        await http().get('/enrollments/without-contract').set('Authorization', parent.auth).expect(403);
        await http().put('/enrollments/1/contract').set('Authorization', parent.auth).send({ contractSignedAt: '2026-01-10' }).expect(403);
        await http().get('/enrollments/without-contract').expect(401);
    });

    it('lists the enrolment with nothing on file, with the child, the family and the group, and takes it off once the day is recorded', async () => {
        const ana = await makeChild('Ana');
        const bogdan = await makeChild('Bogdan');
        const unsigned = await enrol(ana);
        await enrol(bogdan, { contractSignedAt: '2026-01-09' });

        const before = await withoutContract();
        expect(before.body).toHaveLength(1);
        expect(before.body[0]).toMatchObject({
            id: unsigned,
            status: 'ACTIVE',
            contractSignedAt: null,
            child: { firstName: 'Ana', lastName: 'Test', parent: { phone: expect.any(String) } },
            group: { id: groupId },
        });

        const recorded = await record(unsigned, '2026-01-12').expect(200);
        expect(recorded.body).toMatchObject({ id: unsigned, contractSignedAt: '2026-01-12' });

        expect((await withoutContract()).body).toEqual([]);
        // The history the child's page reads shows the same day.
        const history = await http().get(`/enrollments/child/${ana}`).set('Authorization', admin.auth).expect(200);
        expect(history.body[0]).toMatchObject({ id: unsigned, contractSignedAt: '2026-01-12' });
    });

    it('clears a mistaken day with null, and the enrolment is back on the list', async () => {
        const ana = await makeChild('Ana');
        const id = await enrol(ana, { contractSignedAt: '2026-01-09' });
        expect((await withoutContract()).body).toEqual([]);

        await record(id, null).expect(200);

        expect((await withoutContract()).body.map((row: { id: number }) => row.id)).toEqual([id]);
    });

    it('does not list a trial, and refuses to record a contract on one', async () => {
        const ana = await makeChild('Ana');
        const trial = await enrol(ana, { status: 'TRIAL' });

        expect((await withoutContract()).body).toEqual([]);
        const res = await record(trial, '2026-01-12').expect(409);
        expect(res.body.code).toBe('TRIAL_HAS_NO_CONTRACT');

        // Confirmed, the trial becomes an active enrolment with nothing on file — and is listed.
        await http().put(`/enrollments/${trial}/resolve-trial`).set('Authorization', admin.auth).send({ accepted: true }).expect(200);
        expect((await withoutContract()).body.map((row: { id: number }) => row.id)).toEqual([trial]);
        await record(trial, '2026-01-12').expect(200);
        expect((await withoutContract()).body).toEqual([]);
    });

    it('does not list a closed enrolment — the family has left, and the folder is the folder', async () => {
        const ana = await makeChild('Ana');
        const id = await enrol(ana);
        await http().put(`/enrollments/${id}/close`).set('Authorization', admin.auth).send({ status: 'WITHDRAWN', exitReason: 'S-a mutat' }).expect(200);

        expect((await withoutContract()).body).toEqual([]);
        // Recording on it is still allowed: a contract that was signed back then is a fact about the past.
        await record(id, '2026-01-12').expect(200);
    });

    it('refuses a day in the future and a day that is not a day', async () => {
        const ana = await makeChild('Ana');
        const id = await enrol(ana);

        expect((await record(id, '2999-01-01').expect(400)).body.code).toBe('CONTRACT_DATE_IN_FUTURE');
        await record(id, 'ieri').expect(400);
        await http().put(`/enrollments/${id}/contract`).set('Authorization', admin.auth).send({}).expect(400);
    });

    it("the overview's count is the list's length", async () => {
        const ana = await makeChild('Ana');
        const bogdan = await makeChild('Bogdan');
        await enrol(ana);
        const signed = await enrol(bogdan);
        await record(signed, '2026-01-12').expect(200);

        const list = await withoutContract();
        const overview = await http().get('/overview').set('Authorization', admin.auth).expect(200);
        expect(overview.body.enrollmentsWithoutContract).toBe(list.body.length);
        expect(overview.body.enrollmentsWithoutContract).toBe(1);
    });
});
