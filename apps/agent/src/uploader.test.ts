import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { readLink } from './uploader';

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
