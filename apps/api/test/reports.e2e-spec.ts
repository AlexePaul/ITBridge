import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRoom, createTestApp, enrolChild, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The reports — E21/S2 and S4, against a real database.
 *
 * As with the overview, the assertions are about **agreement**, not arithmetic: every figure here
 * has a screen that shows the same thing in detail, and the two must not be able to disagree. So
 * the suite reads the report and the endpoint it summarises, and compares them — the payments list
 * for what was collected, the arrears list for what is owed, the occupancy endpoint for seats.
 */
describe('Reports (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parentA: TestUser;
    let parentB: TestUser;
    let profileA: number;
    let profileB: number;
    let childA: number;
    let childB1: number;
    let childB2: number;
    let groupId: number;

    const http = () => request(app.getHttpServer());

    const newChild = async (parent: TestUser, profileId: number, firstName: string) => {
        const child = await http()
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName, lastName: 'Test', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        return child.body.id as number;
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.rapoarte'));
        parentA = await registerUser(app, 'familia.a');
        parentB = await registerUser(app, 'familia.b');
        profileA = await ownProfileId(app, parentA);
        profileB = await ownProfileId(app, parentB);
        childA = await newChild(parentA, profileA, 'Ana');
        childB1 = await newChild(parentB, profileB, 'Bogdan');
        childB2 = await newChild(parentB, profileB, 'Bianca');

        const roomId = await createRoom(app, admin);
        const group = await http().post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        for (const childId of [childA, childB1, childB2]) {
            await enrolChild(app, admin, childId, groupId);
        }
    });

    describe('access', () => {
        it('is for admins only', async () => {
            await http().get('/reports/finance').set('Authorization', parentA.auth).expect(403);
            await http().get('/reports/occupancy').set('Authorization', parentA.auth).expect(403);
            await http().get('/reports/finance').expect(401);
        });

        it('refuses a month that is not a month', async () => {
            await http().get('/reports/finance?from=2026-13').set('Authorization', admin.auth).expect(400);
            await http().get('/reports/finance?from=march').set('Authorization', admin.auth).expect(400);
        });
    });

    describe('finance', () => {
        const issueMarch = () =>
            http()
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({
                    monthIssued: '2026-03',
                    dateIssued: '2026-03-01',
                    families: [
                        { parentId: profileA, children: [{ childId: childA, sessions: 4 }] },
                        {
                            parentId: profileB,
                            children: [
                                { childId: childB1, sessions: 4 },
                                { childId: childB2, sessions: 4 },
                            ],
                        },
                    ],
                })
                .expect(201);

        const pay = (invoiceId: number, amount: number, date: string, method: 'cash' | 'bank_transfer', status?: string) =>
            http()
                .post('/payments')
                .set('Authorization', admin.auth)
                .send({ invoiceId, amount, date, method, ...(status ? { status } : {}) })
                .expect(201);

        it('keeps the two calendars apart: collected for the month versus collected in the month', async () => {
            const issued = await issueMarch();
            const invoiceA = issued.body.issued.find((row: { amount: number }) => row.amount === 350).id as number;
            const invoiceB = issued.body.issued.find((row: { amount: number }) => row.amount === 600).id as number;

            // Family A pays March in March, by transfer. Family B pays 100 of 600 in April, in cash.
            await pay(invoiceA, 350, '2026-03-10', 'bank_transfer');
            await pay(invoiceB, 100, '2026-04-02', 'cash');

            const report = await http().get('/reports/finance?from=2026-03&to=2026-04').set('Authorization', admin.auth).expect(200);

            const [march, april] = report.body.months;
            expect(march).toMatchObject({
                month: '2026-03',
                invoiced: 950,
                invoices: 2,
                families: 2,
                collectedForMonth: 450,
                outstanding: 500,
                collectedInMonth: 350,
            });
            expect(march.byMethod).toEqual({ cash: 0, bankTransfer: 350 });
            expect(april).toMatchObject({ month: '2026-04', invoiced: 0, invoices: 0, collectedForMonth: 0, collectedInMonth: 100 });
            expect(april.byMethod).toEqual({ cash: 100, bankTransfer: 0 });
            expect(report.body.totals).toMatchObject({
                invoiced: 950,
                collectedForMonth: 450,
                collectedInMonth: 450,
                outstanding: 500,
                families: 2,
                averagePerFamily: 475,
            });
        });

        it('agrees with the payments list on what was collected in the range, to the leu', async () => {
            const issued = await issueMarch();
            const invoiceA = issued.body.issued.find((row: { amount: number }) => row.amount === 350).id as number;
            const invoiceB = issued.body.issued.find((row: { amount: number }) => row.amount === 600).id as number;
            await pay(invoiceA, 350, '2026-03-10', 'bank_transfer');
            await pay(invoiceB, 250.5, '2026-03-20', 'cash');
            await pay(invoiceB, 49.5, '2026-04-30', 'cash');
            // Announced and reversed money is not money. Both rows exist; neither is counted.
            await pay(invoiceB, 300, '2026-03-25', 'bank_transfer', 'initiated');
            await pay(invoiceB, 50, '2026-03-26', 'cash', 'reversed');

            const payments = await http().get('/payments?dateFrom=2026-03-01&dateTo=2026-04-30').set('Authorization', admin.auth).expect(200);
            const report = await http().get('/reports/finance?from=2026-03&to=2026-04').set('Authorization', admin.auth).expect(200);

            const succeeded = payments.body.filter((row: { status: string }) => row.status === 'succeeded');
            const listTotal = Math.round(succeeded.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0) * 100) / 100;
            expect(report.body.totals.collectedInMonth).toBe(listTotal);
            expect(report.body.totals.collectedInMonth).toBe(650);
            expect(report.body.basis).toMatchObject({
                succeededPayments: 3,
                initiatedPayments: 1,
                reversedPayments: 1,
                failedPayments: 0,
                billableInvoices: 2,
            });
        });

        it('agrees with the arrears list on what is owed, family by family', async () => {
            const issued = await issueMarch();
            const invoiceA = issued.body.issued.find((row: { amount: number }) => row.amount === 350).id as number;
            await pay(invoiceA, 200, '2026-03-10', 'cash');

            const arrears = await http().get('/invoices/arrears').set('Authorization', admin.auth).expect(200);
            const report = await http().get('/reports/finance?from=2026-03&to=2026-03').set('Authorization', admin.auth).expect(200);

            const listTotal = arrears.body.reduce((sum: number, row: { outstanding: number }) => sum + row.outstanding, 0);
            expect(report.body.arrears.outstanding).toBe(listTotal);
            expect(report.body.arrears.outstanding).toBe(750);
            expect(report.body.arrears.families).toBe(new Set(arrears.body.map((row: { parentId: number }) => row.parentId)).size);
            const bucketTotal = Object.values(report.body.arrears.byBucket as Record<string, { invoices: number }>).reduce(
                (sum, band) => sum + band.invoices,
                0,
            );
            expect(bucketTotal).toBe(arrears.body.length);
            // The month's own outstanding figure is the same debt seen from the invoice side.
            expect(report.body.months[0].outstanding).toBe(750);
        });

        it('agrees with the invoices list on what was billed, and keeps waived months out of the money', async () => {
            await http()
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({
                    monthIssued: '2026-05',
                    dateIssued: '2026-05-01',
                    families: [
                        { parentId: profileA, children: [{ childId: childA, sessions: 3 }] },
                        // Nothing held for family B in May: a waived row, no money.
                        {
                            parentId: profileB,
                            children: [
                                { childId: childB1, sessions: 0 },
                                { childId: childB2, sessions: 0 },
                            ],
                        },
                    ],
                })
                .expect(201);

            const invoices = await http().get('/invoices').set('Authorization', admin.auth).expect(200);
            const report = await http().get('/reports/finance?from=2026-05&to=2026-05').set('Authorization', admin.auth).expect(200);

            const billable = invoices.body.filter((row: { monthIssued: string; status: string }) => row.monthIssued === '2026-05' && row.status !== 'waived');
            const listTotal = billable.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
            expect(report.body.months[0]).toMatchObject({ invoiced: listTotal, invoices: billable.length, waived: 1, families: 1 });
            expect(report.body.months[0].invoiced).toBe(262.5);
            expect(report.body.basis).toMatchObject({ billableInvoices: 1, waivedInvoices: 1 });
        });

        it('covers twelve months when nobody asks for a range, and fills in the other end when one is given', async () => {
            const whole = await http().get('/reports/finance').set('Authorization', admin.auth).expect(200);
            expect(whole.body.months).toHaveLength(12);
            expect(whole.body.months[11].month).toBe(whole.body.to);

            const fromOnly = await http().get('/reports/finance?from=2025-09').set('Authorization', admin.auth).expect(200);
            expect(fromOnly.body).toMatchObject({ from: '2025-09', to: '2026-08' });
            expect(fromOnly.body.months).toHaveLength(12);
        });
    });

    describe('occupancy', () => {
        it('agrees with the occupancy endpoint, trials included, and prices the empty seats', async () => {
            // A fourth child on trial: a seat on a chair (D7), so the report must count them too.
            const parentC = await registerUser(app, 'familia.c');
            const profileC = await ownProfileId(app, parentC);
            const childC = await newChild(parentC, profileC, 'Costin');
            await http().post('/enrollments').set('Authorization', admin.auth).send({ childId: childC, groupId, status: 'TRIAL' }).expect(201);

            const occupancy = await http().get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            const report = await http().get('/reports/occupancy').set('Authorization', admin.auth).expect(200);

            expect(report.body.groups).toHaveLength(1);
            const row = report.body.groups[0];
            expect(row).toMatchObject({
                groupId,
                taken: occupancy.body.taken,
                free: occupancy.body.free,
                capacity: occupancy.body.capacity,
                waiting: occupancy.body.waiting,
            });
            expect(row).toMatchObject({ taken: 4, free: 6, fillRate: 0.4, underThreshold: true, lostRevenueMonthly: 6 * report.body.ratePerSeat });
            expect(row.lostRevenueMonthly).toBe(2100);
            expect(row).toMatchObject({ roomName: 'Sala 1', locationName: 'Drumul Taberei', weekday: 1 });
            expect(report.body.totals).toMatchObject({ groups: 1, capacity: 10, taken: 4, free: 6, underThreshold: 1, lostRevenueMonthly: 2100 });
        });

        it('rolls up by address and names the hours a room stands empty while another teaches', async () => {
            // A second address with a room and a Tuesday group; the first room then has Tuesday dead.
            const roomB = await createRoom(app, admin, { slug: 'militari', name: 'Militari', roomName: 'Sala Mare', capacity: 12 });
            const tuesday = await http()
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(roomB, { name: 'Python', weekday: 2 }))
                .expect(201);
            const tuesdayId = tuesday.body.id as number;
            // And a third room at the first address with nothing in it at all.
            const location = await http().get('/locations').set('Authorization', admin.auth).expect(200);
            const drumul = location.body.find((row: { slug: string }) => row.slug === 'drumul-taberei').id as number;
            await http().post('/rooms').set('Authorization', admin.auth).send({ name: 'Sala 2', locationId: drumul, capacity: 8 }).expect(201);

            const report = await http().get('/reports/occupancy').set('Authorization', admin.auth).expect(200);

            expect(report.body.totals.slotsInUse).toEqual([
                { weekday: 1, startTime: '16:00:00', endTime: '17:30:00' },
                { weekday: 2, startTime: '16:00:00', endTime: '17:30:00' },
            ]);

            const rooms = report.body.rooms as { roomName: string; locationName: string; groups: number; deadSlots: { weekday: number }[] }[];
            expect(rooms).toHaveLength(3);
            expect(rooms.find((room) => room.roomName === 'Sala 1' && room.locationName === 'Drumul Taberei')!.deadSlots.map((slot) => slot.weekday)).toEqual([
                2,
            ]);
            expect(rooms.find((room) => room.roomName === 'Sala Mare')!.deadSlots.map((slot) => slot.weekday)).toEqual([1]);
            expect(rooms.find((room) => room.roomName === 'Sala 2')!).toMatchObject({
                groups: 0,
                deadSlots: [
                    { weekday: 1, startTime: '16:00:00', endTime: '17:30:00' },
                    { weekday: 2, startTime: '16:00:00', endTime: '17:30:00' },
                ],
            });

            const locations = report.body.locations as { name: string; rooms: number; groups: number; taken: number; free: number }[];
            expect(locations.map((row) => row.name)).toEqual(['Drumul Taberei', 'Militari']);
            expect(locations[0]).toMatchObject({ rooms: 2, groups: 1, taken: 3, free: 7 });
            expect(locations[1]).toMatchObject({ rooms: 1, groups: 1, taken: 0, free: 10 });

            // Least full first: the empty Tuesday group before the Monday one.
            expect(report.body.groups.map((row: { groupId: number }) => row.groupId)).toEqual([tuesdayId, groupId]);
        });

        it('leaves inactive groups out — they cannot take a new child', async () => {
            await http().put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ isActive: false }).expect(200);
            const report = await http().get('/reports/occupancy').set('Authorization', admin.auth).expect(200);
            expect(report.body.groups).toEqual([]);
            expect(report.body.totals.groups).toBe(0);
        });
    });
});
