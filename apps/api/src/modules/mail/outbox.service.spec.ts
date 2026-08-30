import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import {
    createMockInsertBuilder,
    createMockQueryBuilder,
    createMockRepository,
    MockQueryBuilder,
    MockRepository,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { MailNotConfiguredError, MailSendError, MailService } from './mail.service';
import { backoffFrom, MAX_ATTEMPTS, OutboxService } from './outbox.service';

const MINUTE = 60 * 1000;

/** A pass never waits between sends in the tests; the pacing is a provider courtesy, not behaviour. */
const NO_PACING = { pacingMs: 0 };

function makeMessage(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
    return {
        id: 1,
        to: 'parinte@example.com',
        subject: 'Ședința de marți e anulată',
        bodyText: 'Salut,',
        bodyHtml: null,
        status: OutboxStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date('2026-03-02T09:00:00.000Z'),
        lastError: null,
        dedupeKey: null,
        createdAt: new Date('2026-03-02T09:00:00.000Z'),
        sentAt: null,
        ...overrides,
    };
}

describe('OutboxService', () => {
    let service: OutboxService;
    let outboxRepo: MockRepository;
    let mailService: { send: jest.Mock };
    let dataSource: { transaction: jest.Mock };

    /** The rows the fake database holds. Both the claim and the outcome write back into this. */
    let table: OutboxMessage[];

    /** The last claim query built, so a test can ask what it was asked with. */
    let lastClaimQuery: MockQueryBuilder<OutboxMessage>;

    const now = new Date('2026-03-02T10:00:00.000Z');

    beforeEach(async () => {
        table = [];
        mailService = { send: jest.fn().mockResolvedValue('msg_1') };
        outboxRepo = createMockRepository();

        /**
         * The claim, standing in for `SELECT … FOR UPDATE SKIP LOCKED`. `getMany` applies the two
         * conditions the service actually asked for — pending, and due by the `now` it passed — so
         * the test is reading the real query's intent rather than a hard-coded answer.
         */
        const manager = {
            createQueryBuilder: jest.fn(() => {
                const qb = createMockQueryBuilder<OutboxMessage>({ many: [] });
                qb.getMany = jest.fn(() => {
                    const dueBy = qb.andWhereCalls.map(([, params]) => params?.now).find((value): value is Date => value instanceof Date);
                    return Promise.resolve(table.filter((row) => row.status === OutboxStatus.PENDING && row.nextAttemptAt <= (dueBy ?? now)));
                }) as never;
                lastClaimQuery = qb;
                return qb;
            }),
            update: jest.fn((_entity: unknown, id: number, patch: Partial<OutboxMessage>) => {
                Object.assign(table.find((row) => row.id === id) ?? {}, patch);
                return Promise.resolve({ affected: 1 });
            }),
        };

        /**
         * Transactions run one at a time. That is not laziness in the double: `FOR UPDATE` is
         * exactly what serialises two overlapping claims in Postgres, and `SKIP LOCKED` is what
         * makes the second one come back empty instead of waiting. The mock reproduces the
         * consequence; that the code asks for that lock mode is asserted separately, below.
         */
        let inFlight: Promise<unknown> = Promise.resolve();
        dataSource = {
            transaction: jest.fn((callback: (manager: EntityManager) => Promise<unknown>) => {
                const run = inFlight.then(() => callback(manager as unknown as EntityManager));
                inFlight = run.catch(() => undefined);
                return run;
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OutboxService,
                provideMockRepository(OutboxMessage, outboxRepo),
                { provide: getDataSourceToken(), useValue: dataSource },
                { provide: MailService, useValue: mailService },
            ],
        }).compile();
        service = module.get(OutboxService);

        // Recording an outcome writes back to the same rows the claim reads.
        outboxRepo.update!.mockImplementation((id: number, patch: Partial<OutboxMessage>) => {
            Object.assign(table.find((row) => row.id === id) ?? {}, patch);
            return Promise.resolve({ affected: 1 });
        });
        outboxRepo.createQueryBuilder!.mockReturnValue(createMockInsertBuilder([makeMessage()]));
    });

    describe('queue', () => {
        it('writes the message down and hands the row back', async () => {
            const queued = await service.queue({ to: 'parinte@example.com', subject: 'Factura pe martie', bodyText: 'Salut,' });

            expect(queued?.id).toBe(1);
        });

        it('stores an absent html body as null rather than undefined', async () => {
            const builder = createMockInsertBuilder([makeMessage()]);
            outboxRepo.createQueryBuilder!.mockReturnValue(builder);

            await service.queue({ to: 'parinte@example.com', subject: 'Factura', bodyText: 'Salut,' });

            expect(builder.values).toHaveBeenCalledWith(expect.objectContaining({ bodyHtml: null, dedupeKey: null }));
        });

        /**
         * The duplicate is refused by the database, not by a check that races, and with
         * `ON CONFLICT DO NOTHING` rather than a caught unique violation — a failed statement
         * inside the caller's transaction would abort the invoice along with the notification.
         */
        it('lets the database refuse a duplicate, without failing the caller', async () => {
            const builder = createMockInsertBuilder([]);
            outboxRepo.createQueryBuilder!.mockReturnValue(builder);

            const queued = await service.queue({ to: 'parinte@example.com', subject: 'Raport', bodyText: 'Salut,', dedupeKey: 'unmarked:2026-03-01' });

            expect(queued).toBeNull();
            expect(builder.orIgnore).toHaveBeenCalled();
        });

        /**
         * The word *transactional* in "transactional outbox": given the caller's manager, the row
         * is written inside the caller's transaction, so the business change and the message about
         * it commit together or not at all.
         */
        it('writes through the caller transaction when it is given one', async () => {
            const callerBuilder = createMockInsertBuilder([makeMessage({ id: 7 })]);
            const callerRepo = { createQueryBuilder: jest.fn().mockReturnValue(callerBuilder) };
            const callerManager = { getRepository: jest.fn().mockReturnValue(callerRepo) } as unknown as EntityManager;

            const queued = await service.queue({ to: 'parinte@example.com', subject: 'Factura', bodyText: 'Salut,' }, callerManager);

            expect(queued?.id).toBe(7);
            expect(callerRepo.createQueryBuilder).toHaveBeenCalled();
            // The service's own repository is outside that transaction, so it must not be touched.
            expect(outboxRepo.createQueryBuilder).not.toHaveBeenCalled();
        });
    });

    describe('dispatchPending', () => {
        it('claims with FOR UPDATE SKIP LOCKED, which is what keeps two schedulers apart', async () => {
            table.push(makeMessage());

            await service.dispatchPending({ now, ...NO_PACING });

            expect(lastClaimQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
            expect(lastClaimQuery.setOnLocked).toHaveBeenCalledWith('skip_locked');
        });

        it('takes only pending messages that are due', async () => {
            table.push(makeMessage({ id: 1 }));
            table.push(makeMessage({ id: 2, status: OutboxStatus.SENT }));
            table.push(makeMessage({ id: 3, status: OutboxStatus.FAILED }));
            table.push(makeMessage({ id: 4, nextAttemptAt: new Date(now.getTime() + MINUTE) }));

            const result = await service.dispatchPending({ now, ...NO_PACING });

            expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
            expect(mailService.send).toHaveBeenCalledTimes(1);
        });

        it('sends the stored body and marks the row sent', async () => {
            table.push(makeMessage({ bodyHtml: '<p>Salut,</p>' }));

            await service.dispatchPending({ now, ...NO_PACING });

            expect(mailService.send).toHaveBeenCalledWith({
                to: 'parinte@example.com',
                subject: 'Ședința de marți e anulată',
                text: 'Salut,',
                html: '<p>Salut,</p>',
            });
            expect(table[0].status).toBe(OutboxStatus.SENT);
            expect(table[0].sentAt).toBeInstanceOf(Date);
        });

        it('respects the batch size', async () => {
            for (let id = 1; id <= 5; id += 1) {
                table.push(makeMessage({ id }));
            }

            await service.dispatchPending({ now, batchSize: 2, ...NO_PACING });

            expect(lastClaimQuery.limit).toHaveBeenCalledWith(2);
        });

        /**
         * Counted when the message is taken, not when the provider answers. A process killed
         * mid-send has, as far as anyone can tell, already asked — and counting it is what stops a
         * crash loop from sending the same message forever.
         */
        it('counts the attempt at claim time and pushes the next one out', async () => {
            table.push(makeMessage());

            await service.dispatchPending({ now, ...NO_PACING });

            expect(table[0].attempts).toBe(1);
            expect(table[0].nextAttemptAt).toEqual(new Date(now.getTime() + 2 * MINUTE));
        });
    });

    describe('retrying', () => {
        it('leaves a temporary failure pending, with the reason on the row', async () => {
            table.push(makeMessage());
            mailService.send.mockRejectedValue(new MailSendError('Resend answered 503: unavailable', false, 503));

            const result = await service.dispatchPending({ now, ...NO_PACING });

            expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
            expect(table[0].status).toBe(OutboxStatus.PENDING);
            expect(table[0].lastError).toContain('503');
        });

        /**
         * The brief's requirement for a backend with no key: the send fails in a controlled way and
         * leaves a trace. Temporary, not permanent — setting the variable and restarting rescues
         * everything still queued, which giving up immediately would not.
         */
        it('treats a missing mail configuration as temporary, and records why', async () => {
            table.push(makeMessage());
            mailService.send.mockRejectedValue(new MailNotConfiguredError('MAIL_RESEND_API_KEY'));

            await service.dispatchPending({ now, ...NO_PACING });

            expect(table[0].status).toBe(OutboxStatus.PENDING);
            expect(table[0].lastError).toContain('MAIL_RESEND_API_KEY');
        });

        it('comes back to a failed message once the backoff has elapsed', async () => {
            table.push(makeMessage());
            mailService.send.mockRejectedValueOnce(new MailSendError('Resend answered 429: slow down', false, 429));

            await service.dispatchPending({ now, ...NO_PACING });
            // Two minutes later it is still not due; the pass takes nothing.
            await service.dispatchPending({ now: new Date(now.getTime() + MINUTE), ...NO_PACING });
            expect(mailService.send).toHaveBeenCalledTimes(1);

            const afterBackoff = await service.dispatchPending({ now: new Date(now.getTime() + 3 * MINUTE), ...NO_PACING });

            expect(afterBackoff).toEqual({ claimed: 1, sent: 1, failed: 0 });
            expect(table[0].status).toBe(OutboxStatus.SENT);
        });

        it('gives up after the attempt limit, and leaves the row visible as a permanent failure', async () => {
            table.push(makeMessage({ attempts: MAX_ATTEMPTS - 1 }));
            mailService.send.mockRejectedValue(new MailSendError('Resend answered 500: boom', false, 500));

            await service.dispatchPending({ now, ...NO_PACING });

            expect(table[0].attempts).toBe(MAX_ATTEMPTS);
            expect(table[0].status).toBe(OutboxStatus.FAILED);
            expect(table[0].lastError).toContain('500');
        });

        it('never claims a message it has given up on', async () => {
            table.push(makeMessage({ attempts: MAX_ATTEMPTS - 1 }));
            mailService.send.mockRejectedValueOnce(new MailSendError('Resend answered 500: boom', false, 500));

            await service.dispatchPending({ now, ...NO_PACING });
            const later = await service.dispatchPending({ now: new Date(now.getTime() + 24 * 60 * MINUTE), ...NO_PACING });

            expect(later.claimed).toBe(0);
            expect(mailService.send).toHaveBeenCalledTimes(1);
        });

        /**
         * Writing the outcome down can fail on its own — a connection dropped between the send and
         * the update. That is a database problem, not a rejected message, so it must not take the
         * rest of the batch with it and must not end up written into `lastError` as though the
         * provider had said it.
         */
        it('keeps going when recording an outcome fails', async () => {
            table.push(makeMessage({ id: 1 }));
            table.push(makeMessage({ id: 2 }));
            outboxRepo.update!.mockRejectedValueOnce(new Error('connection terminated'));

            const result = await service.dispatchPending({ now, ...NO_PACING });

            expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
            expect(mailService.send).toHaveBeenCalledTimes(2);
        });

        /**
         * A refusal is not an outage. Sending the identical request to an unverified domain or an
         * invalid address gets the identical answer, so the row stops on the first attempt rather
         * than repeating itself for two hours.
         */
        it('stops immediately on a permanent refusal, without spending the remaining attempts', async () => {
            table.push(makeMessage());
            mailService.send.mockRejectedValue(new MailSendError('Resend answered 422: invalid address', true, 422));

            await service.dispatchPending({ now, ...NO_PACING });

            expect(table[0].status).toBe(OutboxStatus.FAILED);
            expect(table[0].attempts).toBe(1);
        });
    });

    /**
     * E17/S3's acceptance: two overlapping passes must not send the same message twice.
     *
     * What the double can show is the consequence of the claim: a row taken by one pass is invisible
     * to the next, because taking it moves `nextAttemptAt` forward before the transaction ends. The
     * exclusion under genuine concurrency belongs to Postgres, and the test above asserts that the
     * query does ask for `FOR UPDATE … SKIP LOCKED` rather than assuming somebody remembered to.
     */
    describe('two schedulers running at once', () => {
        it('does not send the same message twice', async () => {
            for (let id = 1; id <= 4; id += 1) {
                table.push(makeMessage({ id }));
            }

            const [first, second] = await Promise.all([service.dispatchPending({ now, ...NO_PACING }), service.dispatchPending({ now, ...NO_PACING })]);

            expect(first.claimed + second.claimed).toBe(4);
            expect(mailService.send).toHaveBeenCalledTimes(4);
            const recipients = mailService.send.mock.calls.map(([sent]: [{ subject: string }]) => sent);
            expect(new Set(recipients.map((sent) => sent.subject)).size).toBe(1);
            expect(table.every((row) => row.status === OutboxStatus.SENT)).toBe(true);
        });

        it('leaves the second pass with nothing rather than with the first pass rows', async () => {
            table.push(makeMessage());

            const [first, second] = await Promise.all([service.dispatchPending({ now, ...NO_PACING }), service.dispatchPending({ now, ...NO_PACING })]);

            expect([first.claimed, second.claimed].sort()).toEqual([0, 1]);
            expect(mailService.send).toHaveBeenCalledTimes(1);
        });
    });

    /**
     * Doubling from two minutes, capped at an hour: attempts land at 0, 2, 6, 14, 30, 62 and 122
     * minutes. E17/S3 requires that an hour-long outage lose nothing, so the last attempt has to
     * fall well past the hour rather than on it.
     */
    describe('backoffFrom', () => {
        it('doubles with each attempt', () => {
            expect(backoffFrom(now, 1)).toEqual(new Date(now.getTime() + 2 * MINUTE));
            expect(backoffFrom(now, 2)).toEqual(new Date(now.getTime() + 4 * MINUTE));
            expect(backoffFrom(now, 3)).toEqual(new Date(now.getTime() + 8 * MINUTE));
        });

        it('caps at an hour, so a long outage does not push the last attempt into next week', () => {
            expect(backoffFrom(now, 20)).toEqual(new Date(now.getTime() + 60 * MINUTE));
        });

        it('keeps trying for longer than the hour E17 asks it to survive', () => {
            let elapsed = 0;
            for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
                elapsed += backoffFrom(now, attempt).getTime() - now.getTime();
            }
            expect(elapsed).toBeGreaterThan(60 * MINUTE);
        });
    });
});
