import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll } from './helpers';

/**
 * Bug: `createProfile` verifică unicitatea prin
 * `findOne({ where: { email: createProfileDto.email } })`. Când `email` lipsește, TypeORM elimină
 * condiția nedefinită, interogarea devine „găsește orice profil", iar al doilea profil fără email
 * primește 409. Identic pentru `phone`.
 *
 * Blochează exact fluxul documentat în CLAUDE.md: adminul creează profiluri fără cont și fără date
 * de contact, urmând să le lege ulterior.
 *
 * Testele descriu comportamentul dorit și sunt marcate `.failing` cât timp bug-ul există — devin
 * roșii în clipa în care e reparat. Reparația e a lui E05, nu a acestui PR.
 */
describe('Creare de profiluri fără date de contact (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    const createAdmin = async () => promoteToAdmin(app, dataSource, await registerUser(app, 'admin'), 'parola123');

    it('primul profil fără email trece', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);
    });

    it.failing('al doilea profil fără email ar trebui să treacă și el', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Bogdan', lastName: 'Ion' }).expect(201);
    });

    it('documentează comportamentul actual: al doilea primește 409', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Bogdan', lastName: 'Ion' }).expect(409);
    });

    it('email distinct nu e de ajuns: verificarea pe telefon degenerează la fel', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'bogdan@example.com' })
            .expect(409);
    });

    it('abia cu email ȘI telefon distincte trec amândouă — de aceea bug-ul a rămas nevăzut', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'bogdan@example.com', phone: '+40700000002' })
            .expect(201);
    });
});
