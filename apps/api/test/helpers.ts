import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { S3Service } from 'src/modules/invoice/s3.service';
import { PdfService } from 'src/modules/invoice/pdf.service';
import { Role } from 'src/enum/role.enum';

/**
 * Boots the real application, with guards, routing and Postgres — only S3 and PDF generation are
 * replaced, because they leave the process and have nothing to verify here.
 */
export async function createTestApp(options: { realStorage?: boolean; throttling?: boolean } = {}): Promise<{
    app: INestApplication<App>;
    dataSource: DataSource;
}> {
    // `app.listen(0)` opens a single server, on a free port, for the whole lifetime of the suite.
    // The alternative — handing `app.getHttpServer()` straight to supertest — makes supertest spin
    // up an ephemeral server on every call, which turned out to be a source of flaky failures.
    // `realStorage` keeps the actual S3 client and PDF generator, for the one suite that exercises
    // them against MinIO. Everywhere else they are stubbed: they leave the process, and no other
    // test is about them.
    const builder = Test.createTestingModule({ imports: [AppModule] });

    // Rate limiting is off by default. Suites register a handful of users in `beforeEach`, which
    // over a couple of dozen tests goes well past a limit meant for a human at a login form — the
    // throttler would be measuring the test suite, not the behaviour under test. The one suite that
    // is about throttling asks for it.
    process.env.RATE_LIMIT_ENABLED = options.throttling ? 'true' : 'false';
    if (!options.realStorage) {
        builder
            .overrideProvider(S3Service)
            .useValue({ uploadFile: jest.fn(), downloadFile: jest.fn() })
            .overrideProvider(PdfService)
            .useValue({ generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) });
    }
    const moduleRef = await builder.compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    await app.listen(0);

    return { app, dataSource: app.get(DataSource) };
}

/** Wipes every table between suites, keeping the schema created by `synchronize`. */
export async function truncateAll(dataSource: DataSource): Promise<void> {
    const tables = dataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

export interface TestUser {
    userId: number;
    username: string;
    accessToken: string;
    refreshToken: string;
    auth: string;
}

/** Registers a user through the API and returns their tokens. Registration always yields PARENT. */
export async function registerUser(app: INestApplication<App>, username: string, password = 'parola123'): Promise<TestUser> {
    const res = await request(app.getHttpServer()).post('/auth/register').send({ username, password }).expect(201);

    const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);

    return {
        userId: me.body.id as number,
        username,
        accessToken: res.body.accessToken as string,
        refreshToken: res.body.refreshToken as string,
        auth: `Bearer ${res.body.accessToken}`,
    };
}

/**
 * Promotes a user to ADMIN directly in the database and re-issues their token through login —
 * exactly the flow described in CLAUDE.md, because `register` always creates a PARENT.
 */
export async function promoteToAdmin(app: INestApplication<App>, dataSource: DataSource, user: TestUser, password = 'parola123'): Promise<TestUser> {
    await dataSource.query('UPDATE users SET role = $1 WHERE id = $2', [Role.ADMIN, user.userId]);

    const res = await request(app.getHttpServer()).post('/auth/login').send({ username: user.username, password }).expect(200);

    return { ...user, accessToken: res.body.accessToken as string, auth: `Bearer ${res.body.accessToken}` };
}
