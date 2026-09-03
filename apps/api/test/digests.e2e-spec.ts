import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DigestService } from 'src/modules/mail/digest.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { createTestApp, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Digests instead of bursts — E17/S6, against the real application and a real database.
 *
 * The unit tests pin the rules; what only shows up here is whether they survive the schema — the
 * partial claim that makes "held" a fact about two columns, the self-referencing link from a folded
 * row to the message that replaced it, and the enum value the delivery record has to be able to
 * show.
 *
 * The acceptance the whole story is judged on is the first test: a parent with two children does not
 * get more than one email a day.
 */
describe('Message digests (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let outbox: OutboxService;
    let digests: DigestService;

    /** Monday 10:00 Bucharest, and the same day at the 18:00 cutoff. */
    const morning = new Date('2026-03-02T08:00:00.000Z');
    const evening = new Date('2026-03-02T16:00:00.000Z');

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
        outbox = app.get(OutboxService);
        digests = app.get(DigestService);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.rezumate'));
    });

    /** A registered family, with their outbox cleared so only this suite's messages are in play. */
    const family = async (username: string, frequency: 'immediate' | 'daily' | 'weekly' = 'daily'): Promise<string> => {
        const parent = await registerUser(app, username);
        const profileId = await ownProfileId(app, parent);
        await dataSource.query('UPDATE profiles SET "messageFrequency" = $1 WHERE id = $2', [frequency, profileId]);
        await dataSource.query('DELETE FROM outbox');
        return `${username}@example.com`;
    };

    /**
     * Queues a combinable message and backdates it, so the cadence has something to have waited on.
     *
     * `nextAttemptAt` is moved with `createdAt`, and that is not tidiness: it defaults to `now()`,
     * which in a suite that reasons about March 2026 is somewhere in the real future, and the
     * dispatcher's claim would refuse the row for a reason that has nothing to do with digests.
     */
    const queueHeld = async (to: string, subject: string, summary: string, options: { notAfter?: string | null; createdAt?: Date } = {}) => {
        const row = await outbox.queue({
            to,
            subject,
            bodyText: `${subject} — corpul întreg.`,
            digest: { summary, notAfter: options.notAfter ?? null },
        });
        const at = options.createdAt ?? morning;
        await dataSource.query('UPDATE outbox SET "createdAt" = $1, "nextAttemptAt" = $1 WHERE id = $2', [at, row!.id]);
        return row!.id;
    };

    const rows = () =>
        dataSource.query<{ id: number; to: string; subject: string; status: string; digest_id: number | null; digestReleasedAt: Date | null }[]>(
            'SELECT id, "to", subject, status, digest_id, "digestReleasedAt" FROM outbox ORDER BY id',
        );

    describe('the acceptance', () => {
        it('turns a day of separate messages into one email', async () => {
            const to = await family('ana.rezumat');
            await queueHeld(to, 'Ai o oră de recuperare', 'Ora pierdută se recuperează.');
            await queueHeld(to, 'Proiectele lui Maria', 'Maria a construit un joc.');
            await queueHeld(to, 'Factura pe martie', 'Factura pe martie are termen pe 15 martie.');

            const result = await digests.run({ now: evening });

            expect(result).toMatchObject({ digests: 1, folded: 3, released: 0 });
            const all = await rows();
            const digest = all.find((row) => row.digest_id === null && row.status === 'pending');
            expect(digest).toBeDefined();
            // Every fragment is in the one envelope, and the three originals point at it.
            expect(all.filter((row) => row.status === 'digested')).toHaveLength(3);
            expect(all.filter((row) => row.digest_id === digest!.id)).toHaveLength(3);
        });
    });

    describe('what the dispatcher can see', () => {
        it('does not claim a held message, and does claim it once released', async () => {
            const to = await family('bogdan.retinut');
            await queueHeld(to, 'Ai o oră de recuperare', 'Ora pierdută se recuperează.');

            // Held: the claim asks for a summary-free row or a released one, and this is neither.
            expect(await outbox.dispatchPending({ now: morning, pacingMs: 0 })).toMatchObject({ claimed: 0 });

            await digests.run({ now: evening });
            expect(await outbox.dispatchPending({ now: evening, pacingMs: 0 })).toMatchObject({ claimed: 1 });
        });

        it('never holds a message whose sender did not ask for it — an urgent one goes at once', async () => {
            const to = await family('cristina.urgent');
            const urgent = await outbox.queue({ to, subject: 'Ora de mâine a fost anulată', bodyText: 'Nu se ține.' });
            await dataSource.query('UPDATE outbox SET "createdAt" = $1, "nextAttemptAt" = $1 WHERE id = $2', [morning, urgent!.id]);

            // No digest pass has run, and it does not need to: nothing held it.
            expect(await outbox.dispatchPending({ now: morning, pacingMs: 0 })).toMatchObject({ claimed: 1 });
        });
    });

    describe('the deadline beats the cadence', () => {
        it('lets a lapsing reminder out of a weekly digest on its last useful day', async () => {
            const to = await family('dana.saptamanal', 'weekly');
            // Written on the Tuesday, so weekly would hold it until the following Monday evening.
            const tuesday = new Date('2026-03-03T08:00:00.000Z');
            await queueHeld(to, 'Recuperarea expiră în curând', 'Ultima zi este 4 martie.', { notAfter: '2026-03-04', createdAt: tuesday });

            const wednesday = new Date('2026-03-04T16:00:00.000Z');
            const result = await digests.run({ now: wednesday });

            expect(result).toMatchObject({ released: 1 });
        });

        it('still holds one whose deadline is far off', async () => {
            const to = await family('elena.saptamanal', 'weekly');
            // Written on the Tuesday, so the weekly cadence really is holding it: a message written
            // on a Monday morning is due that same Monday evening and would prove nothing here.
            const tuesday = new Date('2026-03-03T08:00:00.000Z');
            await queueHeld(to, 'Recuperarea expiră în curând', 'Ultima zi este 30 martie.', { notAfter: '2026-03-30', createdAt: tuesday });

            const wednesday = new Date('2026-03-04T16:00:00.000Z');
            expect(await digests.run({ now: wednesday })).toMatchObject({ held: 1, released: 0, digests: 0 });
        });
    });

    describe('the delivery record', () => {
        it('shows a folded message as digested rather than sent or missing', async () => {
            const to = await family('florin.evidenta');
            await queueHeld(to, 'Ai o oră de recuperare', 'Ora pierdută se recuperează.');
            await queueHeld(to, 'Proiectele lui Ion', 'Ion a construit un joc.');
            await digests.run({ now: evening });

            const res = await request(app.getHttpServer()).get('/deliveries').set('Authorization', admin.auth).expect(200);
            const statuses = (res.body as { status: string }[]).map((row) => row.status);
            expect(statuses.filter((status) => status === 'digested')).toHaveLength(2);
            // Nothing was quietly marked sent: the only pending row is the combined message.
            expect(statuses.filter((status) => status === 'pending')).toHaveLength(1);

            const summary = await request(app.getHttpServer()).get('/deliveries/summary').set('Authorization', admin.auth).expect(200);
            expect(summary.body).toMatchObject({ digested: 2, pending: 1 });
        });
    });

    describe('two passes at once', () => {
        it('cannot fold the same messages twice', async () => {
            const to = await family('gabi.concurent');
            await queueHeld(to, 'Ai o oră de recuperare', 'Ora pierdută se recuperează.');
            await queueHeld(to, 'Proiectele lui Radu', 'Radu a construit un joc.');

            const [first, second] = await Promise.all([digests.run({ now: evening }), digests.run({ now: evening })]);

            // One pass does the work; the other finds nothing, because `SKIP LOCKED` hid the rows.
            expect(first.digests + second.digests).toBe(1);
            const all = await rows();
            expect(all.filter((row) => row.status === 'digested')).toHaveLength(2);
        });
    });

    describe('the parent decides', () => {
        it('sends each message separately to a family who asked for that', async () => {
            const to = await family('horia.imediat', 'immediate');
            await queueHeld(to, 'Ai o oră de recuperare', 'Ora pierdută se recuperează.');
            await queueHeld(to, 'Proiectele lui Vlad', 'Vlad a construit un joc.');

            const result = await digests.run({ now: morning });

            expect(result).toMatchObject({ released: 2, digests: 0 });
            expect((await rows()).every((row) => row.digestReleasedAt !== null)).toBe(true);
        });

        it('is a setting a parent can change on their own profile', async () => {
            const parent = await registerUser(app, 'irina.setare');
            const profileId = await ownProfileId(app, parent);

            await request(app.getHttpServer()).put(`/profiles/${profileId}`).set('Authorization', parent.auth).send({ messageFrequency: 'weekly' }).expect(200);

            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', parent.auth).expect(200);
            expect(res.body[0].messageFrequency).toBe('weekly');
        });

        it('defaults to daily, so the cap holds before anybody touches anything', async () => {
            const parent = await registerUser(app, 'jana.implicit');
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', parent.auth).expect(200);
            expect(res.body[0].messageFrequency).toBe('daily');
        });
    });
});
