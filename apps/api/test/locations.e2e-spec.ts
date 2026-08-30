import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, groupBody, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

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
