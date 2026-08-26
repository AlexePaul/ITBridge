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
 * Pornește aplicația reală, cu guard-e, rutare și Postgres — doar S3 și generarea de PDF sunt
 * înlocuite, fiindcă ies din proces și nu au ce verifica aici.
 */
export async function createTestApp(): Promise<{ app: INestApplication<App>; dataSource: DataSource }> {
    // `app.listen(0)` deschide un singur server, pe un port liber, pentru toată durata suitei.
    // Alternativa — `request(app.getHttpServer())` pe instanța express — face supertest să ridice
    // un server efemer la fiecare apel, ceea ce s-a dovedit o sursă de eșecuri intermitente.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(S3Service)
        .useValue({ uploadFile: jest.fn(), downloadFile: jest.fn() })
        .overrideProvider(PdfService)
        .useValue({ generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) })
        .compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    await app.listen(0);

    return { app, dataSource: app.get(DataSource) };
}

/** Golește toate tabelele între suite, păstrând schema creată de `synchronize`. */
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

/** Înregistrează un utilizator prin API și îi întoarce tokenurile. Rolul e mereu PARENT la creare. */
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
 * Promovează un utilizator la ADMIN direct în baza de date și îi reface tokenul prin login —
 * exact fluxul din CLAUDE.md, fiindcă `register` creează întotdeauna PARENT.
 */
export async function promoteToAdmin(app: INestApplication<App>, dataSource: DataSource, user: TestUser, password = 'parola123'): Promise<TestUser> {
    await dataSource.query('UPDATE users SET role = $1 WHERE id = $2', [Role.ADMIN, user.userId]);

    const res = await request(app.getHttpServer()).post('/auth/login').send({ username: user.username, password }).expect(200);

    return { ...user, accessToken: res.body.accessToken as string, auth: `Bearer ${res.body.accessToken}` };
}
