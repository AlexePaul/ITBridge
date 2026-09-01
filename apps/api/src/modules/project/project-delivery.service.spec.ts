import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Project } from 'src/entities/project.entity';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { ProjectDeliveryService } from './project-delivery.service';
import { ProjectService } from './project.service';

/**
 * The send. E14/S4, carried by E17/S8.
 *
 * The rule under test throughout is the one whose failure is a disclosure of personal data: one
 * press produces N messages, each with exactly one recipient and exactly that recipient's own
 * children's documents. Nothing a child built reaches another family — not as a thumbnail, not as a
 * title, not as a link.
 */

interface ProjectRow {
    id: number;
    title: string;
    publicId: string;
    hasThumbnail: boolean;
    status: ProjectStatus;
    child: {
        id: number;
        firstName: string;
        parent: { id: number; firstName: string; lastName: string; email: string | null; user?: { emailConfirmedAt: Date | null } | null };
    };
    versions: { files: { uploadedAt: Date | null }[] }[];
}

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
    return {
        id: 41,
        title: 'Robotul',
        publicId: 'uuid-41',
        hasThumbnail: true,
        status: ProjectStatus.NEW,
        child: {
            id: 12,
            firstName: 'Andrei',
            parent: { id: 3, firstName: 'Maria', lastName: 'Popescu', email: 'maria@example.com', user: { emailConfirmedAt: new Date() } },
        },
        versions: [{ files: [{ uploadedAt: new Date() }] }],
        ...overrides,
    };
}

describe('ProjectDeliveryService', () => {
    let service: ProjectDeliveryService;
    let projectRepo: MockRepository;
    let outbox: { queue: jest.Mock; queueOrRecord: jest.Mock };
    let manager: MockEntityManager;

    beforeEach(async () => {
        projectRepo = createMockRepository();
        outbox = { queue: jest.fn().mockResolvedValue({ id: 500 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 501 }) };
        manager = createMockEntityManager();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectDeliveryService,
                provideMockRepository(Project, projectRepo),
                { provide: ProjectService, useValue: { findByPublicId: jest.fn() } },
                { provide: OutboxService, useValue: outbox },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(ProjectDeliveryService);
    });

    it("queues one message per parent, each with only that parent's documents", async () => {
        const mine = row({
            id: 41,
            child: { id: 12, firstName: 'Andrei', parent: { id: 3, firstName: 'Maria', lastName: 'P', email: 'maria@example.com', user: null } },
        });
        const theirs = row({
            id: 42,
            title: 'Labirintul',
            child: { id: 20, firstName: 'Ioana', parent: { id: 9, firstName: 'Elena', lastName: 'V', email: 'elena@example.com', user: null } },
        });
        projectRepo.find!.mockResolvedValue([mine, theirs]);

        const report = await service.send({ projectIds: [41, 42] }, 1);

        expect(report.queued).toHaveLength(2);
        expect(outbox.queue).toHaveBeenCalledTimes(2);

        const messages = outbox.queue.mock.calls.map(([message]) => message as { to: string; bodyText: string });
        const toMaria = messages.find((message) => message.to === 'maria@example.com')!;
        // The whole point, stated as an assertion: Elena's child's work is not in Maria's email, in
        // any form.
        expect(toMaria.bodyText).toContain('Robotul');
        expect(toMaria.bodyText).not.toContain('Labirintul');
        expect(toMaria.bodyText).not.toContain('Ioana');
    });

    it('sends one message to a parent with two children in the same press', async () => {
        const parent = { id: 3, firstName: 'Maria', lastName: 'P', email: 'maria@example.com', user: null };
        projectRepo.find!.mockResolvedValue([
            row({ id: 41, child: { id: 12, firstName: 'Andrei', parent } }),
            row({ id: 42, title: 'Labirintul', child: { id: 13, firstName: 'Ioana', parent } }),
        ]);

        const report = await service.send({ projectIds: [41, 42] }, 1);

        expect(outbox.queue).toHaveBeenCalledTimes(1);
        expect(report.queued[0].projectIds).toEqual([41, 42]);
        const [message] = outbox.queue.mock.calls[0] as [{ bodyText: string }];
        expect(message.bodyText).toContain('Andrei');
        expect(message.bodyText).toContain('Ioana');
    });

    it('sends nothing on a second press', async () => {
        // A nervous click on a slow connection must not double a whole group.
        projectRepo.find!.mockResolvedValue([row({ status: ProjectStatus.SENT })]);

        const report = await service.send({ projectIds: [41] }, 1);

        expect(outbox.queue).not.toHaveBeenCalled();
        expect(report.skipped).toEqual([{ projectId: 41, reason: 'already_sent' }]);
    });

    it('holds back a document whose bytes never finished arriving', async () => {
        // The large-upload road writes the row before the object exists, so this is a real state.
        // A link to nothing is worse than a delay.
        projectRepo.find!.mockResolvedValue([row({ versions: [{ files: [{ uploadedAt: null }] }] })]);

        const report = await service.send({ projectIds: [41] }, 1);

        expect(outbox.queue).not.toHaveBeenCalled();
        expect(report.skipped).toEqual([{ projectId: 41, reason: 'upload_incomplete' }]);
    });

    it('reports a parent with no address instead of skipping them quietly', async () => {
        // A parent who does not receive their child's work is not receiving their invoices either.
        // The report answers the admin at the screen; since E17/S5 the outbox also gets a row, for
        // the question asked three weeks later.
        projectRepo.find!.mockResolvedValue([
            row({ child: { id: 12, firstName: 'Andrei', parent: { id: 3, firstName: 'Maria', lastName: 'P', email: null, user: null } } }),
        ]);

        const report = await service.send({ projectIds: [41] }, 1);

        expect(outbox.queue).not.toHaveBeenCalled();
        expect(report.undeliverable).toEqual([expect.objectContaining({ parentId: 3, reason: 'no_email' })]);
        expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.objectContaining({ email: null }), expect.anything());
    });

    it('refuses to write to an address nobody has proved is theirs', async () => {
        projectRepo.find!.mockResolvedValue([
            row({
                child: {
                    id: 12,
                    firstName: 'Andrei',
                    parent: { id: 3, firstName: 'Maria', lastName: 'P', email: 'maria@example.com', user: { emailConfirmedAt: null } },
                },
            }),
        ]);

        const report = await service.send({ projectIds: [41] }, 1);

        expect(report.undeliverable[0].reason).toBe('email_unconfirmed');
    });

    it('attaches the thumbnail by key and marks the documents sent in the same transaction', async () => {
        projectRepo.find!.mockResolvedValue([row()]);

        await service.send({ projectIds: [41] }, 1);

        const [message, passedManager] = outbox.queue.mock.calls[0] as [{ attachments: { storageKey: string; contentId: string }[] }, unknown];
        expect(message.attachments).toEqual([expect.objectContaining({ storageKey: 'projects/41/thumb.jpg', contentId: 'proiect-41' })]);
        // The manager is what makes the word "transactional" true: either the parent is going to be
        // written to and the document says so, or neither happened.
        expect(passedManager).toBe(manager);
        expect(manager.update).toHaveBeenCalledWith(Project, [41], expect.objectContaining({ status: ProjectStatus.SENT, sentToEmail: 'maria@example.com' }));
    });

    it('does not reference a picture it is not attaching', async () => {
        // Four documents, three attachments: the fourth keeps its place in the list but loses its
        // `cid:`, because a reference with nothing behind it renders as a broken image.
        const parent = { id: 3, firstName: 'Maria', lastName: 'P', email: 'maria@example.com', user: null };
        projectRepo.find!.mockResolvedValue([41, 42, 43, 44].map((id) => row({ id, publicId: `uuid-${id}`, child: { id: 12, firstName: 'Andrei', parent } })));

        await service.send({ projectIds: [41, 42, 43, 44] }, 1);

        const [message] = outbox.queue.mock.calls[0] as [{ attachments: unknown[]; bodyHtml: string }];
        expect(message.attachments).toHaveLength(3);
        expect(message.bodyHtml).not.toContain('cid:proiect-44');
        // Still listed, though — nothing is hidden, only unpictured.
        expect(message.bodyHtml).toContain('uuid-44');
    });

    it('refuses the whole press when one of the documents does not exist', async () => {
        projectRepo.find!.mockResolvedValue([row()]);

        await expect(service.send({ projectIds: [41, 999] }, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
});
