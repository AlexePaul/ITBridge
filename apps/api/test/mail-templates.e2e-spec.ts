import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, registrationBody, TestUser, truncateAll } from './helpers';

/**
 * The acceptance of E17/S2, end to end: a template edited through the API changes the next message
 * that goes out, with no deploy in between. The registration flow is the sender under test because
 * it queues two messages in the same transaction as the account it creates.
 */
describe('Mail templates (e2e)', () => {
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
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.templates'));
    });

    /** Scoped by recipient: the admin's own registration in beforeEach queues mail too. */
    const outboxRow = async (subjectLike: string, to: string) =>
        dataSource.query<{ subject: string; bodyText: string; bodyHtml: string | null }[]>(
            `SELECT "subject", "bodyText", "bodyHtml" FROM "outbox" WHERE "subject" LIKE $1 AND "to" = $2`,
            [subjectLike, to],
        );

    it('a registration queues the default wording, HTML variant included', async () => {
        await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.unu')).expect(201);

        const rows = await outboxRow('Confirmă adresa de email%', 'parinte.unu@example.com');
        expect(rows).toHaveLength(1);
        expect(rows[0].bodyText).toContain('Linkul e valabil 48 de ore');
        // S2 promises both variants; the parent-facing mails carry HTML now.
        expect(rows[0].bodyHtml).toContain('IT Bridge School');
    });

    it('an edited template changes the next message — no deploy in between', async () => {
        await request(app.getHttpServer())
            .put('/mail-templates/email-confirmation')
            .set('Authorization', admin.auth)
            .send({ subject: 'Bine ai venit, {{firstName}}!', bodyText: 'Linkul tău: {{confirmUrl}}', bodyHtml: null })
            .expect(200);

        await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.doi')).expect(201);

        const rows = await outboxRow('Bine ai venit%', 'parinte.doi@example.com');
        expect(rows).toHaveLength(1);
        expect(rows[0].bodyText).toContain('Linkul tău: http');
        expect(rows[0].bodyHtml).toBeNull();
    });

    it('revert goes back to the code, and the next message proves it', async () => {
        await request(app.getHttpServer())
            .put('/mail-templates/email-confirmation')
            .set('Authorization', admin.auth)
            .send({ subject: 'Altceva', bodyText: 'X {{confirmUrl}}' })
            .expect(200);
        await request(app.getHttpServer()).delete('/mail-templates/email-confirmation').set('Authorization', admin.auth).expect(200);

        await request(app.getHttpServer()).post('/auth/register').send(registrationBody('parinte.trei')).expect(201);

        expect(await outboxRow('Confirmă adresa de email%', 'parinte.trei@example.com')).toHaveLength(1);
    });

    it('the preview renders the draft with sample data, without saving anything', async () => {
        const res = await request(app.getHttpServer())
            .post('/mail-templates/email-confirmation/preview')
            .set('Authorization', admin.auth)
            .send({ subject: 'Salut, {{firstName}} / {{typo}}' })
            .expect(201);

        expect(res.body.subject).toBe('Salut, Ana / {{typo}}');

        const list = await request(app.getHttpServer()).get('/mail-templates').set('Authorization', admin.auth).expect(200);
        expect(list.body.find((row: { key: string }) => row.key === 'email-confirmation').customized).toBe(false);
    });

    it('refuses a key the code never sends', async () => {
        await request(app.getHttpServer()).put('/mail-templates/newsletter').set('Authorization', admin.auth).send({ subject: 'S', bodyText: 'B' }).expect(404);
    });

    it('is closed to parents', async () => {
        const parent = await registerUser(app, 'parinte.patru');
        await request(app.getHttpServer()).get('/mail-templates').set('Authorization', parent.auth).expect(403);
    });
});
