import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Announcement } from 'src/entities/announcement.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { Location } from 'src/entities/location.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Profile } from 'src/entities/profile.entity';
import { AnnouncementAudience } from 'src/enum/announcement-audience.enum';
import { MessageKind } from 'src/enum/message-kind.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { AnnouncementService, announcementDedupeKey } from './announcement.service';
import { SendAnnouncementDto } from './dto/sendAnnouncement.dto';

/**
 * Announcements — E17/S7.
 *
 * The three rules worth a test are the three that make a broadcast different from every other
 * sender: one message per **parent**, the marketing preference actually consulted, and a text that
 * names a child stopped until somebody says it is a coincidence.
 */
describe('AnnouncementService', () => {
    let service: AnnouncementService;
    let childRepo: MockRepository;
    let groupRepo: MockRepository;
    let outbox: { queue: jest.Mock; queueOrRecord: jest.Mock; queueMarketing: jest.Mock };
    let manager: MockEntityManager;
    let insertValues: Record<string, unknown>[];

    /** A family, as the audience query returns it: a child row carrying its parent. */
    const childOf = (parentId: number, overrides: Partial<Profile> = {}, childFirstName = 'Copil') => ({
        id: parentId * 100,
        firstName: childFirstName,
        parent: {
            id: parentId,
            firstName: `Parinte${parentId}`,
            lastName: 'Test',
            email: `parinte${parentId}@example.com`,
            user: { id: parentId, emailConfirmedAt: new Date() },
            marketingOptIn: false,
            ...overrides,
        },
    });

    /** The audience query and the name-check query hang off the same repository; both are stubbed. */
    const withAudience = (children: unknown[], allChildren: unknown[] = children) => {
        childRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: children as never[] }));
        childRepo.find!.mockResolvedValue(allChildren);
    };

    beforeEach(async () => {
        childRepo = createMockRepository();
        groupRepo = createMockRepository();
        insertValues = [];

        outbox = {
            queue: jest.fn().mockResolvedValue({ id: 1, undeliverableReason: null }),
            queueOrRecord: jest.fn().mockResolvedValue({ id: 1, undeliverableReason: null }),
            queueMarketing: jest.fn().mockResolvedValue({ id: 1, undeliverableReason: null }),
        };

        manager = createMockEntityManager();
        const insertQb: Record<string, jest.Mock> = {};
        for (const method of ['insert', 'into', 'orIgnore', 'returning']) insertQb[method] = jest.fn(() => insertQb);
        insertQb.values = jest.fn((values: Record<string, unknown>) => {
            insertValues.push(values);
            return insertQb;
        });
        insertQb.execute = jest.fn().mockResolvedValue({ raw: [{ id: 7 }] });
        manager.createQueryBuilder = jest.fn(() => insertQb);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnnouncementService,
                provideMockRepository(Announcement, createMockRepository()),
                provideMockRepository(OutboxMessage, createMockRepository()),
                provideMockRepository(Child, childRepo),
                provideMockRepository(Group, groupRepo),
                provideMockRepository(Location, createMockRepository()),
                provideMockRepository(Profile, createMockRepository()),
                provideMockDataSource(manager),
                { provide: OutboxService, useValue: outbox },
            ],
        }).compile();

        service = module.get(AnnouncementService);
    });

    const announcement = (overrides: Partial<SendAnnouncementDto> = {}): SendAnnouncementDto => ({
        audience: AnnouncementAudience.ALL,
        subject: 'Sâmbătă e zi liberă',
        body: 'Sâmbătă nu se țin cursuri. Orele se reiau luni, la orele obișnuite.',
        ...overrides,
    });

    describe('one message per parent', () => {
        it('writes once to a family with two children in the audience', async () => {
            withAudience([childOf(1), childOf(1), childOf(2)]);

            const result = await service.send(announcement(), 99);

            // Two families, three children. Being triggered by a human is not a loophole through
            // the anti-burst rule; a parent reading one inbox gets one message.
            expect(result.queued).toBe(2);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(2);
        });

        it('greets each family by its own name', async () => {
            withAudience([childOf(1), childOf(2)]);

            await service.send(announcement(), 99);

            const bodies = outbox.queueOrRecord.mock.calls.map((call) => (call[1] as { bodyText: string }).bodyText);
            expect(bodies[0]).toContain('Bună, Parinte1!');
            expect(bodies[1]).toContain('Bună, Parinte2!');
        });

        it('links every message it wrote back to the announcement, in the same transaction', async () => {
            withAudience([childOf(1), childOf(2)]);
            outbox.queueOrRecord.mockResolvedValueOnce({ id: 11, undeliverableReason: null }).mockResolvedValueOnce({ id: 12, undeliverableReason: null });

            await service.send(announcement(), 99);

            expect(manager.update).toHaveBeenCalledWith(OutboxMessage, [11, 12], { announcement: { id: 7 } });
        });
    });

    describe('a family with nowhere to receive it', () => {
        it('reports the reason instead of dropping them from the count', async () => {
            withAudience([childOf(1, { email: undefined })]);
            outbox.queueOrRecord.mockResolvedValue({ id: 3, undeliverableReason: 'no_address' });

            const result = await service.send(announcement(), 99);

            // The row exists and so does the line in the report: nobody is skipped in silence (S5).
            expect(result.undeliverable).toEqual([{ parentId: 1, parentName: 'Parinte1 Test', reason: 'no_address' }]);
        });
    });

    describe('the marketing preference', () => {
        it('is consulted on a marketing announcement', async () => {
            withAudience([childOf(1)]);

            await service.send(announcement({ kind: MessageKind.MARKETING }), 99);

            expect(outbox.queueMarketing).toHaveBeenCalled();
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('is not consulted on an operational one — there is no argument that stops a day-off notice', async () => {
            withAudience([childOf(1)]);

            await service.send(announcement(), 99);

            expect(outbox.queueOrRecord).toHaveBeenCalled();
            expect(outbox.queueMarketing).not.toHaveBeenCalled();
        });

        it('counts a refusal without writing a row for it', async () => {
            withAudience([childOf(1), childOf(2)]);
            outbox.queueMarketing.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 5, undeliverableReason: null });

            const result = await service.send(announcement({ kind: MessageKind.MARKETING }), 99);

            expect(result.declined).toBe(1);
            expect(result.queued).toBe(1);
            // Stored, because it cannot be counted back off the queue: a refusal leaves nothing there.
            expect(manager.update).toHaveBeenCalledWith(Announcement, 7, { declinedCount: 1 });
        });
    });

    describe('the text must not name a child', () => {
        it('refuses the first press and says which name it found', async () => {
            withAudience([childOf(1, {}, 'Ștefan')]);

            await expect(service.send(announcement({ body: 'Îl felicităm pe Ștefan pentru proiectul lui.' }), 99)).rejects.toMatchObject({
                response: { error: 'ANNOUNCEMENT_NAMES_A_CHILD', details: ['Ștefan'] },
            });
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('goes through on the second, when the admin says it is a coincidence', async () => {
            withAudience([childOf(1, {}, 'Ștefan')]);

            const result = await service.send(announcement({ body: 'Ne vedem în Sala Ștefan cel Mare.', acknowledgeWarnings: true }), 99);

            // A warning, not a block: the school's own vocabulary has to stay usable.
            expect(result.queued).toBe(1);
        });

        it('reports the same names from the preview, which is where they are meant to be caught', async () => {
            withAudience([childOf(1, {}, 'Maria')]);

            const preview = await service.preview(announcement({ body: 'Felicitări Maria pentru rezultat.' }));

            expect(preview.warnings).toEqual(['Maria']);
        });
    });

    describe('an audience nobody is in', () => {
        it('is refused rather than recorded as a successful send to nobody', async () => {
            withAudience([]);
            groupRepo.findOne!.mockResolvedValue({ id: 4, name: 'Scratch' });

            await expect(service.send(announcement({ audience: AnnouncementAudience.GROUP, groupId: 4 }), 99)).rejects.toBeInstanceOf(ConflictException);
        });
    });

    describe('the second press', () => {
        it('is refused when the database says the same announcement is already there', async () => {
            withAudience([childOf(1)]);
            // `ON CONFLICT DO NOTHING` returned no row: an identical announcement exists for today.
            (manager.createQueryBuilder!() as unknown as { execute: jest.Mock }).execute.mockResolvedValue({ raw: [] });

            await expect(service.send(announcement(), 99)).rejects.toMatchObject({ response: { error: 'ANNOUNCEMENT_ALREADY_SENT' } });
        });
    });

    describe('the preview', () => {
        it('splits the audience into what can and cannot be written to', async () => {
            withAudience([
                childOf(1),
                childOf(2, { email: undefined }),
                childOf(3, { user: { id: 3, emailConfirmedAt: null } as never }),
                childOf(4, { user: null }),
            ]);

            const preview = await service.preview(announcement());

            // The fourth is a family an admin typed in from a phone call: no account, so nothing to
            // confirm, and the address they gave is the one to use.
            expect(preview.recipients).toEqual({ total: 4, deliverable: 2, noAddress: 1, unconfirmedAddress: 1, declined: 0 });
        });

        it('counts the families a marketing announcement would not reach', async () => {
            withAudience([childOf(1, { marketingOptIn: true }), childOf(2)]);

            const preview = await service.preview(announcement({ kind: MessageKind.MARKETING }));

            expect(preview.recipients).toMatchObject({ total: 2, deliverable: 1, declined: 1 });
        });
    });

    describe('the dedupe key', () => {
        const day = new Date('2026-03-09T12:00:00.000Z');

        it('is the same for the same words, audience and day', () => {
            const dto = announcement();
            expect(announcementDedupeKey(dto, MessageKind.TRANSACTIONAL, day)).toBe(announcementDedupeKey(dto, MessageKind.TRANSACTIONAL, day));
        });

        it('changes when a word does — a correction is a different message, and the families need it', () => {
            const first = announcementDedupeKey(announcement(), MessageKind.TRANSACTIONAL, day);
            const second = announcementDedupeKey(announcement({ body: 'Sâmbătă nu se țin cursuri. Orele se reiau marți.' }), MessageKind.TRANSACTIONAL, day);
            expect(first).not.toBe(second);
        });

        it('changes when the audience does', () => {
            const all = announcementDedupeKey(announcement(), MessageKind.TRANSACTIONAL, day);
            const group = announcementDedupeKey(announcement({ audience: AnnouncementAudience.GROUP, groupId: 3 }), MessageKind.TRANSACTIONAL, day);
            expect(all).not.toBe(group);
        });

        it('is read on the school clock, not the server one', () => {
            // 23:30 UTC is already the next day in Bucharest, so the guard rolls over with the
            // school rather than two or three hours after it.
            const lateUtc = new Date('2026-03-09T23:30:00.000Z');
            expect(announcementDedupeKey(announcement(), MessageKind.TRANSACTIONAL, lateUtc)).toContain('2026-03-10');
        });
    });
});
