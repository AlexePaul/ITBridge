import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { after, afterEach, describe, it } from 'node:test';
import type { AgentMirror } from '@itbridge/types';
import { Agent } from './agent';
// The module object itself, not the namespace `import * as` wraps it in: the uploader reads
// `renameSync` from it at call time, so this is where a lock has to be put.
import nodeFs = require('fs');
import { ApiClient } from './api-client';
import type { AgentConfig } from './config';
import { childFolderName, groupPath, UNASSIGNED_DIR, UPLOADED_DIR } from './paths';

/**
 * The agent end to end, against a server that answers like the API, over a real share on disk.
 *
 * Each case is one found by the review of 25 September 2026, run the way it happened: a file held
 * open in Word, a file the server refuses, a share nobody can reach, a group renamed or sharing its
 * name with another, and a tree made by the build before group folders carried an id.
 */

interface Server {
    config: AgentConfig;
    calls: {
        ingest: number;
        links: number;
        unassigned: { reason: string; fileName: string }[];
        heartbeats: { lastError: string | null }[];
    };
    /** What `/agent/mirror` answers; change it between passes to rename a group. */
    mirror: AgentMirror | { fail: true };
    /** What `/projects/ingest` answers. */
    ingest: { status: number; body: unknown };
    /** What `POST /projects` (a link) answers. */
    link: { status: number; body: unknown };
}

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(() => {
    // Whatever a test patched on `fs` goes back, so a failure in one cannot lock files in the next.
    unlock();
});

after(() => {
    for (const server of servers) server.close();
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

const realRename = nodeFs.renameSync;
const realUnlink = nodeFs.unlinkSync;

function unlock(): void {
    nodeFs.renameSync = realRename;
    nodeFs.unlinkSync = realUnlink;
}

/** Windows semantics for a document open in Word or Acrobat: readable, so copyable, but not renamed or deleted. */
function lock(files: Set<string>): void {
    const busy = (file: string) =>
        Object.assign(new Error(`EBUSY: resource busy or locked, '${file}'`), { code: 'EBUSY' });
    nodeFs.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
        if (files.has(String(from))) throw busy(String(from));
        return realRename(from, to);
    };
    nodeFs.unlinkSync = (file: fs.PathLike) => {
        if (files.has(String(file))) throw busy(String(file));
        return realUnlink(file);
    };
}

const MIRROR: AgentMirror = {
    locations: [
        {
            id: 1,
            name: 'Străulești',
            groups: [{ id: 3, name: 'Scratch', children: [{ id: 12, firstName: 'Andrei', lastName: 'Pop' }] }],
        },
    ],
};

async function serve(
    overrides: Partial<Pick<Server, 'mirror' | 'ingest' | 'link'>> = {},
    root?: string,
): Promise<Server> {
    const state: Server = {
        config: undefined as unknown as AgentConfig,
        calls: { ingest: 0, links: 0, unassigned: [], heartbeats: [] },
        mirror: MIRROR,
        ingest: { status: 201, body: { id: 41 } },
        link: { status: 201, body: { id: 42 } },
        ...overrides,
    };

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const json = (status: number, value: unknown) => {
                res.writeHead(status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(value));
            };
            if (req.url === '/auth/login') return json(201, { accessToken: 'a', refreshToken: 'r' });
            if (req.url === '/agent/mirror')
                return 'fail' in state.mirror ? json(500, { code: 'INTERNAL' }) : json(200, state.mirror);
            if (req.url === '/projects/ingest') {
                state.calls.ingest++;
                return json(state.ingest.status, state.ingest.body);
            }
            if (req.url === '/projects') {
                state.calls.links++;
                return json(state.link.status, state.link.body);
            }
            if (req.url === '/agent/unassigned') {
                const report = JSON.parse(body) as { reason: string; fileName: string };
                state.calls.unassigned.push({ fileName: report.fileName, reason: report.reason });
                return json(201, {});
            }
            if (req.url === '/agent/heartbeat') {
                state.calls.heartbeats.push(JSON.parse(body) as { lastError: string | null });
                return json(201, {});
            }
            json(404, {});
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);

    const share = root ?? fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-share-'));
    roots.push(share);
    state.config = {
        apiBase: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        username: 'agent',
        password: 'secret',
        root: share,
        name: 'birou',
        scanIntervalMs: 1e9,
        mirrorIntervalMs: 1e9,
        heartbeatIntervalMs: 1e9,
        quietPeriodMs: 0,
        statePath: path.join(os.tmpdir(), `itbridge-agent-state-${process.pid}-${servers.length}.json`),
    };
    return state;
}

/** Saved a minute ago, so the quiet period is not what decides. */
function save(file: string, contents: Buffer | string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    const when = new Date(Date.now() - 60_000);
    fs.utimesSync(file, when, when);
}

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 2)]);

function childDirOf(root: string, mirror: AgentMirror, groupIndex = 0, childIndex = 0): string {
    const location = mirror.locations[0]!;
    const group = location.groups[groupIndex]!;
    return path.join(groupPath(root, location.name, group), childFolderName(group.children[childIndex]!));
}

function listing(dir: string): string[] {
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

describe('a file held open by another program', () => {
    it('stays where it is — no pile of copies — and is not sent twice', async () => {
        const server = await serve();
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const childDir = childDirOf(server.config.root, MIRROR);
        const groupDir = path.dirname(childDir);
        const pdf = path.join(childDir, 'proiect.pdf');
        const docx = path.join(childDir, 'tema.docx');
        save(pdf, PDF);
        save(docx, Buffer.alloc(2048, 1));
        lock(new Set([pdf, docx]));

        // Three minutes of a lesson, at thirty seconds a pass.
        for (let pass = 0; pass < 6; pass++) await agent.pass();

        // Before: `tema (2)…(6).docx` in `_neatribuite`, `proiect (2)…(6).pdf` in `_urcate`, and
        // the PDF sent to the server on every pass.
        assert.deepEqual(listing(path.join(groupDir, UNASSIGNED_DIR)), []);
        assert.deepEqual(
            listing(path.join(childDir, UPLOADED_DIR)).flatMap((day) =>
                listing(path.join(childDir, UPLOADED_DIR, day)),
            ),
            [],
        );
        assert.equal(server.calls.ingest, 1);
        assert.deepEqual(
            listing(childDir).filter((name) => !name.startsWith('_')),
            ['proiect.pdf', 'tema.docx'],
        );

        // Word and Acrobat are closed; the next pass finishes both moves, and still sends nothing twice.
        unlock();
        await agent.pass();

        assert.deepEqual(listing(path.join(groupDir, UNASSIGNED_DIR)), ['tema.docx']);
        const [day] = listing(path.join(childDir, UPLOADED_DIR));
        assert.deepEqual(listing(path.join(childDir, UPLOADED_DIR, day!)), ['proiect.pdf']);
        assert.equal(server.calls.ingest, 1);
    });
});

describe('a file the server refuses', () => {
    it('is filed with the reason, once, instead of being sent again on every pass', async () => {
        const server = await serve({
            ingest: {
                status: 415,
                body: {
                    statusCode: 415,
                    code: 'PROJECT_FILE_CONTENT_MISMATCH',
                    message: 'not what its extension says',
                },
            },
        });
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const childDir = childDirOf(server.config.root, MIRROR);
        // A JPEG saved as `.png`: the extension passes here, the bytes do not pass there.
        save(path.join(childDir, 'desen.png'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));

        for (let pass = 0; pass < 5; pass++) await agent.pass();

        assert.equal(server.calls.ingest, 1);
        assert.deepEqual(server.calls.unassigned, [{ fileName: 'desen.png', reason: 'content_mismatch' }]);
        assert.deepEqual(listing(path.join(path.dirname(childDir), UNASSIGNED_DIR)), ['desen.png']);
    });

    it('files a link the server will not take as a link without a usable address', async () => {
        const server = await serve({
            link: {
                status: 400,
                body: { statusCode: 400, code: 'VALIDATION_FAILED', message: 'url must be a URL address' },
            },
        });
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const childDir = childDirOf(server.config.root, MIRROR);
        // `readLink` takes it; the server's `IsUrl` does not, and will not tomorrow either.
        save(path.join(childDir, 'site.url'), '[InternetShortcut]\r\nURL=http://localhost:5500/index.html\r\n');

        for (let pass = 0; pass < 3; pass++) await agent.pass();

        assert.equal(server.calls.links, 1);
        assert.deepEqual(server.calls.unassigned, [{ fileName: 'site.url', reason: 'link_without_address' }]);
    });

    it('keeps trying when the answer is about the agent, not the file', async () => {
        // A 403 is a wrong account in `config.json`: filing every file on the share under
        // `_neatribuite` because of it would be the worst possible reading.
        const server = await serve({
            ingest: { status: 403, body: { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' } },
        });
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const childDir = childDirOf(server.config.root, MIRROR);
        save(path.join(childDir, 'proiect.pdf'), PDF);

        await agent.pass();
        await agent.pass();

        assert.equal(server.calls.ingest, 2);
        assert.deepEqual(server.calls.unassigned, []);
        assert.deepEqual(
            listing(childDir).filter((name) => !name.startsWith('_')),
            ['proiect.pdf'],
        );
    });
});

describe('the heartbeat', () => {
    it('says the share cannot be reached, instead of beating healthy while nothing uploads', async () => {
        // A path under a file: nothing can create or read it, like a share whose server is off.
        const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-blocked-')), 'not-a-folder');
        fs.writeFileSync(blocker, 'x');
        roots.push(path.dirname(blocker));
        const server = await serve({}, path.join(blocker, 'Proiecte'));

        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const beat = server.calls.heartbeats.at(-1)!;
        assert.match(beat.lastError ?? '', /watched folder cannot be read/);
    });

    it("keeps the mirror's error after a pass that found nothing wrong", async () => {
        const server = await serve();
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();
        assert.equal(agent.lastError(), null);

        server.mirror = { fail: true };
        await agent['refreshMirror']();
        await agent.pass();

        // Before, the clean pass wrote `null` over it thirty seconds later.
        assert.match(agent.lastError() ?? '', /agent\/mirror answered 500/);
    });
});

describe('group folders', () => {
    it('follow a group renamed on the server, with the files teachers saved in them', async () => {
        const server = await serve();
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();
        const before = childDirOf(server.config.root, MIRROR);
        save(path.join(before, 'proiect.pdf'), PDF);
        lock(new Set([path.join(before, 'proiect.pdf')]));
        await agent.pass(); // sent, but held open: it stays where it was saved
        unlock();

        const renamed: AgentMirror = {
            locations: [
                { ...MIRROR.locations[0]!, groups: [{ ...MIRROR.locations[0]!.groups[0]!, name: 'Scratch Avansați' }] },
            ],
        };
        server.mirror = renamed;
        await agent['refreshMirror']();
        save(
            path.join(childDirOf(server.config.root, renamed), 'tema noua.pdf'),
            Buffer.concat([PDF, Buffer.from('2')]),
        );
        await agent.pass();

        // Before: a new empty tree under the new name, and the old one walked by nobody.
        assert.equal(fs.existsSync(path.dirname(before)), false);
        const after = childDirOf(server.config.root, renamed);
        const [day] = listing(path.join(after, UPLOADED_DIR));
        assert.deepEqual(listing(path.join(after, UPLOADED_DIR, day!)), ['proiect.pdf', 'tema noua.pdf']);
        assert.equal(server.calls.ingest, 2);
        assert.deepEqual(server.calls.unassigned, []);
    });

    it('are one per group when two groups at one address share a name', async () => {
        const twins: AgentMirror = {
            locations: [
                {
                    id: 1,
                    name: 'Străulești',
                    groups: [
                        { id: 3, name: 'Scratch', children: [{ id: 12, firstName: 'Andrei', lastName: 'Pop' }] },
                        { id: 4, name: 'Scratch', children: [{ id: 13, firstName: 'Ioana', lastName: 'Radu' }] },
                    ],
                },
            ],
        };
        const server = await serve({ mirror: twins });
        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        save(path.join(childDirOf(server.config.root, twins, 0), 'a.pdf'), PDF);
        save(path.join(childDirOf(server.config.root, twins, 1), 'b.pdf'), Buffer.concat([PDF, Buffer.from('b')]));
        await agent.pass();

        // Before: one shared folder, and each upload reported against the other group as unknown.
        assert.equal(server.calls.ingest, 2);
        assert.deepEqual(server.calls.unassigned, []);
    });

    it('made by the build before ids are moved to their new name, work and all', async () => {
        const server = await serve();
        const legacyChild = path.join(
            server.config.root,
            'Străulești',
            'Scratch',
            childFolderName({ id: 12, firstName: 'Andrei', lastName: 'Pop' }),
        );
        save(path.join(legacyChild, 'vechi.pdf'), PDF);

        const agent = new Agent(server.config, new ApiClient(server.config));
        await agent.start();
        agent.stop();

        const childDir = childDirOf(server.config.root, MIRROR);
        const [day] = listing(path.join(childDir, UPLOADED_DIR));
        assert.deepEqual(listing(path.join(childDir, UPLOADED_DIR, day!)), ['vechi.pdf']);
        assert.equal(fs.existsSync(path.join(server.config.root, 'Străulești', 'Scratch')), false);
        assert.equal(server.calls.ingest, 1);
    });
});
