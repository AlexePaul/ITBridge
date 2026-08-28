import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, groupBody, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';
import { Weekday } from 'src/enum/weekday.enum';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { Role } from 'src/enum/role.enum';

/**
 * Cover for the three columns that used to hold bare strings and numbers. The point is not that the
 * enums exist but that the invalid values are refused — at the API for anything that comes in over
 * HTTP, and at the database for anything that does not.
 */
describe('Checked value types (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let roomId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        roomId = await createRoom(app, admin);
    });

    const createGroup = (weekday: unknown) =>
        request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId, { weekday }));

    describe('weekday is an ISO weekday', () => {
        it.each([[Weekday.MONDAY], [Weekday.SUNDAY]])('accepts %s', async (weekday) => {
            await createGroup(weekday).expect(201);
        });

        it('accepts Sunday, which the old UI day list could not even offer', async () => {
            const res = await createGroup(Weekday.SUNDAY).expect(201);
            expect(res.body.weekday).toBe(7);
        });

        it.each([[0], [8], [-1], [3.5], ['luni']])('rejects %s at the API', async (weekday) => {
            await createGroup(weekday).expect(400);
        });

        it.each([['MONDAY'], ['SUNDAY']])('rejects the member name %s with a 400, not a 500', async (weekday) => {
            // A numeric enum carries a reverse mapping, so `Object.values(Weekday)` holds the names
            // as well as the numbers and `@IsEnum` alone accepted them. The value then reached an
            // int column and came back as a 500 about invalid integer syntax.
            const res = await createGroup(weekday).expect(400);
            expect(res.body.code).toBe('VALIDATION_FAILED');
        });

        it('rejects an out-of-range weekday at the database too', async () => {
            // Belt and braces: the enum guards the call sites, the CHECK constraint guards
            // everything that does not go through them.
            await createGroup(Weekday.MONDAY).expect(201);

            await expect(dataSource.query('UPDATE groups SET weekday = 8')).rejects.toThrow(/CHK_groups_weekday_iso/);
        });
    });

    describe('attendance type', () => {
        it("rejects 'normal', the old column default the frontend could not render", async () => {
            const profile = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
                .expect(201);
            const group = await createGroup(Weekday.MONDAY).expect(201);
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: profile.body.id, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-01-01' })
                .expect(201);

            await request(app.getHttpServer())
                .post(`/attendance/${group.body.id}`)
                .set('Authorization', admin.auth)
                .send({ childrenAttendance: [{ childId: 1, present: true }], date: '2026-03-10', startTime: '16:00' })
                .expect(201);

            await expect(dataSource.query(`UPDATE attendances SET type = 'normal'`)).rejects.toThrow(/invalid input value for enum/);
        });

        it('stores one of the two values the service writes', async () => {
            const rows = await dataSource.query<{ enumlabel: string }[]>(
                `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'attendances_type_enum' ORDER BY enumlabel`,
            );

            expect(rows.map((r) => r.enumlabel).sort()).toEqual([AttendanceType.MAKE_UP, AttendanceType.REGULAR].sort());
        });
    });

    describe('role', () => {
        it('rejects a wrongly cased role at the API', async () => {
            const user = await registerUser(app, 'obisnuit');

            await request(app.getHttpServer()).put(`/users/${user.userId}`).set('Authorization', admin.auth).send({ role: 'admin' }).expect(400);
        });

        it('accepts a correctly cased role', async () => {
            const user = await registerUser(app, 'promovat');

            const res = await request(app.getHttpServer()).put(`/users/${user.userId}`).set('Authorization', admin.auth).send({ role: Role.ADMIN }).expect(200);

            expect(res.body.role).toBe(Role.ADMIN);
        });

        it('rejects a wrongly cased role at the database too', async () => {
            await expect(dataSource.query(`UPDATE users SET role = 'admin'`)).rejects.toThrow(/invalid input value for enum/);
        });
    });
});
