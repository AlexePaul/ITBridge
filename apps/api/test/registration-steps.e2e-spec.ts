import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import {
    createRoom,
    createTestApp,
    groupBody,
    ownProfileId,
    profileCompletionBody,
    promoteToAdmin,
    registerUser,
    registrationBody,
    TestUser,
    truncateAll,
} from './helpers';

/**
 * Registration in two required steps — E11/S2, revised.
 *
 * The unit tests cover each half. What only this suite can show is that the halves add up to the
 * same guarantee the single ten-field form gave: a family cannot end up in a group while the school
 * has no way to reach them. The difference from the state E11/S2 repaired is that step two is not
 * optional, and these tests are what say so.
 */
describe('Registration steps (e2e)', () => {
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
        admin = await registerUser(app, 'admin.reg');
        admin = await promoteToAdmin(app, dataSource, admin);
    });

    describe('step one', () => {
        it('accepts an account with no contact details beyond the email', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.nou')).expect(201);
        });

        it('refuses the fields that moved to step two, rather than ignoring them', async () => {
            // `forbidNonWhitelisted` is what makes the split real: a client still sending the old
            // ten-field body is told, not silently half-honoured.
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...registrationBody('parinte.vechi'), phone: '0712345678', address: 'Str. Veche 1' })
                .expect(400);
        });

        it('writes a profile that exists but is not yet complete', async () => {
            const parent = await registerUser(app, 'parinte.pasul1', 'parola123', { completeProfile: false });

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', parent.auth).expect(200);
            expect(me.body.profileComplete).toBe(false);

            // The row is there — which is exactly why the old "has no profile" test for the redirect
            // stopped working and had to become "is not complete".
            const profiles = await request(app.getHttpServer()).get('/profiles').set('Authorization', parent.auth).expect(200);
            expect(profiles.body).toHaveLength(1);
        });
    });

    describe('step two', () => {
        it('turns the account complete, and says so on /auth/me', async () => {
            const parent = await registerUser(app, 'parinte.pasul2', 'parola123', { completeProfile: false });
            const profileId = await ownProfileId(app, parent);

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send(profileCompletionBody()).expect(200);

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', parent.auth).expect(200);
            expect(me.body.profileComplete).toBe(true);
        });

        it('is not complete without the emergency contact — the half the old setup screen never asked for', async () => {
            const parent = await registerUser(app, 'parinte.fara.urgenta', 'parola123', { completeProfile: false });
            const profileId = await ownProfileId(app, parent);
            // Destructured off and dropped; the `_` prefix is the repo's mark for deliberately unused.
            const { emergencyContactName: _name, emergencyContactRelation: _relation, emergencyContactPhone: _phone, ...rest } = profileCompletionBody();

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send(rest).expect(200);

            const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', parent.auth).expect(200);
            expect(me.body.profileComplete).toBe(false);
        });

        it('refuses a phone number another family already has — the check that moved here from register', async () => {
            const first = await registerUser(app, 'parinte.telefon.unu');
            const second = await registerUser(app, 'parinte.telefon.doi', 'parola123', { completeProfile: false });

            const firstProfile = await request(app.getHttpServer()).get('/profiles').set('Authorization', first.auth).expect(200);
            const takenPhone = (firstProfile.body as { phone: string }[])[0].phone;

            const profileId = await ownProfileId(app, second);
            await request(app.getHttpServer())
                .put(`/profiles/${profileId}`)
                .set('Authorization', second.auth)
                .send({ ...profileCompletionBody(), phone: takenPhone })
                .expect(409);
        });

        it('belongs to the parent whose profile it is, and to nobody else', async () => {
            const owner = await registerUser(app, 'parinte.proprietar', 'parola123', { completeProfile: false });
            const stranger = await registerUser(app, 'parinte.strain');
            const profileId = await ownProfileId(app, owner);

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', stranger.auth).send(profileCompletionBody()).expect(401);
        });
    });

    describe('the guarantee the split has to preserve', () => {
        const childInGroup = async (parent: TestUser) => {
            const roomId = await createRoom(app, admin);
            const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
            const profileId = await ownProfileId(app, parent);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Maria', lastName: 'Test', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            return { childId: child.body.id as number, groupId: group.body.id as number };
        };

        it('refuses to place a child while the family has not finished step two', async () => {
            const parent = await registerUser(app, 'parinte.incomplet', 'parola123', { completeProfile: false });
            const { childId, groupId } = await childInGroup(parent);

            const res = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(409);

            // Named apart from the account gate on purpose: an inactive account waits on an admin,
            // an incomplete profile waits on the parent, and telling them the wrong one sends them
            // to wait for somebody who has nothing to do.
            expect(res.body.error).toBe('PARENT_PROFILE_INCOMPLETE');
        });

        it('places the child once step two is done', async () => {
            const parent = await registerUser(app, 'parinte.complet', 'parola123', { completeProfile: false });
            const { childId, groupId } = await childInGroup(parent);
            const profileId = await ownProfileId(app, parent);

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send(profileCompletionBody()).expect(200);

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
        });
    });
});
