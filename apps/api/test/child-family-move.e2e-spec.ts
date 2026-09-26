import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, type TestUser } from './helpers';

/**
 * A child joined to the family it belongs with (QA of 26 September 2026).
 *
 * Every `/proba` booking writes its own shell family — deliberately without email or phone — so
 * two siblings booked one after the other were two families, and no screen could put them back
 * together: sibling pricing never applied and the second family could never be removed.
 */
describe('Moving a child to another family (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.familii'));
    });

    /** A family the way `/proba` writes one: a shell with a name and nothing to reach it by. */
    const shellFamily = async (lastName: string): Promise<number> => {
        const res = await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Părinte', lastName }).expect(201);
        return res.body.id as number;
    };

    const childIn = async (parentId: number, firstName: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ firstName, lastName: 'Pop', birthDate: '2016-04-02', parentId })
            .expect(201);
        return res.body.id as number;
    };

    const move = (childId: number, profileId: number, auth = admin.auth) =>
        request(app.getHttpServer()).put(`/children/${childId}/family`).set('Authorization', auth).send({ profileId });

    it('puts the sibling in the family, takes its enquiry along, and leaves the shell deletable', async () => {
        const family = await shellFamily('Pop');
        const shell = await shellFamily('Pop (a doua programare)');
        await childIn(family, 'Ana');
        const brother = await childIn(shell, 'Andrei');
        await dataSource.query(
            `INSERT INTO leads (source, "parentName", "childFirstName", "childLastName", "childBirthDate", "lastActivityAt", profile_id, child_id)
             VALUES ('trial_form', 'Părinte Pop', 'Andrei', 'Pop', '2016-04-02', now(), $1, $2)`,
            [shell, brother],
        );

        await move(brother, family).expect(200);

        const siblings: { id: number }[] = await dataSource.query('SELECT id FROM children WHERE parent_id = $1 ORDER BY id', [family]);
        expect(siblings).toHaveLength(2);
        const [lead]: { profile_id: number }[] = await dataSource.query('SELECT profile_id FROM leads WHERE child_id = $1', [brother]);
        expect(lead?.profile_id).toBe(family);
        const trail: { note: string }[] = await dataSource.query(`SELECT note FROM audit_log WHERE entity_type = 'Child' AND entity_id = $1`, [brother]);
        expect(trail.map((row) => row.note)).toContain(`copil mutat din familia ${shell} în familia ${family}`);

        await request(app.getHttpServer()).delete(`/profiles/${shell}`).set('Authorization', admin.auth).expect(204);
    });

    it('refuses to move a child out of a family that has invoices — the history would split', async () => {
        const family = await shellFamily('Ionescu');
        const other = await shellFamily('Popescu');
        const child = await childIn(family, 'Maria');
        // A row, the way issuing writes one: the refusal is about the row existing, not its sum.
        await dataSource.query(
            `INSERT INTO invoices (amount, "dateIssued", "monthIssued", status, parent_id) VALUES (350, '2026-03-02', '2026-03', 'pending', $1)`,
            [family],
        );

        const refused = await move(child, other).expect(409);

        expect(refused.body.code).toBe('CHILD_FAMILY_INVOICED');
    });

    it('says so when the child is already in that family, and is not a parent’s to do', async () => {
        const family = await shellFamily('Radu');
        const child = await childIn(family, 'Ioana');
        const already = await move(child, family).expect(400);
        expect(already.body.code).toBe('CHILD_ALREADY_IN_FAMILY');

        const parent = await registerUser(app, 'parinte.familii');
        await move(child, family, parent.auth).expect(403);
    });
});
