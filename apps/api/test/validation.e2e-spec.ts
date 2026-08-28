import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, TestUser, createRoom, groupBody } from './helpers';

/**
 * Cover for E05/S1. Until the pipe was registered, the class-validator decorators on 22 DTO files
 * had never executed — so several of them were wrong in ways nobody could have noticed. These tests
 * pin down both that validation now runs and the specific defects that turning it on exposed.
 */
describe('Request validation (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parentId: number;
    let groupId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
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

        const group = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(await createRoom(app, admin)))
            .expect(201);
        groupId = group.body.id as number;
    });

    const post = (path: string, body: Record<string, unknown>) => request(app.getHttpServer()).post(path).set('Authorization', admin.auth).send(body);

    describe('the pipe runs at all', () => {
        it('rejects a body missing a required field', async () => {
            await post('/children', { firstName: 'Ion', lastName: 'Pop' }).expect(400);
        });

        it('rejects a field of the wrong type', async () => {
            await post('/children', { parentId, firstName: 1234, lastName: 'Pop', birthDate: '2016-01-01' }).expect(400);
        });

        it('rejects a field no DTO declares', async () => {
            await post('/children', {
                parentId,
                firstName: 'Ion',
                lastName: 'Pop',
                birthDate: '2016-01-01',
                smuggled: 'value',
            }).expect(400);
        });

        it('reports which field was wrong, not just that something was', async () => {
            const res = await post('/children', { parentId, lastName: 'Pop', birthDate: '2016-01-01' }).expect(400);

            expect(JSON.stringify(res.body)).toContain('firstName');
        });

        it('accepts a well-formed body', async () => {
            await post('/children', { parentId, firstName: 'Ion', lastName: 'Pop', birthDate: '2016-01-01' }).expect(201);
        });
    });

    describe('defects that enabling the pipe exposed', () => {
        it('validates inside a nested array, not just its shape', async () => {
            // `@ValidateNested` without `@Type` leaves the entries as plain objects, so the
            // decorators on ChildAttendanceDto never ran. A string childId used to sail through.
            await post(`/attendance/${groupId}`, {
                childrenAttendance: [{ childId: 'not-a-number', present: true }],
                date: '2026-03-10',
                startTime: '16:00',
            }).expect(400);
        });

        it('rejects an empty attendance array', async () => {
            await post(`/attendance/${groupId}`, {
                childrenAttendance: [],
                date: '2026-03-10',
                startTime: '16:00',
            }).expect(400);
        });

        it('accepts a partial group update', async () => {
            // updateGroupDto had no `@IsOptional()` on any field, so every partial update would
            // have been rejected for the fields it did not send.
            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ weekday: 3 }).expect(200);
        });

        it.each([['2026-3'], ['2026-13'], ['March 2026'], ['2026-03-01']])('rejects %s as a billing month', async (monthIssued) => {
            // The column is varchar(7) and `@Unique(['parent', 'monthIssued'])` keys off the
            // exact string, so anything but YYYY-MM either collides wrongly or gets truncated.
            await post('/invoices', { parentIds: [parentId], monthIssued, dateIssued: '2026-03-01' }).expect(400);
        });

        it('rejects an empty parentIds array', async () => {
            // `@IsNotEmpty` on an array only rejects null; `[]` used to issue nothing and report
            // success.
            await post('/invoices', { parentIds: [], monthIssued: '2026-03', dateIssued: '2026-03-01' }).expect(400);
        });
    });

    describe('transformation', () => {
        it('turns a numeric route parameter into a number', async () => {
            // ParseIntPipe already handled this, but `transform: true` must not break it.
            await request(app.getHttpServer()).get(`/groups/${groupId}`).set('Authorization', admin.auth).expect(200);
        });
    });
});
