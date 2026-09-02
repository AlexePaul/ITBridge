import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { ClassSessionNotifier, CANCELLED_DEDUPE_PREFIX, MOVED_DEDUPE_PREFIX, REINSTATED_DEDUPE_PREFIX } from './class-session-notifier';
import { ClassSession } from 'src/entities/class-session.entity';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { createMockEntityManager, createMockRepository, MockEntityManager, MockRepository } from 'src/testing/repository.mock';

describe('ClassSessionNotifier', () => {
    let notifier: ClassSessionNotifier;
    let sessionRepo: MockRepository;
    let creditRepo: MockRepository;
    let outboxRepo: MockRepository;
    let manager: MockEntityManager;
    let outbox: { queueOrRecord: jest.Mock };
    let templates: { render: jest.Mock };

    const ana = { id: 11, firstName: 'Ana', email: 'ana@example.com' };
    const bogdan = { id: 12, firstName: 'Bogdan', email: 'bogdan@example.com' };
    /** A parent from another group, whose child booked a make-up into this class. */
    const carmen = { id: 13, firstName: 'Carmen', email: 'carmen@example.com' };

    const session = {
        id: 3,
        date: new Date(2026, 8, 9),
        startTime: '16:00:00',
        endTime: '17:30:00',
        room: { name: 'Sala 1', location: { name: 'Drumul Taberei' } },
        group: {
            id: 7,
            name: 'Scratch Începători',
            // Two of Ana's children and one of Bogdan's: the case the per-parent grouping is for.
            children: [
                { id: 1, parent: ana },
                { id: 2, parent: ana },
                { id: 3, parent: bogdan },
            ],
        },
    };

    beforeEach(async () => {
        sessionRepo = createMockRepository();
        sessionRepo.findOne!.mockResolvedValue(session);
        creditRepo = createMockRepository();
        creditRepo.find!.mockResolvedValue([]);
        outboxRepo = createMockRepository();
        outboxRepo.count!.mockResolvedValue(0);
        manager = createMockEntityManager(
            new Map<unknown, MockRepository>([
                [ClassSession, sessionRepo],
                [MakeUpCredit, creditRepo],
                [OutboxMessage, outboxRepo],
            ]),
        );
        outbox = { queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
        templates = {
            render: jest.fn().mockResolvedValue({ subject: 'Subiect', bodyText: 'Text', bodyHtml: '<p>Text</p>' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [ClassSessionNotifier, { provide: OutboxService, useValue: outbox }, { provide: MailTemplateService, useValue: templates }],
        }).compile();
        notifier = module.get(ClassSessionNotifier);
    });

    const asManager = () => manager as unknown as EntityManager;
    const keys = () => outbox.queueOrRecord.mock.calls.map((call) => (call[1] as { dedupeKey: string }).dedupeKey);

    describe('a cancelled class', () => {
        it('writes once per parent, not once per child', async () => {
            const written = await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager());

            expect(written).toBe(2);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(2);
        });

        it('queues with the caller’s manager, so the note cannot outlive a rolled-back cancellation', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager());

            for (const call of outbox.queueOrRecord.mock.calls) {
                expect(call[2]).toBe(manager);
            }
        });

        it('keys the message on the session and on how many times it has been announced', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager());

            expect(keys()).toEqual([`${CANCELLED_DEDUPE_PREFIX}3:0:11`, `${CANCELLED_DEDUPE_PREFIX}3:0:12`]);
            expect(outboxRepo.count).toHaveBeenCalledWith({ where: { dedupeKey: expect.objectContaining({ _value: `${CANCELLED_DEDUPE_PREFIX}3:%` }) } });
        });

        /**
         * The case the count exists for: cancelled by mistake, reinstated a minute later, then
         * really cancelled — all in one afternoon. The family last heard the class was on, so the
         * second cancellation must reach them, and a key on the day alone would have refused it.
         */
        it('announces a second cancellation on the same day, because the family last heard the class was on', async () => {
            outboxRepo.count!.mockResolvedValue(2);

            await notifier.notifyCancelled(3, 'Chiar bolnav', false, asManager());

            expect(keys()).toEqual([`${CANCELLED_DEDUPE_PREFIX}3:2:11`, `${CANCELLED_DEDUPE_PREFIX}3:2:12`]);
        });

        it('promises a make-up only when one was granted, and points at the make-up page only then', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', true, asManager());
            expect(templates.render.mock.calls[0][1].makeUpNote).toContain('recuperare');
            expect(templates.render.mock.calls[0][1].portalUrl).toContain('/user/absente');

            templates.render.mockClear();
            await notifier.notifyCancelled(3, 'Zăpadă', false, asManager());
            expect(templates.render.mock.calls[0][1].makeUpNote).not.toContain('recuperare');
            expect(templates.render.mock.calls[0][1].portalUrl).not.toContain('/user/absente');
        });

        /**
         * A child from another group booked a make-up into this class (E12/S4). That family is not
         * in the group, but they were going to be in the room — so they hear the class is off, in
         * their own words: the booking is released and the right is still theirs.
         */
        it('tells a family visiting for a make-up, in their own words', async () => {
            creditRepo.find!.mockResolvedValue([{ id: 40, child: { id: 9, parent: carmen } }]);

            const written = await notifier.notifyCancelled(3, 'Profesor bolnav', true, asManager());

            expect(written).toBe(3);
            expect(creditRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ bookedSession: { id: 3 } }) }));
            const carmenMail = templates.render.mock.calls.find((call) => call[1].firstName === 'Carmen')![1];
            expect(carmenMail.makeUpNote).toContain('programaseși');
            expect(carmenMail.portalUrl).toContain('/user/absente');
            expect(keys()).toContain(`${CANCELLED_DEDUPE_PREFIX}3:0:13`);
        });

        it('reads a parent who is both in the group and visiting as the group’s, once', async () => {
            creditRepo.find!.mockResolvedValue([{ id: 40, child: { id: 9, parent: ana } }]);

            expect(await notifier.notifyCancelled(3, 'Profesor bolnav', true, asManager())).toBe(2);
            expect(templates.render.mock.calls[0][1].makeUpNote).not.toContain('programaseși');
        });

        it('names the class in the words a parent would use', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager());

            expect(templates.render).toHaveBeenCalledWith(
                'class-cancelled',
                expect.objectContaining({ groupName: 'Scratch Începători', date: '9 septembrie', time: '16:00', reason: 'Profesor bolnav' }),
            );
        });

        // A parent with no address is `queueOrRecord`'s business (E17/S5): it records the fact
        // rather than skipping in silence. What matters here is that it is still offered.
        it('offers the parent without an address to the outbox anyway', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...session, group: { ...session.group, children: [{ id: 1, parent: { ...ana, email: null } }] } });

            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager());

            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything(), manager);
        });

        it('says nothing about a session that is not there', async () => {
            sessionRepo.findOne!.mockResolvedValue(null);

            expect(await notifier.notifyCancelled(99, 'X', false, asManager())).toBe(0);
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });

    describe('a moved class', () => {
        const from = { date: '2026-09-07', startTime: '16:00:00', roomName: 'Sala 2', locationName: 'Militari' };

        it('carries both halves: where it was and where it is now', async () => {
            await notifier.notifyMoved(3, from, 'Sala ocupată', asManager());

            expect(templates.render).toHaveBeenCalledWith(
                'class-moved',
                expect.objectContaining({
                    fromWhen: '7 septembrie, ora 16:00, Sala 2 — Militari',
                    toWhen: '9 septembrie, ora 16:00',
                    room: 'Sala 1 — Drumul Taberei',
                }),
            );
        });

        it('keys on the announcement count, so a class moved twice is announced twice', async () => {
            await notifier.notifyMoved(3, from, 'X', asManager());
            outboxRepo.count!.mockResolvedValue(2);
            await notifier.notifyMoved(3, from, 'X', asManager());

            expect(keys()).toEqual([
                `${MOVED_DEDUPE_PREFIX}3:0:11`,
                `${MOVED_DEDUPE_PREFIX}3:0:12`,
                `${MOVED_DEDUPE_PREFIX}3:2:11`,
                `${MOVED_DEDUPE_PREFIX}3:2:12`,
            ]);
        });

        it('tells a family visiting for a make-up the new hour too', async () => {
            creditRepo.find!.mockResolvedValue([{ id: 40, child: { id: 9, parent: carmen } }]);

            expect(await notifier.notifyMoved(3, from, 'X', asManager())).toBe(3);
        });
    });

    describe('a reinstated class', () => {
        it('tells the families the class is on again', async () => {
            const written = await notifier.notifyReinstated(3, asManager());

            expect(written).toBe(2);
            expect(templates.render).toHaveBeenCalledWith('class-reinstated', expect.objectContaining({ date: '9 septembrie', time: '16:00' }));
            expect(keys()[0]).toBe(`${REINSTATED_DEDUPE_PREFIX}3:0:11`);
        });

        // The booking was released at cancellation and that family told to pick another hour.
        it('does not look for visiting families', async () => {
            await notifier.notifyReinstated(3, asManager());

            expect(creditRepo.find).not.toHaveBeenCalled();
        });
    });
});
