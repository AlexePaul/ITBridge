import { randomBytes } from 'crypto';
import { PassThrough, Readable, Writable } from 'stream';
import { ProjectArchiveService } from './project-archive.service';
import { ObjectNotFoundError } from 'src/modules/storage/s3.service';
import { Role } from 'src/enum/role.enum';

/**
 * "Descarcă tot" — one child's work as a zip (E14 S5).
 *
 * The review of 25 September 2026 found that the class comment's promise, "holds one file at a
 * time", was true of memory and false of the bucket: every object was opened before the parent's
 * browser read a byte, each holding one of the SDK's fifty pooled sockets, and an abandoned download
 * held them all for good.
 */
describe('ProjectArchiveService', () => {
    const projectsOf = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
            id: 100 + i,
            title: `Proiect ${i}`,
            capturedOn: '2026-09-01',
            versions: [{ id: 200 + i, versionNumber: 1, files: [{ id: 300 + i, originalName: `f${i}.png`, uploadedAt: new Date() }] }],
            links: i === 0 ? [{ label: 'Scratch', url: 'https://scratch.mit.edu/projects/1' }] : [],
        }));

    const build = (projects: unknown[], download: (key: string) => Promise<Readable>) => {
        const qb: Record<string, unknown> = {};
        for (const method of ['leftJoinAndSelect', 'andWhere', 'orderBy']) qb[method] = () => qb;
        qb.getMany = () => Promise.resolve(projects);
        const projectRepository = { createQueryBuilder: () => qb };
        const childRepository = { findOne: () => Promise.resolve({ id: 7, firstName: 'Ștefan', parent: { user: { id: 1 } } }) };
        return new ProjectArchiveService(projectRepository as never, childRepository as never, { downloadStream: download } as never);
    };

    /** An object the bucket hands back, and a count of how many are open at once. */
    const bucket = () => {
        const state = { opened: 0, open: 0, mostOpenAtOnce: 0, streams: [] as PassThrough[] };
        const download = () => {
            state.opened += 1;
            state.open += 1;
            state.mostOpenAtOnce = Math.max(state.mostOpenAtOnce, state.open);
            const stream = new PassThrough();
            stream.on('close', () => (state.open -= 1));
            state.streams.push(stream);
            // Random bytes, because what the archive carries is JPEG, video and `.sb3` — already
            // compressed. Bytes that deflate to nothing would never fill a buffer, and a test on them
            // could not tell "waits for the reader" from "opens everything".
            stream.end(randomBytes(512 * 1024));
            return Promise.resolve(stream as Readable);
        };
        return { state, download };
    };

    /** Reads the whole archive, the way the response would. */
    const drain = (archive: Readable) =>
        new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            archive.pipe(
                new Writable({
                    write(chunk: Buffer, _encoding, done) {
                        chunks.push(chunk);
                        done();
                    },
                }).on('finish', () => resolve(Buffer.concat(chunks))),
            );
            archive.on('error', reject);
        });

    const tick = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

    it('opens one object and waits, while nobody is reading the download', async () => {
        const { state, download } = bucket();
        const service = build(projectsOf(60), download);

        const { archive } = await service.forChild(7, Role.PARENT, 1);
        await tick();

        // Sixty before: every object opened up front, each holding a pooled socket. Now one at a
        // time, and only as many in all as the archive's own buffer takes before it waits for the
        // reader — a bound set by bytes, not by how much work the child has.
        expect(state.mostOpenAtOnce).toBe(1);
        expect(state.opened).toBeLessThan(15);
        archive.destroy();
    });

    it('still delivers every file, one open at a time, once somebody reads', async () => {
        const { state, download } = bucket();
        const service = build(projectsOf(12), download);

        const { archive } = await service.forChild(7, Role.PARENT, 1);
        const zip = await drain(archive);

        expect(state.opened).toBe(12);
        expect(state.mostOpenAtOnce).toBe(1);
        expect(zip.subarray(0, 2).toString()).toBe('PK');
        // The shortcut rides along, after its project's files.
        expect(zip.includes(Buffer.from('Scratch.url'))).toBe(true);
    });

    it('leaves out an object the bucket no longer has, and keeps the rest of the keepsake', async () => {
        const { state, download } = bucket();
        const service = build(projectsOf(3), (key) => (key.endsWith('/101/201/301') ? Promise.reject(new ObjectNotFoundError(key)) : download()));

        const { archive } = await service.forChild(7, Role.PARENT, 1);
        const zip = await drain(archive);

        expect(state.opened).toBe(2);
        expect(zip.includes(Buffer.from('f0.png'))).toBe(true);
        expect(zip.includes(Buffer.from('f1.png'))).toBe(false);
        expect(zip.includes(Buffer.from('f2.png'))).toBe(true);
    });

    it('lets go of the object it holds and opens no more when the download is abandoned', async () => {
        const { state, download } = bucket();
        const service = build(projectsOf(20), download);

        const { archive } = await service.forChild(7, Role.PARENT, 1);
        await tick();
        const openedBefore = state.opened;
        archive.destroy();
        await tick();

        expect(state.opened).toBe(openedBefore);
        expect(state.open).toBe(0);
    });

    it('names the file after the child, in any language — the controller writes it with `attachmentDisposition`', async () => {
        const { download } = bucket();
        const service = build([], download);

        const { archive, filename } = await service.forChild(7, Role.PARENT, 1);
        archive.destroy();

        expect(filename).toBe('proiecte-ștefan.zip');
    });
});
