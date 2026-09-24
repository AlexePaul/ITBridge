import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';
import { S3Service } from 'src/modules/storage/s3.service';
import { PdfService } from 'src/modules/invoice/pdf.service';

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

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ parentId, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-04' })
            .expect(201);

        // An invoice needs an active enrolment behind it now, not merely a child on file (E11/S4).
        await enrolInNewGroup(app, admin, [child.body.id as number]);
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

    const download = (id: number) => request(app.getHttpServer()).get(`/invoices/${id}/pdf`).set('Authorization', admin.auth);
    const keyOf = (id: number, month = '2026-03') => `invoices/${month}/${id}.pdf`;
    const kept = (id: number, month = '2026-03') => app.get(S3Service).headObject(keyOf(id, month));

    /**
     * An invoice with a clean slate in the bucket. The bucket outlives `truncateAll` and invoice ids
     * start again at 1, so a drawing kept by an earlier run can sit at exactly this key — and would
     * make "the first download drew it" pass without anything having been drawn.
     */
    const issueFresh = async (monthIssued: string) => {
        const invoice = await issue(monthIssued);
        await app.get(S3Service).deleteObject(keyOf(invoice.id, monthIssued));
        return invoice;
    };

    // E15/S6: issuing is database work only. The PDF is drawn from the row on its first download.
    it('issues an invoice without drawing anything yet', async () => {
        const draw = jest.spyOn(app.get(PdfService), 'generateInvoicePdf');
        try {
            const invoice = await issue('2026-03');

            expect(invoice.amount).toBe(350);
            expect(draw).not.toHaveBeenCalled();
        } finally {
            draw.mockRestore();
        }
    });

    it('draws the PDF on the first download and keeps it for the next', async () => {
        const invoice = await issueFresh('2026-03');
        const draw = jest.spyOn(app.get(PdfService), 'generateInvoicePdf');
        try {
            const first = await download(invoice.id).expect(200);
            const stored = await kept(invoice.id);
            const second = await download(invoice.id).expect(200);

            expect(draw).toHaveBeenCalledTimes(1);
            expect(stored).toMatchObject({ contentType: 'application/pdf' });
            expect(Buffer.compare(first.body as Buffer, second.body as Buffer)).toBe(0);
        } finally {
            draw.mockRestore();
        }
    });

    it('drops the kept drawing when the amount changes, and draws the current row next time', async () => {
        const invoice = await issueFresh('2026-03');
        await download(invoice.id).expect(200);

        await request(app.getHttpServer()).put(`/invoices/${invoice.id}`).set('Authorization', admin.auth).send({ amount: 300 }).expect(200);

        expect(await kept(invoice.id)).toBeNull();
        await download(invoice.id).expect(200);
        expect(await kept(invoice.id)).not.toBeNull();
    });

    it('takes the kept drawing with a deleted invoice', async () => {
        const invoice = await issueFresh('2026-03');
        await download(invoice.id).expect(200);

        await request(app.getHttpServer()).delete(`/invoices/${invoice.id}`).set('Authorization', admin.auth).expect(204);

        expect(await kept(invoice.id)).toBeNull();
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

    // Storage used to decide whether a month existed: a failed upload rolled the whole batch back.
    // Since E15/S6 issuing never reaches it, and the document is drawn once storage answers again.
    it('issues a month while storage is down, and draws its PDF once storage is back', async () => {
        const bucket = process.env.AWS_S3_BUCKET;
        process.env.AWS_S3_BUCKET = 'bucket-that-does-not-exist';
        let invoice: { id: number; amount: number };
        try {
            invoice = await issue('2026-04');
        } finally {
            process.env.AWS_S3_BUCKET = bucket;
        }

        expect(invoice.amount).toBe(350);
        const res = await download(invoice.id).expect(200);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });
});
