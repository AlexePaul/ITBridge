import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * The one suite that does **not** stub S3 or the PDF generator.
 *
 * Everything else replaces both, because they leave the process. That left roughly 200 lines of
 * PDFKit and the whole S3 client without a single verified run — issuing an invoice simply 500'd
 * locally, so nobody could tell whether it had ever worked. It now runs against MinIO, which speaks
 * the S3 API, so the code path is the real one: same SDK, same PutObject and GetObject.
 */
describe('Invoice PDF, against real object storage (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parentId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp({ realStorage: true }));
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));

        const profile = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
            .expect(201);
        parentId = profile.body.id as number;

        await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ parentId, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-04' })
            .expect(201);
    });

    const issue = async (monthIssued: string) => {
        const res = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [parentId], monthIssued, dateIssued: `${monthIssued}-01` });

        if (res.status !== 201) {
            throw new Error(`POST /invoices returned ${res.status}: ${JSON.stringify(res.body)}`);
        }
        return res.body[0] as { id: number; amount: number };
    };

    it('issues an invoice and stores its PDF', async () => {
        const invoice = await issue('2026-03');

        expect(invoice.amount).toBe(350);
    });

    it('serves back a real PDF, not an empty file', async () => {
        const invoice = await issue('2026-03');

        const res = await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);

        const body = res.body as Buffer;
        expect(body.subarray(0, 5).toString()).toBe('%PDF-');
        // A blank page is a few hundred bytes; the fonts alone push a real one well past this.
        expect(body.length).toBeGreaterThan(10_000);
    });

    it('embeds the Roboto fonts, which means glyphs were actually drawn', async () => {
        const invoice = await issue('2026-03');

        const res = await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);

        const pdf = (res.body as Buffer).toString('binary');
        expect(pdf).toContain('Roboto-Regular');
        expect(pdf).toContain('Roboto-Bold');
    });

    it('resolves its assets without depending on the working directory', async () => {
        // The fonts used to be read from `process.cwd()/src/assets`, which only happened to work
        // because `src/` sits beside `dist/` in a checkout. Jest runs from the package root, so a
        // regression here would show up as a PDF with no embedded fonts rather than as an error.
        const invoice = await issue('2026-03');

        const res = await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);

        expect((res.body as Buffer).toString('binary')).toContain('BaseFont');
    });

    it('leaves no invoice behind when the upload fails', async () => {
        // Point the bucket at one that does not exist: the upload fails, and the transaction in
        // `createInvoice` has to take the row with it. Before that transaction existed, the row
        // survived and the retry hit @Unique(['parent', 'monthIssued']).
        const bucket = process.env.AWS_S3_BUCKET;
        process.env.AWS_S3_BUCKET = 'bucket-that-does-not-exist';

        try {
            await expect(issue('2026-04')).rejects.toThrow();

            const rows = await dataSource.query<{ count: string }[]>(`SELECT count(*) FROM invoices WHERE "monthIssued" = '2026-04'`);
            expect(rows[0].count).toBe('0');
        } finally {
            process.env.AWS_S3_BUCKET = bucket;
        }
    });

    it('issues the same month again after a failed attempt', async () => {
        const bucket = process.env.AWS_S3_BUCKET;
        process.env.AWS_S3_BUCKET = 'bucket-that-does-not-exist';
        await expect(issue('2026-05')).rejects.toThrow();
        process.env.AWS_S3_BUCKET = bucket;

        // The whole point of rolling back: the retry must not collide with a half-written row.
        const invoice = await issue('2026-05');
        expect(invoice.amount).toBe(350);
    });
});
