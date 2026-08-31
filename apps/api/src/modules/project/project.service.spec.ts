import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Project } from 'src/entities/project.entity';
import { ProjectFile } from 'src/entities/project-file.entity';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { Role } from 'src/enum/role.enum';
import { S3Service } from 'src/modules/storage/s3.service';
import {
    createMockEntityManager,
    createMockInsertBuilder,
    createMockQueryBuilder,
    createMockRepository,
    isScopedToUser,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { ProjectService } from './project.service';
import { ThumbnailService } from './thumbnail.service';
import { hashContent, ingestionKey } from './project.keys';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const ZIP = Buffer.from('504b0304140000000800', 'hex');

describe('ProjectService', () => {
    let service: ProjectService;
    let projectRepo: MockRepository;
    let fileRepo: MockRepository;
    let childRepo: MockRepository;
    let sessionRepo: MockRepository;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock; presignedDownloadUrl: jest.Mock; deleteObject: jest.Mock; headObject: jest.Mock };
    let thumbnails: { fromImage: jest.Mock };
    let manager: MockEntityManager;

    const child = { id: 12, firstName: 'Andrei', lastName: 'Popescu', parent: { id: 3, user: { id: 99 } }, group: { id: 5 } };

    /**
     * The transaction's `createQueryBuilder`, which the ingestion path uses for two different things.
     *
     * Called with an entity and an alias it is the "what is the next version number" select; called
     * with nothing it is the `.insert().values().orIgnore().returning('id')` chain. The double has to
     * tell them apart, because handing back the wrong shape fails inside the service and reads as a
     * bug there.
     *
     * `undefined` stands for the row the unique index refused — which is how a concurrent duplicate
     * announces itself, since `ON CONFLICT DO NOTHING` returns nothing rather than raising.
     */
    function withFileInsert(id: number | undefined, highestVersion: number | null = null) {
        const insert = createMockInsertBuilder(id === undefined ? [] : [{ id }]);
        const select = { select: jest.fn(), andWhere: jest.fn(), getRawOne: jest.fn().mockResolvedValue({ max: highestVersion }) };
        select.select.mockReturnValue(select);
        select.andWhere.mockReturnValue(select);

        manager.createQueryBuilder = jest.fn((entity?: unknown) => (entity === undefined ? insert : select));
    }

    beforeEach(async () => {
        projectRepo = createMockRepository();
        fileRepo = createMockRepository();
        childRepo = createMockRepository();
        sessionRepo = createMockRepository();
        s3 = {
            putObject: jest.fn(),
            downloadFile: jest.fn(),
            presignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
            deleteObject: jest.fn(),
            headObject: jest.fn(),
        };
        thumbnails = { fromImage: jest.fn().mockResolvedValue(null) };
        manager = createMockEntityManager();

        // The real `save` returns the persisted row, ids and all, and the ingestion path depends on
        // that: the object key embeds the project, version and file ids, so each row has to exist
        // before its own upload.
        let nextId = 1;
        manager.save.mockImplementation((_entity: unknown, data?: unknown) => {
            const row = (data ?? _entity) as Record<string, unknown>;
            return Promise.resolve({ id: row.id ?? nextId++, ...row });
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectService,
                provideMockRepository(Project, projectRepo),
                provideMockRepository(ProjectFile, fileRepo),
                provideMockRepository(Child, childRepo),
                provideMockRepository(ClassSession, sessionRepo),
                { provide: S3Service, useValue: s3 },
                { provide: ThumbnailService, useValue: thumbnails },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(ProjectService);

        childRepo.findOne!.mockResolvedValue(child);
        sessionRepo.findOne!.mockResolvedValue(null);
        fileRepo.findOne!.mockResolvedValue(null);
        projectRepo.findOne!.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve({ id: where.id ?? 1, publicId: 'uuid', child, versions: [], links: [], status: ProjectStatus.NEW }),
        );
        manager.getRepository.mockReturnValue(createMockRepository());
    });

    describe('ingestFile', () => {
        const upload = { originalname: 'captura.png', buffer: PNG, size: PNG.length };

        it('refuses a type the school does not accept, before anything is stored', async () => {
            await expect(service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, { ...upload, originalname: 'setup.exe' }, 1)).rejects.toBeInstanceOf(
                UnsupportedMediaTypeException,
            );
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('refuses a file whose bytes disagree with its extension', async () => {
            await expect(service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, { ...upload, buffer: ZIP }, 1)).rejects.toBeInstanceOf(
                UnsupportedMediaTypeException,
            );
        });

        it('refuses a hash the client got wrong rather than trusting it', async () => {
            // The hash is what makes an upload idempotent. Taking the client's word for it would let
            // a mistaken agent collide with — or silently swallow — somebody else's upload.
            await expect(service.ingestFile({ childId: 12, capturedOn: '2026-09-14', contentHash: 'a'.repeat(64) }, upload, 1)).rejects.toThrow(
                /does not match the hash/,
            );
        });

        it('answers with the existing project when the same content arrives again', async () => {
            // The normal way an agent behaves after a dropped connection, not an edge case. Without
            // this a retry means a second project and, at send time, the same thumbnail twice in a
            // parent's email.
            const key = ingestionKey(12, hashContent(PNG));
            fileRepo.findOne!.mockResolvedValue({ id: 7, ingestionKey: key, version: { id: 2, project: { id: 41 } } });

            const project = await service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, upload, 1);

            expect(project.id).toBe(41);
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('refuses a child who does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);

            await expect(service.ingestFile({ childId: 999, capturedOn: '2026-09-14' }, upload, 1)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('writes the rows, uploads under the derived key, and thumbnails afterwards', async () => {
            withFileInsert(92);
            thumbnails.fromImage.mockResolvedValue(Buffer.from('jpeg'));

            await service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, upload, 7);

            // The key embeds the ids, so each row has to exist before its own upload — the same
            // ordering the invoice PDF learned, and the one E04 recorded failing the other way round.
            expect(s3.putObject).toHaveBeenCalledWith(expect.objectContaining({ key: 'projects/1/2/92', contentType: 'image/png' }));
            expect(projectRepo.update).toHaveBeenCalledWith(1, { hasThumbnail: true });
        });

        it('still stores the file when a thumbnail cannot be made', async () => {
            // Thumbnailing runs after the commit precisely so it can fail without taking the upload
            // with it. A project without a picture is far better than a project that did not upload.
            withFileInsert(92);
            thumbnails.fromImage.mockResolvedValue(null);

            await service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, upload, 7);

            expect(s3.putObject).toHaveBeenCalledTimes(1);
            expect(projectRepo.update).not.toHaveBeenCalled();
        });

        it('hands back the winner when another pass inserted the same content first', async () => {
            // Two passes a millisecond apart. The unique index refuses the second insert rather than
            // raising on it, because a failed statement inside a transaction aborts the whole
            // transaction — so the loser looks the winner up instead of failing the request.
            withFileInsert(undefined);
            fileRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValue({ id: 7, version: { id: 2, project: { id: 41 } } });

            const project = await service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, upload, 7);

            expect(project.id).toBe(41);
        });

        it('sends video down the other road instead of buffering it here', async () => {
            // Not a limit, an architectural decision: the API shares an instance with Postgres, so a
            // buffered 200MB upload is not slow, it is fatal.
            const mp4 = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypisom'), Buffer.alloc(8)]);

            await expect(
                service.ingestFile({ childId: 12, capturedOn: '2026-09-14' }, { originalname: 'clip.mp4', buffer: mp4, size: mp4.length }, 1),
            ).rejects.toThrow(/straight to storage/);
        });
    });

    describe('registerLargeFile', () => {
        it('refuses anything that is not video', async () => {
            await expect(
                service.registerLargeFile(
                    { childId: 12, capturedOn: '2026-09-14', originalName: 'captura.png', sizeBytes: 1000, contentHash: 'a'.repeat(64) },
                    1,
                ),
            ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
        });

        it('refuses a size past the video ceiling', async () => {
            await expect(
                service.registerLargeFile(
                    { childId: 12, capturedOn: '2026-09-14', originalName: 'clip.mp4', sizeBytes: 500 * 1024 * 1024, contentHash: 'a'.repeat(64) },
                    1,
                ),
            ).rejects.toBeInstanceOf(PayloadTooLargeException);
        });
    });

    describe('findProjects', () => {
        it('narrows to the caller for a parent, and to what has been sent', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            projectRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findProjects({}, Role.PARENT, 99);

            expect(isScopedToUser(qb, 99)).toBe(true);
            // A document in `nou` is still in review. The portal must not be the back door around
            // the screen where somebody looks at it first.
            expect(qb.andWhereCalls.some(([condition, params]) => condition.includes('project.status') && params?.sent === ProjectStatus.SENT)).toBe(true);
        });

        it('leaves an admin the whole school', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            projectRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findProjects({}, Role.ADMIN, 1);

            expect(isScopedToUser(qb, 1)).toBe(false);
        });

        it('composes filters with andWhere, never where', async () => {
            // `qb.where()` replaces the entire clause, so one placed after the user restriction
            // erases it without a sign. That is exactly how `PaymentService.findOne` once handed
            // every family's payments to anyone who asked.
            const qb = createMockQueryBuilder({ many: [] });
            projectRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findProjects({ groupId: 5, status: ProjectStatus.NEW }, Role.PARENT, 99);

            expect(qb.where).not.toHaveBeenCalled();
        });
    });

    describe('findByPublicId', () => {
        it('answers 403 for another family, not 404', async () => {
            // The resource exists, and a silent refusal is harder for a parent to report than an
            // explicit one. The opposite of the rule the list follows, and deliberately so.
            projectRepo.findOne!.mockResolvedValue({ id: 41, child: { ...child, parent: { id: 3, user: { id: 77 } } }, status: ProjectStatus.SENT });

            await expect(service.findByPublicId('uuid', Role.PARENT, 99)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('does not fall over on a child whose parent has no account', async () => {
            // An admin can create a profile without a user. Without the optional chain this threw a
            // TypeError instead of answering 403 — the same bug the child module already carries a
            // note about.
            projectRepo.findOne!.mockResolvedValue({ id: 41, child: { ...child, parent: { id: 3, user: null } }, status: ProjectStatus.SENT });

            await expect(service.findByPublicId('uuid', Role.PARENT, 99)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('hides a document still in review from the parent it will eventually go to', async () => {
            projectRepo.findOne!.mockResolvedValue({ id: 41, child, status: ProjectStatus.NEW });

            await expect(service.findByPublicId('uuid', Role.PARENT, 99)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('lets an admin see it whatever its state', async () => {
            projectRepo.findOne!.mockResolvedValue({ id: 41, child, status: ProjectStatus.NEW });

            await expect(service.findByPublicId('uuid', Role.ADMIN, 1)).resolves.toMatchObject({ id: 41 });
        });
    });

    describe('reassign', () => {
        it('records where the document came from, and moves nothing in storage', async () => {
            const project = { id: 41, child: { id: 12 }, capturedOn: new Date('2026-09-14T00:00:00'), reassignedFromChildId: null };
            projectRepo.findOne!.mockResolvedValueOnce(project);
            childRepo.findOne!.mockResolvedValue({ ...child, id: 13, group: { id: 5 } });
            projectRepo.save!.mockImplementation((row: unknown) => Promise.resolve(row));

            await service.reassign(41, { childId: 13 }, 1);

            const saved = projectRepo.save!.mock.calls[0][0] as Record<string, unknown>;
            // Losing "moved away from whom" would make a misdelivery untraceable, and a document
            // sent to the wrong family is a disclosure of personal data, not an embarrassment.
            expect(saved.reassignedFromChildId).toBe(12);
            expect(saved.reassignedAt).toBeInstanceOf(Date);
            // The key holds project identifiers, not the child's, so nothing has to be re-uploaded.
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('refuses to move a document to the child it already belongs to', async () => {
            projectRepo.findOne!.mockResolvedValueOnce({ id: 41, child: { id: 12 }, capturedOn: new Date() });
            childRepo.findOne!.mockResolvedValue({ ...child, id: 12 });

            await expect(service.reassign(41, { childId: 12 }, 1)).rejects.toThrow(/already assigned/);
        });
    });

    describe('deleteProject', () => {
        it('removes the rows first and the objects after', async () => {
            projectRepo.findOne!.mockResolvedValueOnce({
                id: 41,
                hasThumbnail: true,
                versions: [{ id: 7, files: [{ id: 92 }] }],
            });

            await service.deleteProject(41);

            expect(projectRepo.delete).toHaveBeenCalledWith(41);
            expect(s3.deleteObject).toHaveBeenCalledWith('projects/41/7/92');
            expect(s3.deleteObject).toHaveBeenCalledWith('projects/41/thumb.jpg');
        });

        it('still reports success when an object could not be removed', async () => {
            // The row is already gone, so nothing a caller can do differs. A 500 here would say the
            // deletion failed when it succeeded; an orphaned object is cheap and invisible.
            projectRepo.findOne!.mockResolvedValueOnce({ id: 41, hasThumbnail: false, versions: [{ id: 7, files: [{ id: 92 }] }] });
            s3.deleteObject.mockRejectedValue(new Error('storage down'));

            await expect(service.deleteProject(41)).resolves.toBeUndefined();
        });
    });
});
