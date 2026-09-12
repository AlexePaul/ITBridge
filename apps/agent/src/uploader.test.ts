import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { unusableLink, uploadFile } from './uploader';
import { readLink } from './uploader';
import { ApiClient } from './api-client';
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

    it('is unusable, not failed — so it stops coming back', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-link-'));
        const file = path.join(dir, 'link.url');
        fs.writeFileSync(file, '[InternetShortcut]\r\nURL=javascript:alert(1)\r\n');

        try {
            // The API base points at a closed port: reaching the network here would be the test
            // failing, not passing slowly.
            assert.equal(await uploadFile(new ApiClient(config), foundFile(file)), 'unusable');
            assert.equal(fs.existsSync(file), true, 'nothing is ever deleted from the share');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('becomes a refusal filed in the group folder, with a reason of its own', () => {
        const rejected = unusableLink(foundFile(path.join('C:', 'share', 'Loc', 'Grupa', 'Copil (#12)', 'link.url')));

        assert.equal(rejected.reason, 'link_without_address');
        assert.equal(rejected.groupId, 7);
        assert.equal(path.basename(rejected.unassignedDir!), '_neatribuite');
        assert.equal(rejected.sizeBytes, 42);
    });
});
