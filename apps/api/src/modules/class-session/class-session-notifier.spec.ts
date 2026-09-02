import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { ClassSessionNotifier, CANCELLED_DEDUPE_PREFIX, MOVED_DEDUPE_PREFIX, REINSTATED_DEDUPE_PREFIX } from './class-session-notifier';
import { ClassSession } from 'src/entities/class-session.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { createMockEntityManager, createMockRepository, MockEntityManager, MockRepository } from 'src/testing/repository.mock';

describe('ClassSessionNotifier', () => {
    let notifier: ClassSessionNotifier;
    let sessionRepo: MockRepository;
    let manager: MockEntityManager;
    let outbox: { queueOrRecord: jest.Mock };
    let templates: { render: jest.Mock };

    /** The day the button is pressed. Fixed, because it goes into the dedupe key. */
    const TODAY = new Date(2026, 8, 2);

    const ana = { id: 11, firstName: 'Ana', email: 'ana@example.com' };
    const bogdan = { id: 12, firstName: 'Bogdan', email: 'bogdan@example.com' };

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
        manager = createMockEntityManager(new Map([[ClassSession, sessionRepo]]));
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

    describe('a cancelled class', () => {
        it('writes once per parent, not once per child', async () => {
            const written = await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager(), TODAY);

            expect(written).toBe(2);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(2);
        });

        it('queues with the caller’s manager, so the note cannot outlive a rolled-back cancellation', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager(), TODAY);

            for (const call of outbox.queueOrRecord.mock.calls) {
                expect(call[2]).toBe(manager);
            }
        });

        it('keys the message on the session and the day it was cancelled', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager(), TODAY);

            const keys = outbox.queueOrRecord.mock.calls.map((call) => (call[1] as { dedupeKey: string }).dedupeKey);
            expect(keys).toEqual([`${CANCELLED_DEDUPE_PREFIX}3:2026-09-02:11`, `${CANCELLED_DEDUPE_PREFIX}3:2026-09-02:12`]);
        });

        it('promises a make-up only when one was granted', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', true, asManager(), TODAY);
            expect(templates.render.mock.calls[0][1].makeUpNote).toContain('recuperare');

            templates.render.mockClear();
            await notifier.notifyCancelled(3, 'Zăpadă', false, asManager(), TODAY);
            expect(templates.render.mock.calls[0][1].makeUpNote).not.toContain('recuperare');
        });

        it('names the class in the words a parent would use', async () => {
            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager(), TODAY);

            expect(templates.render).toHaveBeenCalledWith(
                'class-cancelled',
                expect.objectContaining({ groupName: 'Scratch Începători', date: '9 septembrie', time: '16:00', reason: 'Profesor bolnav' }),
            );
        });

        // A parent with no address is `queueOrRecord`'s business (E17/S5): it records the fact
        // rather than skipping in silence. What matters here is that it is still offered.
        it('offers the parent without an address to the outbox anyway', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...session, group: { ...session.group, children: [{ id: 1, parent: { ...ana, email: null } }] } });

            await notifier.notifyCancelled(3, 'Profesor bolnav', false, asManager(), TODAY);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything(), manager);
        });

        it('says nothing about a session that is not there', async () => {
            sessionRepo.findOne!.mockResolvedValue(null);

            expect(await notifier.notifyCancelled(99, 'X', false, asManager(), TODAY)).toBe(0);
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });

    describe('a moved class', () => {
        const from = { date: '2026-09-07', startTime: '16:00:00', roomName: 'Sala 1', locationName: 'Drumul Taberei' };

        it('carries both halves: where it was and where it is now', async () => {
            await notifier.notifyMoved(3, from, 'Sala ocupată', asManager(), TODAY);

            expect(templates.render).toHaveBeenCalledWith(
                'class-moved',
                expect.objectContaining({ fromWhen: '7 septembrie, ora 16:00', toWhen: '9 septembrie, ora 16:00', room: 'Sala 1 — Drumul Taberei' }),
            );
        });

        it('keys on the day of the move, so a class moved twice is announced twice', async () => {
            await notifier.notifyMoved(3, from, 'X', asManager(), TODAY);
            const first = (outbox.queueOrRecord.mock.calls[0][1] as { dedupeKey: string }).dedupeKey;

            outbox.queueOrRecord.mockClear();
            await notifier.notifyMoved(3, from, 'X', asManager(), new Date(2026, 8, 3));
            const second = (outbox.queueOrRecord.mock.calls[0][1] as { dedupeKey: string }).dedupeKey;

            expect(first).toBe(`${MOVED_DEDUPE_PREFIX}3:2026-09-02:11`);
            expect(second).toBe(`${MOVED_DEDUPE_PREFIX}3:2026-09-03:11`);
        });
    });

    describe('a reinstated class', () => {
        it('tells the families the class is on again', async () => {
            const written = await notifier.notifyReinstated(3, asManager(), TODAY);

            expect(written).toBe(2);
            expect(templates.render).toHaveBeenCalledWith('class-reinstated', expect.objectContaining({ date: '9 septembrie', time: '16:00' }));
            expect((outbox.queueOrRecord.mock.calls[0][1] as { dedupeKey: string }).dedupeKey).toBe(`${REINSTATED_DEDUPE_PREFIX}3:2026-09-02:11`);
        });
    });
});
