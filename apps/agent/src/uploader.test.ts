import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { refusalReason, refusedFile, uploadFile } from './uploader';
import { readLink } from './uploader';
import { ApiClient, HttpError } from './api-client';
import type { AgentConfig } from './config';
import type { FoundFile } from './scanner';

/**
 * Reading a link out of a file left in a child's folder.
 *
 * The interesting half is what is refused. The share is writable from every machine in the school,
 * the value ends up as an anchor in a parent's portal, and `javascript:` in that anchor is script
 * execution on the school's own domain triggered by a parent clicking their child's work.
 */
function withFile(contents: string, extension: string, run: (file: string) => void): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-'));
    const file = path.join(dir, `link${extension}`);
    fs.writeFileSync(file, contents);
    try {
        run(file);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

describe('readLink', () => {
    it('reads the URL line out of a Windows shortcut', () => {
        withFile('[InternetShortcut]\r\nURL=https://www.tinkercad.com/things/abc\r\n', '.url', (file) => {
            assert.equal(readLink(file), 'https://www.tinkercad.com/things/abc');
        });
    });

    it('accepts a bare address a teacher pasted into Notepad', () => {
        withFile('https://www.canva.com/design/xyz\n', '.txt', (file) => {
            assert.equal(readLink(file), 'https://www.canva.com/design/xyz');
        });
    });

    it('refuses a javascript: address', () => {
        withFile('[InternetShortcut]\r\nURL=javascript:alert(1)\r\n', '.url', (file) => {
            assert.equal(readLink(file), null);
        });
    });

    it('refuses a file: address, which would point at the office machine', () => {
        withFile('file:///C:/Users/Public/secret.txt', '.txt', (file) => {
            assert.equal(readLink(file), null);
        });
    });

    it('answers null for a text file that is simply text', () => {
        // Not an error: `.txt` is on the whitelist, so this falls through to an ordinary upload
        // rather than being refused for failing to be a link.
        withFile('Notite de la ora de azi.\n', '.txt', (file) => {
            assert.equal(readLink(file), null);
        });
    });

    it('answers null for a file that is not there', () => {
        assert.equal(readLink(path.join(os.tmpdir(), 'itbridge-agent-missing', 'nope.url')), null);
    });
});

/**
 * A shortcut the agent can read and can make nothing of.
 *
 * It used to return `failed`, which means "try again": the file stayed in the child's folder, the
 * next pass found it thirty seconds later, and the agent wrote a warning every half minute for as
 * long as it sat there — with the health field on the group screen stuck on a fault nobody could
 * clear. Nothing about reading it again tomorrow would produce a different answer, so it is a
 * refusal, and refusals leave the folder.
 */
describe('a .url with no address in it', () => {
    const config: AgentConfig = {
        apiBase: 'http://127.0.0.1:1',
        username: 'agent',
        password: 'secret',
        root: os.tmpdir(),
        name: 'test',
        scanIntervalMs: 30_000,
        mirrorIntervalMs: 900_000,
        heartbeatIntervalMs: 300_000,
        statePath: path.join(os.tmpdir(), 'itbridge-agent-unused-state.json'),
        quietPeriodMs: 20_000,
    };

    function foundFile(file: string): FoundFile {
        return {
            absolutePath: file,
            relativePath: path.join('Loc', 'Grupa', 'Copil (#12)', path.basename(file)),
            fileName: path.basename(file),
            sizeBytes: 42,
            modifiedAt: new Date(),
            childDir: path.dirname(file),
            unassignedDir: path.join(path.dirname(path.dirname(file)), '_neatribuite'),
            childId: 12,
            groupId: 7,
        };
    }

    it('is refused, not failed — so it stops coming back', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-link-'));
        const file = path.join(dir, 'link.url');
        fs.writeFileSync(file, '[InternetShortcut]\r\nURL=javascript:alert(1)\r\n');

        try {
            // The API base points at a closed port: reaching the network here would be the test
            // failing, not passing slowly.
            assert.deepEqual(await uploadFile(new ApiClient(config), foundFile(file)), {
                refused: 'link_without_address',
            });
            assert.equal(fs.existsSync(file), true, 'nothing is ever deleted from the share');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('becomes a refusal filed in the group folder, with a reason of its own', () => {
        const rejected = refusedFile(
            foundFile(path.join('C:', 'share', 'Loc', 'Grupa', 'Copil (#12)', 'link.url')),
            'link_without_address',
        );

        assert.equal(rejected.reason, 'link_without_address');
        assert.equal(rejected.groupId, 7);
        assert.equal(path.basename(rejected.unassignedDir!), '_neatribuite');
        assert.equal(rejected.sizeBytes, 42);
    });
});

/**
 * Which answers from the server are a verdict on the file. The review of 25 September 2026 found
 * the agent retrying every one of them for ever; the opposite mistake — filing a whole share under
 * `_neatribuite` because of a wrong password in `config.json` — would be worse.
 */
describe('refusalReason', () => {
    const answer = (status: number, code: string | null = null) => new HttpError(status, `answered ${status}`, code);

    it('files what the server said about the bytes', () => {
        assert.equal(refusalReason(answer(415, 'PROJECT_FILE_CONTENT_MISMATCH'), false), 'content_mismatch');
        assert.equal(refusalReason(answer(415, 'PROJECT_FILE_TYPE_NOT_ALLOWED'), false), 'extension_not_allowed');
        assert.equal(refusalReason(answer(413, 'PROJECT_FILE_TOO_LARGE'), false), 'too_large');
        assert.equal(refusalReason(answer(400, 'VALIDATION_FAILED'), true), 'link_without_address');
    });

    it('retries what is about the agent, the moment, or the server', () => {
        for (const status of [400, 401, 403, 404, 408, 409, 429, 500, 502, 503]) {
            assert.equal(refusalReason(answer(status), false), null, `status ${status} on a file`);
        }
        for (const status of [401, 403, 404, 429, 500]) {
            assert.equal(refusalReason(answer(status), true), null, `status ${status} on a link`);
        }
        assert.equal(refusalReason(new Error('fetch failed'), false), null);
    });
});
