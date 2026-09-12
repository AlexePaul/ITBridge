import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import type { AgentMirror } from '@itbridge/types';
import { scan } from './scanner';
import { childFolderName, groupPath, UNASSIGNED_DIR } from './paths';

/**
 * What the walk makes of a share, and in particular what it does with the files it refuses.
 *
 * The refusals are the half that had nothing looking at them. They are pushed from a directory
 * entry, and a directory entry carries no size and no modification time — so every refused file was
 * reported as "0 B" and was moved out of its folder however recently it had been written. An
 * accepted file that is caught halfway is re-sent whole on the next pass; a refused one is *moved*,
 * so catching it halfway files a fragment and takes the teacher's copy away from where they left it.
 */
const MIRROR: AgentMirror = {
    locations: [
        {
            id: 1,
            name: 'Drumul Taberei',
            groups: [
                { id: 7, name: 'Scratch Începători', children: [{ id: 12, firstName: 'Andrei', lastName: 'Popescu' }] },
            ],
        },
    ],
};

const LOCATION = MIRROR.locations[0]!;
const GROUP = LOCATION.groups[0]!;
const CHILD = GROUP.children[0]!;

/** A share with one group and one child, and whatever files the test puts in it. */
function withShare(run: (root: string, groupDir: string, childDir: string) => void): void {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-scan-'));
    const groupDir = groupPath(root, LOCATION.name, GROUP.name);
    const childDir = path.join(groupDir, childFolderName(CHILD));
    fs.mkdirSync(childDir, { recursive: true });
    try {
        run(root, groupDir, childDir);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

/** Written, and then aged, so the quiet period is a decision rather than a race with the clock. */
function write(file: string, contents: string, secondsAgo: number): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    const when = new Date(Date.now() - secondsAgo * 1000);
    fs.utimesSync(file, when, when);
}

const NOW = () => new Date();
const QUIET_MS = 20_000;

describe('scan', () => {
    it('reports the size of a file left in the group folder', () => {
        withShare((root, groupDir) => {
            write(path.join(groupDir, 'robot.sb3'), 'x'.repeat(4096), 60);

            const { rejected } = scan(root, MIRROR, NOW(), QUIET_MS);

            assert.equal(rejected.length, 1);
            assert.equal(rejected[0]!.reason, 'group_root');
            // Zero would read on the group screen as an empty file, which is a different problem
            // from the one the admin actually has.
            assert.equal(rejected[0]!.sizeBytes, 4096);
            assert.equal(rejected[0]!.unassignedDir, path.join(groupDir, UNASSIGNED_DIR));
        });
    });

    it('leaves a file in the group folder alone while it is still being written', () => {
        withShare((root, groupDir) => {
            write(path.join(groupDir, 'in-progress.sb3'), 'half of it', 1);

            assert.deepEqual(scan(root, MIRROR, NOW(), QUIET_MS).rejected, []);
        });
    });

    it('sizes and waits on the contents of a folder that maps to no child', () => {
        withShare((root, groupDir) => {
            const strange = path.join(groupDir, 'Poze de la serbare');
            fs.mkdirSync(strange);
            write(path.join(strange, 'settled.png'), 'y'.repeat(1024), 60);
            write(path.join(strange, 'still-copying.png'), 'y', 1);

            const { rejected } = scan(root, MIRROR, NOW(), QUIET_MS);

            assert.equal(rejected.length, 1);
            assert.equal(rejected[0]!.fileName, 'settled.png');
            assert.equal(rejected[0]!.reason, 'unknown_folder');
            assert.equal(rejected[0]!.sizeBytes, 1024);
        });
    });

    it('tells an accepted file where its group keeps refusals, for the one the uploader makes', () => {
        withShare((root, groupDir, childDir) => {
            write(path.join(childDir, 'proiect.sb3'), 'z', 60);

            const { files } = scan(root, MIRROR, NOW(), QUIET_MS);

            assert.equal(files.length, 1);
            assert.equal(files[0]!.unassignedDir, path.join(groupDir, UNASSIGNED_DIR));
            assert.equal(files[0]!.childId, 12);
        });
    });

    it('walks past its own folders', () => {
        withShare((root, groupDir, childDir) => {
            write(path.join(groupDir, UNASSIGNED_DIR, 'x.png'), 'x', 60);
            write(path.join(childDir, '_urcate', '2026-09-01', 'sent.sb3'), 'x', 60);

            const result = scan(root, MIRROR, NOW(), QUIET_MS);

            assert.deepEqual(result.files, []);
            assert.deepEqual(result.rejected, []);
        });
    });
});
