import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createTestApp, groupBody, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * E08. The school teaches at two addresses, and until now the platform had no way to say so — the
 * uniqueness constraint on groups was school-wide, which made the second location's timetable
 * unrepresentable rather than merely unmodelled.
 *
 * What this suite is about is the *effect*: two real locations, each with its own rooms, and a
 * timetable that can hold the same hour twice.
 */
describe('Locations, rooms and the timetable (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;

    const drumulTaberei = {
        name: 'Drumul Taberei',
        slug: 'drumul-taberei',
        street: 'Strada Valea Oltului 73',
        city: 'București',
        district: 'Sector 6',
        postalCode: '061971',
        latitude: 44.415847,
        longitude: 26.013556,
    };

    const straulesti = {
        name: 'Străulești',
        slug: 'straulesti',
        street: 'Șoseaua București-Târgoviște 19A',
        city: 'București',
        district: 'Sector 1',
        postalCode: '013505',
        latitude: 44.510623,
        longitude: 26.020696,
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'ana');
    });

    const createLocation = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/locations').set('Authorization', admin.auth).send(body);

    const createRoom = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/rooms').set('Authorization', admin.auth).send(body);

    const createGroup = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(body);

    /** Both addresses, one room each. The shape most of the tests below start from. */
    async function seedBothLocations(): Promise<{ dtRoom: number; strRoom: number }> {
        const dt = await createLocation(drumulTaberei).expect(201);
        const str = await createLocation(straulesti).expect(201);
        const dtRoom = await createRoom({ name: 'Sala 1', locationId: dt.body.id, capacity: 10 }).expect(201);
        const strRoom = await createRoom({ name: 'Sala 1', locationId: str.body.id, capacity: 10 }).expect(201);
        return { dtRoom: dtRoom.body.id as number, strRoom: strRoom.body.id as number };
    }

    describe('locations', () => {
        it('stores the coordinates as numbers, not as the strings the driver returns', async () => {
            const res = await createLocation(drumulTaberei).expect(201);

            // `numeric` columns arrive from node-postgres as strings. Without the transformer this
            // is "44.415847", which the frontend cannot hand to a map without noticing.
            const read = await request(app.getHttpServer()).get(`/locations/${res.body.id}`).set('Authorization', admin.auth).expect(200);
            expect(typeof read.body.latitude).toBe('number');
            expect(typeof read.body.longitude).toBe('number');
        });

        it('refuses a second location with the same slug', async () => {
            await createLocation(drumulTaberei).expect(201);
            const res = await createLocation({ ...drumulTaberei, name: 'Valea Oltului' }).expect(409);
            expect(res.body.code).toBe('LOCATION_SLUG_TAKEN');
        });

        it('refuses a slug that is not a slug', async () => {
            await createLocation({ ...drumulTaberei, slug: 'Drumul Taberei' }).expect(400);
        });

        it('lets a parent read the locations, because that is where their child goes', async () => {
            await createLocation(drumulTaberei).expect(201);
            const res = await request(app.getHttpServer()).get('/locations').set('Authorization', parent.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it('refuses to delete a location that still has rooms', async () => {
            const { dtRoom } = await seedBothLocations();
            const room = await request(app.getHttpServer()).get(`/rooms/${dtRoom}`).set('Authorization', admin.auth).expect(200);

            const res = await request(app.getHttpServer()).delete(`/locations/${room.body.location.id}`).set('Authorization', admin.auth).expect(409);

            expect(res.body.code).toBe('LOCATION_HAS_ROOMS');
        });

        /**
         * QA of 26 September 2026. An announcement keeps the location it was sent to (RESTRICT), so
         * a location with no rooms left but with an announcement behind it answered with the
         * exception filter's English "still referenced" instead of saying why.
         */
        it('refuses to delete a location whose families were sent an announcement, and says so', async () => {
            const location = await createLocation(drumulTaberei).expect(201);
            await dataSource.query(
                `INSERT INTO announcements (audience, location_id, subject, "bodyText", "dedupeKey") VALUES ('location', $1, 'Zi liberă', 'Luni nu se țin ore.', 'test-location-announcement')`,
                [location.body.id],
            );

            const res = await request(app.getHttpServer()).delete(`/locations/${location.body.id}`).set('Authorization', admin.auth).expect(409);

            expect(res.body.code).toBe('LOCATION_HAS_ANNOUNCEMENTS');
        });
    });

    describe('rooms', () => {
        it('lets the same room name exist at both locations', async () => {
            // "Sala 1" at each address is the normal case, not a clash.
            const { dtRoom, strRoom } = await seedBothLocations();
            expect(dtRoom).not.toBe(strRoom);
        });

        it('refuses a duplicate room name within one location', async () => {
            const dt = await createLocation(drumulTaberei).expect(201);
            await createRoom({ name: 'Sala 1', locationId: dt.body.id, capacity: 10 }).expect(201);
            const res = await createRoom({ name: 'Sala 1', locationId: dt.body.id, capacity: 8 }).expect(409);
            expect(res.body.code).toBe('ROOM_NAME_TAKEN');
        });

        it('filters by location', async () => {
            const { strRoom } = await seedBothLocations();
            const str = await request(app.getHttpServer()).get(`/rooms/${strRoom}`).set('Authorization', admin.auth).expect(200);

            const res = await request(app.getHttpServer())
                .get('/rooms')
                .query({ locationId: str.body.location.id })
                .set('Authorization', admin.auth)
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].location.slug).toBe('straulesti');
        });

        // The room's capacity is a number nobody can be sure of up front: 10 is the school's
        // standard room and what the migration writes, and this is how it gets corrected — from
        // the interface, not from a migration.
        it('lets an admin change a room capacity, and the new limit takes effect immediately', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom, { capacity: 11 })).expect(409);

            await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ capacity: 12 }).expect(200);

            await createGroup(groupBody(dtRoom, { capacity: 11 })).expect(201);
        });

        /**
         * The review of 25 September 2026. The group check ran only when a group was created or
         * moved, so lowering the room afterwards left a group of ten in a room of six, and every
         * count went on offering ten.
         */
        it('refuses to make a room smaller than a group that meets in it, and allows down to it', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom, { capacity: 8 })).expect(201);

            const res = await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ capacity: 6 }).expect(409);
            expect(res.body.code).toBe('ROOM_SMALLER_THAN_GROUP');

            await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ capacity: 8 }).expect(200);
        });

        it('refuses a capacity below one', async () => {
            const { dtRoom } = await seedBothLocations();
            await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ capacity: 0 }).expect(400);
        });

        it('refuses to delete a room that still hosts groups', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom)).expect(201);

            const res = await request(app.getHttpServer()).delete(`/rooms/${dtRoom}`).set('Authorization', admin.auth).expect(409);
            expect(res.body.code).toBe('ROOM_HAS_GROUPS');
        });

        /**
         * QA of 26 September 2026. A class keeps the room it was held in, even after its group moves
         * (RESTRICT), so a room emptied of groups but with classes behind it answered with the
         * exception filter's English "still referenced". The answer is to close the room instead.
         */
        it('refuses to delete a room that classes were held in, and says so', async () => {
            const { dtRoom, strRoom } = await seedBothLocations();
            const group = await createGroup(groupBody(dtRoom)).expect(201);
            await createClassSession(dataSource, group.body.id as number, { date: '2026-03-10', status: 'held' });
            // The group moves on; the class it held stays where it was held.
            await dataSource.query('UPDATE groups SET room_id = $1 WHERE id = $2', [strRoom, group.body.id]);

            const res = await request(app.getHttpServer()).delete(`/rooms/${dtRoom}`).set('Authorization', admin.auth).expect(409);

            expect(res.body.code).toBe('ROOM_HAS_CLASSES');
        });
    });

    describe('the timetable', () => {
        // E08/S2, the acceptance criterion. Before this, the constraint was on weekday plus start
        // time alone, so the second of these was rejected — anywhere in the school.
        it('accepts two groups on Tuesday at 17:00, in different rooms', async () => {
            const { dtRoom, strRoom } = await seedBothLocations();

            await createGroup(groupBody(dtRoom, { name: 'Scratch Avansați', weekday: 2, startTime: '17:00' })).expect(201);
            await createGroup(groupBody(strRoom, { name: 'Roblox Începători', weekday: 2, startTime: '17:00' })).expect(201);

            const res = await request(app.getHttpServer()).get('/groups').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(2);
        });

        it('refuses two groups in the same room at the same time, and says which one is in the way', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom, { name: 'Scratch Avansați', weekday: 2, startTime: '17:00' })).expect(201);

            const res = await createGroup(groupBody(dtRoom, { name: 'Python Începători', weekday: 2, startTime: '17:00' })).expect(409);

            // "A record with these values already exists" — what the bare unique violation gives —
            // does not tell an admin what to do next. The code is what the frontend turns into a
            // Romanian sentence; the message names the group that is in the way.
            expect(res.body.code).toBe('GROUP_SLOT_TAKEN');
            expect(res.body.message).toContain('Scratch Avansați');
        });

        it('catches the collision when a group is moved into an occupied slot, not only when created', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom, { name: 'Scratch Avansați', weekday: 2, startTime: '17:00' })).expect(201);
            const moving = await createGroup(groupBody(dtRoom, { name: 'Python Începători', weekday: 3, startTime: '17:00' })).expect(201);

            await request(app.getHttpServer()).put(`/groups/${moving.body.id}`).set('Authorization', admin.auth).send({ weekday: 2 }).expect(409);
        });

        // The QA of 26 September 2026: 16:30–18:00 beside 16:00–17:30 in one room, and 12:00–11:00,
        // were both accepted — the check only knew an equal start.
        it('refuses overlapping hours in the same room, and a group that ends before it starts', async () => {
            const { dtRoom } = await seedBothLocations();
            await createGroup(groupBody(dtRoom, { name: 'Scratch Începători', weekday: 1, startTime: '16:00', endTime: '17:30' })).expect(201);

            const overlap = await createGroup(groupBody(dtRoom, { name: 'QA Suprapus', weekday: 1, startTime: '16:30', endTime: '18:00' })).expect(409);
            expect(overlap.body.code).toBe('GROUP_SLOT_TAKEN');
            const inverted = await createGroup(groupBody(dtRoom, { name: 'QA Ore inversate', weekday: 1, startTime: '12:00', endTime: '11:00' })).expect(400);
            expect(inverted.body.code).toBe('GROUP_ENDS_BEFORE_IT_STARTS');
            // Back to back is not an overlap.
            await createGroup(groupBody(dtRoom, { name: 'Python', weekday: 1, startTime: '17:30', endTime: '19:00' })).expect(201);
        });

        it('refuses to move a group onto an hour a class of another group was moved into', async () => {
            const { dtRoom } = await seedBothLocations();
            const host = await createGroup(groupBody(dtRoom, { name: 'Python Avansați', weekday: 4, startTime: '17:00', endTime: '18:30' })).expect(201);
            const moving = await createGroup(groupBody(dtRoom, { name: 'Web Începători', weekday: 3, startTime: '16:00', endTime: '17:30' })).expect(201);
            // One Thursday class of Python moved to a Monday evening in the same room.
            const moved = await createClassSession(dataSource, host.body.id as number, { date: '2030-01-07' });
            await dataSource.query(`UPDATE class_sessions SET "startTime" = '18:00', "endTime" = '19:30' WHERE id = $1`, [moved]);

            const res = await request(app.getHttpServer())
                .put(`/groups/${moving.body.id}`)
                .set('Authorization', admin.auth)
                .send({ weekday: 1, startTime: '18:00', endTime: '19:30' })
                .expect(409);
            expect(res.body.code).toBe('ROOM_BUSY_AT_THAT_TIME');
            expect(res.body.message).toContain('luni, 7 ianuarie');
        });

        it('lets a group keep its slot through an unrelated update', async () => {
            // The collision check has to exclude the row being updated, or renaming a group
            // reports that it collides with itself.
            const { dtRoom } = await seedBothLocations();
            const group = await createGroup(groupBody(dtRoom, { weekday: 2, startTime: '17:00' })).expect(201);

            const res = await request(app.getHttpServer())
                .put(`/groups/${group.body.id}`)
                .set('Authorization', admin.auth)
                .send({ name: 'Scratch Avansați', startTime: '17:00' })
                .expect(200);

            expect(res.body.name).toBe('Scratch Avansați');
        });

        /**
         * `Group` in the shared contract has a required `room`, so every endpoint that hands a
         * group to a client owes one. These three reach a group by different routes, and each was
         * a separate `leftJoinAndSelect` that could be forgotten on its own — the frontend then
         * renders "Sala 1" with no way to say which of the two it is.
         */
        it('carries the room and its location on a child, wherever the child comes from', async () => {
            const { strRoom } = await seedBothLocations();
            const group = await createGroup(groupBody(strRoom)).expect(201);

            const profile = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Pop' })
                .expect(201);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: profile.body.id, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-05-01' })
                .expect(201);
            await request(app.getHttpServer()).post(`/children/${child.body.id}/groups/${group.body.id}`).set('Authorization', admin.auth).expect(201);

            const children = await request(app.getHttpServer()).get('/children').set('Authorization', admin.auth).expect(200);
            expect(children.body[0].group.room.location.slug).toBe('straulesti');

            // Not `[0]`: since E11/S2 the admin's own registration wrote a profile too, and it has
            // no children. The one under test is the one that does.
            const profiles = await request(app.getHttpServer()).get('/profiles').set('Authorization', admin.auth).expect(200);
            const withChild = (profiles.body as { children: { group: { room: { location: { slug: string } } } }[] }[]).find((p) => p.children.length > 0);
            expect(withChild?.children[0].group.room.location.slug).toBe('straulesti');
        });

        it('carries the room and its location on every group it returns', async () => {
            const { strRoom } = await seedBothLocations();
            await createGroup(groupBody(strRoom)).expect(201);

            const res = await request(app.getHttpServer()).get('/groups').set('Authorization', admin.auth).expect(200);

            expect(res.body[0].room.name).toBe('Sala 1');
            expect(res.body[0].room.location.slug).toBe('straulesti');
        });

        it('refuses a group that would admit more children than the room holds', async () => {
            const { dtRoom } = await seedBothLocations();
            const res = await createGroup(groupBody(dtRoom, { capacity: 11 })).expect(409);
            expect(res.body.code).toBe('GROUP_OVER_ROOM_CAPACITY');
        });

        it('refuses a group in a room that does not exist', async () => {
            await createGroup(groupBody(9999)).expect(404);
        });

        // `isActive` has to mean something the API enforces, or the admin screens stop offering a
        // room while the API goes on accepting it and the two disagree about what the flag is for.
        it('refuses a new group in a room that has been closed', async () => {
            const { dtRoom } = await seedBothLocations();
            await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ isActive: false }).expect(200);

            const res = await createGroup(groupBody(dtRoom)).expect(409);
            expect(res.body.code).toBe('ROOM_INACTIVE');
        });

        it('refuses a new group at a location that has been closed, even in an open room', async () => {
            const { dtRoom } = await seedBothLocations();
            const room = await request(app.getHttpServer()).get(`/rooms/${dtRoom}`).set('Authorization', admin.auth).expect(200);

            await request(app.getHttpServer())
                .put(`/locations/${room.body.location.id}`)
                .set('Authorization', admin.auth)
                .send({ isActive: false })
                .expect(200);

            const res = await createGroup(groupBody(dtRoom)).expect(409);
            expect(res.body.code).toBe('ROOM_INACTIVE');
        });

        it('keeps a group that is already there editable after its room closes', async () => {
            const { dtRoom } = await seedBothLocations();
            const group = await createGroup(groupBody(dtRoom)).expect(201);
            await request(app.getHttpServer()).put(`/rooms/${dtRoom}`).set('Authorization', admin.auth).send({ isActive: false }).expect(200);

            await request(app.getHttpServer()).put(`/groups/${group.body.id}`).set('Authorization', admin.auth).send({ name: 'Scratch Avansați' }).expect(200);
        });
    });
});
