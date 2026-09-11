import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { STUCK_AFTER_MINUTES } from 'src/modules/mail/outbox-health.rules';

/**
 * „Câte mesaje n-au ajuns la o familie" — E17/S5, over HTTP and against Postgres.
 *
 * The unit tests pin the arithmetic and the threshold. What only this suite can show is the part
 * that is SQL rather than TypeScript: `nextAttemptAt` is a `timestamptz`, and the whole third
 * number is a comparison against it. That comparison is the same shape as the one that made the
 * delivery log report an empty day between midnight and 03:00 Bucharest, so it is worth a real
 * database rather than a mocked builder.
 */
describe('Outbox health (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.coada'));
    });

    /** A queued message in whatever state the case needs. Nothing here goes through the senders. */
    const queue = async (status: OutboxStatus, nextAttemptAt: Date) => {
        await dataSource.getRepository(OutboxMessage).save(
            dataSource.getRepository(OutboxMessage).create({
                to: 'ana@example.com',
                subject: 'Subiect',
                bodyText: 'Text',
                status,
                nextAttemptAt,
                dedupeKey: `test:${status}:${nextAttemptAt.toISOString()}:${Math.random()}`,
            }),
        );
    };

    const overview = async () => {
        const res = await request(app.getHttpServer()).get('/overview').set('Authorization', admin.auth).expect(200);
        return res.body.messagesNotDelivered as { failed: number; undeliverable: number; stuck: number; stuckAfterMinutes: number };
    };

    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

    it('reports nothing on a healthy queue, which is never an empty one', async () => {
        // `beforeEach` registers an account, and registration queues a confirmation mail. So this
        // runs against a queue holding a real pending message that came due a moment ago — which
        // is precisely the row a careless comparison counts as stuck. Flipping `<=` to `>=` in the
        // query turns this test red, and that is the point of asserting it here rather than
        // assuming an empty table.
        await expect(overview()).resolves.toEqual({ failed: 0, undeliverable: 0, stuck: 0, stuckAfterMinutes: STUCK_AFTER_MINUTES });
    });

    it('counts a message the provider gave up on, which the old tile read as zero', async () => {
        await queue(OutboxStatus.FAILED, minutesAgo(1));

        await expect(overview()).resolves.toMatchObject({ failed: 1, undeliverable: 0, stuck: 0 });
    });

    it('counts a message that had nowhere to go', async () => {
        await queue(OutboxStatus.UNDELIVERABLE, minutesAgo(1));

        await expect(overview()).resolves.toMatchObject({ failed: 0, undeliverable: 1, stuck: 0 });
    });

    it('counts a pending message nobody has claimed since it came due', async () => {
        await queue(OutboxStatus.PENDING, minutesAgo(STUCK_AFTER_MINUTES + 5));

        await expect(overview()).resolves.toMatchObject({ stuck: 1 });
    });

    it('leaves a message waiting out its backoff alone', async () => {
        // Due in the future: the dispatcher is not supposed to have taken it yet, and a tile that
        // called this stuck would be red on every healthy queue with a retry in it.
        await queue(OutboxStatus.PENDING, new Date(Date.now() + 10 * 60_000));

        await expect(overview()).resolves.toMatchObject({ stuck: 0 });
    });

    it('leaves a message that came due a moment ago alone', async () => {
        // One tick of slack is thirty seconds; this is a minute. Nothing structural has happened.
        await queue(OutboxStatus.PENDING, minutesAgo(1));

        await expect(overview()).resolves.toMatchObject({ stuck: 0 });
    });

    it('does not count what already left', async () => {
        await queue(OutboxStatus.SENT, minutesAgo(120));

        await expect(overview()).resolves.toEqual({ failed: 0, undeliverable: 0, stuck: 0, stuckAfterMinutes: STUCK_AFTER_MINUTES });
    });

    it('adds the three up without double-counting any of them', async () => {
        await queue(OutboxStatus.FAILED, minutesAgo(120));
        await queue(OutboxStatus.FAILED, minutesAgo(120));
        await queue(OutboxStatus.UNDELIVERABLE, minutesAgo(120));
        await queue(OutboxStatus.PENDING, minutesAgo(120));
        await queue(OutboxStatus.SENT, minutesAgo(120));

        await expect(overview()).resolves.toMatchObject({ failed: 2, undeliverable: 1, stuck: 1 });
    });

    it('is admin-only, like the rest of the overview', async () => {
        const parent = await registerUser(app, 'ana.coada');

        await request(app.getHttpServer()).get('/overview').set('Authorization', parent.auth).expect(403);
    });
});
