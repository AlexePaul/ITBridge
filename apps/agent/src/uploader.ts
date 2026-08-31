import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { ApiClient } from './api-client';
import { log } from './log';
import { LINK_EXTENSIONS } from './scanner';
import type { FoundFile, RejectedFile } from './scanner';
import { dayOf } from './scanner';
import { uploadedPath } from './paths';

/**
 * Sending one file, and putting it somewhere a teacher can see what happened. E14/S2.
 *
 * **Uploaded files are moved, not deleted.** They go to `_urcate\<data>` inside the child's own
 * folder, so a teacher opening Explorer can see at a glance what has gone and what has not — which
 * is the only feedback the flow gives anybody standing in the lab, since nothing about this asks
 * them to open a screen.
 *
 * **Rejected files are moved too**, to the group's `_neatribuite`, and reported to the API so they
 * appear on the group screen with the reason. Nothing is ever deleted from the share.
 */

export interface UploadOutcome {
    uploaded: number;
    linked: number;
    failed: number;
}

export async function uploadFile(api: ApiClient, file: FoundFile): Promise<'uploaded' | 'linked' | 'failed'> {
    const extension = path.extname(file.fileName).toLowerCase();
    const capturedOn = dayOf(file.modifiedAt);

    try {
        if (LINK_EXTENSIONS.has(extension)) {
            const url = readLink(file.absolutePath);
            if (url) {
                await api.createLinkProject({
                    childId: file.childId,
                    capturedOn,
                    title: titleOf(file.fileName),
                    label: titleOf(file.fileName),
                    url,
                });
                move(file.absolutePath, uploadedPath(file.childDir, capturedOn), file.fileName);
                return 'linked';
            }
            // A `.txt` with no URL in it is just a text file, and the whitelist accepts those. It
            // falls through to the ordinary upload rather than being refused for not being a link.
            if (extension === '.url') {
                log.warn(`A .url file carried no address: ${file.relativePath}`);
                return 'failed';
            }
        }

        const bytes = fs.readFileSync(file.absolutePath);
        await api.ingest({
            childId: file.childId,
            capturedOn,
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            fileName: file.fileName,
            bytes,
        });

        move(file.absolutePath, uploadedPath(file.childDir, capturedOn), file.fileName);
        return 'uploaded';
    } catch (error) {
        // The file stays exactly where it is. That is the whole failure mode of this design and it
        // is a mild one: the share is the queue, so a network outage delays uploads rather than
        // losing them, and the next pass picks the file up again.
        log.warn(`Could not upload ${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
        return 'failed';
    }
}

/**
 * Files the scanner refused: reported, then moved out of the way.
 *
 * The report goes first. If the move fails — a file locked open in Scratch is the usual reason — the
 * row is already on the group screen, and the next pass will try the move again; the server
 * deduplicates the report on the path, so nothing doubles up.
 */
export async function handleRejected(api: ApiClient, rejected: RejectedFile): Promise<void> {
    try {
        await api.reportUnassigned({
            groupId: rejected.groupId,
            relativePath: rejected.relativePath,
            fileName: rejected.fileName,
            sizeBytes: rejected.sizeBytes,
            reason: rejected.reason,
        });
    } catch (error) {
        log.warn(
            `Could not report ${rejected.relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
    }

    if (!rejected.unassignedDir) return;
    try {
        move(rejected.absolutePath, rejected.unassignedDir, rejected.fileName);
    } catch (error) {
        log.warn(
            `Reported ${rejected.relativePath} but could not move it: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Moves a file, never overwriting.
 *
 * A collision is real: `captura.png` twice in one day is what a child produces when they take two
 * screenshots. The second gets ` (2)` rather than replacing the first, because the copy in `_urcate`
 * is a teacher's only local record of what was sent.
 *
 * `renameSync` first, and a copy-then-delete only if it fails: a rename within one share is atomic
 * and instant, but `_urcate` could be on a different volume from the child's folder if somebody has
 * mounted things creatively, and rename cannot cross volumes.
 */
function move(from: string, toDir: string, fileName: string): void {
    fs.mkdirSync(toDir, { recursive: true });
    const target = uniqueName(toDir, fileName);

    try {
        fs.renameSync(from, target);
    } catch {
        fs.copyFileSync(from, target);
        fs.unlinkSync(from);
    }
}

function uniqueName(dir: string, fileName: string): string {
    const extension = path.extname(fileName);
    const base = path.basename(fileName, extension);

    let candidate = path.join(dir, fileName);
    let counter = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(dir, `${base} (${counter})${extension}`);
        counter++;
    }
    return candidate;
}

/**
 * The address out of a link file.
 *
 * Windows writes `.url` as an INI with a `URL=` line; a teacher who pasted into Notepad wrote the
 * address and nothing else. Only `http:` and `https:` are accepted — the value ends up rendered as
 * an anchor in a parent's portal, so a `javascript:` address on a share that any machine in the
 * school can write to would be script execution on the school's own domain. The server refuses it
 * too; this is the same rule, applied where the file is read.
 */
export function readLink(file: string): string | null {
    let contents: string;
    try {
        contents = fs.readFileSync(file, 'utf8');
    } catch {
        return null;
    }

    const fromIni = /^\s*URL\s*=\s*(\S+)\s*$/im.exec(contents);
    const candidate = (fromIni ? fromIni[1] : contents.trim().split(/\s+/)[0]) ?? '';

    return /^https?:\/\/\S+$/i.test(candidate) ? candidate : null;
}

/** `robot-final.sb3` becomes "robot-final", which is a better title than an empty string. */
function titleOf(fileName: string): string {
    const extension = path.extname(fileName);
    return path.basename(fileName, extension).trim().slice(0, 200) || 'Proiect';
}
