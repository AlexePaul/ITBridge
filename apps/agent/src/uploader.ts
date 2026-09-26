import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { UnassignedFileReason } from '@itbridge/types';
import { ApiClient, HttpError } from './api-client';
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

/**
 * What became of one file.
 *
 * `failed` and a refusal are the distinction worth keeping. `failed` means try again — the network
 * was down, the server said 500, the file was locked — and the share is the queue, so the next pass
 * picks it up. A refusal means never: sending this file again tomorrow will produce the same answer,
 * so it is reported and moved out of the way like anything else the agent refuses.
 *
 * There used to be only `failed`, and two kinds of file took that branch for ever. A `.url` with no
 * address in it was the first, and got a reason of its own. The second was every file **the server**
 * refused (review of 25 September 2026): a `.png` whose bytes are a JPEG, an empty `.sb3`, a link to
 * `http://localhost:5500`. Each stayed in the child's folder and went up again every thirty seconds,
 * up to 25 MB at a time — never on the group screen, never in `_neatribuite`, with the health field
 * saying a file could not be uploaded and not which. The code's own note about the heartbeat says why
 * that is the expensive kind of wrong: an error that lingers after its cause is gone teaches an admin
 * to ignore the field.
 */
export type UploadOutcome = 'uploaded' | 'linked' | 'failed' | { refused: UnassignedFileReason };

/**
 * Which of the server's answers is a verdict on the file rather than a bad moment, and the reason to
 * file it under.
 *
 * Deliberately narrow. A 403 or a 404 can be the agent's own configuration — a wrong account, a
 * wrong address for the API — and filing every file on the share under `_neatribuite` because of a
 * typo in `config.json` would be far worse than retrying; a 401, a 408 or a 429 is a moment. What
 * is left are the three answers the server gives about the bytes themselves.
 */
export function refusalReason(error: unknown, isLink: boolean): UnassignedFileReason | null {
    if (!(error instanceof HttpError)) return null;
    // The server's `IsUrl` is stricter than `readLink`: `http://localhost:5500/…` and a host with an
    // underscore pass here and are refused there, and they will be refused again tomorrow.
    if (isLink) return error.status === 400 ? 'link_without_address' : null;
    if (error.status === 413) return 'too_large';
    if (error.status === 415)
        return error.code === 'PROJECT_FILE_CONTENT_MISMATCH' ? 'content_mismatch' : 'extension_not_allowed';
    return null;
}

/**
 * Files already on the server whose move out of the way failed — open in Word, in Acrobat — so the
 * next pass only tries the move again instead of sending the bytes a second time. Keyed on the
 * child, the name, the size and the time it was last saved: a file saved again is a new version and
 * goes up again.
 */
export type AwaitingMove = Set<string>;

export async function uploadFile(
    api: ApiClient,
    file: FoundFile,
    awaitingMove: AwaitingMove = new Set(),
): Promise<UploadOutcome> {
    const extension = path.extname(file.fileName).toLowerCase();
    const capturedOn = dayOf(file.modifiedAt);
    // The child, not the path: a folder the mirror renames meanwhile moves the file without making
    // it a new one, and the server already holds it.
    const key = `${file.childId}|${file.fileName}|${file.sizeBytes}|${file.modifiedAt.getTime()}`;

    if (awaitingMove.has(key)) return settle(file, capturedOn, 'uploaded', key, awaitingMove);

    let isLink = false;
    try {
        if (LINK_EXTENSIONS.has(extension)) {
            const url = readLink(file.absolutePath);
            if (url) {
                isLink = true;
                await api.createLinkProject({
                    childId: file.childId,
                    capturedOn,
                    title: titleOf(file.fileName),
                    label: titleOf(file.fileName),
                    url,
                });
                return settle(file, capturedOn, 'linked', key, awaitingMove);
            }
            // A `.txt` with no URL in it is just a text file, and the whitelist accepts those. It
            // falls through to the ordinary upload rather than being refused for not being a link.
            //
            // A `.url` cannot: it is on no whitelist except as a link, so there is nothing left to
            // try. Refused rather than failed, so that it leaves the folder and stops coming back.
            if (extension === '.url') return { refused: 'link_without_address' };
        }

        const bytes = fs.readFileSync(file.absolutePath);
        await api.ingest({
            childId: file.childId,
            capturedOn,
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            fileName: file.fileName,
            bytes,
        });
    } catch (error) {
        const reason = refusalReason(error, isLink);
        if (reason) return { refused: reason };

        // The file stays exactly where it is. That is the whole failure mode of this design and it
        // is a mild one: the share is the queue, so a network outage delays uploads rather than
        // losing them, and the next pass picks the file up again. Ids only: the path would name the
        // child, every thirty seconds, for as long as the outage lasts.
        log.warn(`Could not upload a file for child ${file.childId}: ${describeError(error)}`);
        return 'failed';
    }

    return settle(file, capturedOn, 'uploaded', key, awaitingMove);
}

/**
 * Moves a file the server now holds into `_urcate`. When the move fails the upload still stands:
 * the file is remembered, so the next pass tries only the move.
 */
function settle(
    file: FoundFile,
    capturedOn: string,
    outcome: 'uploaded' | 'linked',
    key: string,
    awaitingMove: AwaitingMove,
): UploadOutcome {
    try {
        move(file.absolutePath, uploadedPath(file.childDir, capturedOn), file.fileName);
        awaitingMove.delete(key);
        return outcome;
    } catch (error) {
        awaitingMove.add(key);
        log.warn(`Uploaded a file for child ${file.childId} but could not move it yet: ${describeError(error)}`);
        return 'failed';
    }
}

/** An error, short: for an answer from the API, its status and code — the body can carry a file name. */
function describeError(error: unknown): string {
    if (error instanceof HttpError) return `the API answered ${error.status}${error.code ? ` (${error.code})` : ''}`;
    return (
        (error as NodeJS.ErrnoException | undefined)?.code ?? (error instanceof Error ? error.message : String(error))
    );
}

/**
 * A refusal the scanner could not make, because it does not read files or talk to the server.
 *
 * Everything else in `RejectedFile` was decided from a directory entry; whether a shortcut carries
 * a usable address needs the contents, and whether the bytes are what their name says needs the
 * server — so those are settled by the uploader and filed the same way.
 */
export function refusedFile(file: FoundFile, reason: UnassignedFileReason): RejectedFile {
    return {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        reason,
        groupId: file.groupId,
        unassignedDir: file.unassignedDir,
    };
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
 * `renameSync`, and a copy-then-delete **only** when the rename failed for crossing volumes: a
 * rename within one share is atomic and instant, but `_urcate` could be on a different volume from
 * the child's folder if somebody has mounted things creatively. Any other failure — the file open in
 * Word or Acrobat — leaves it exactly where it is. The copy used to be the answer to every failure,
 * so a locked file was copied and not deleted, found again thirty seconds later and copied again:
 * `tema (2).docx` … `tema (N).docx` in `_neatribuite` (review of 25 September 2026). And when the
 * delete after a real cross-volume copy fails, the copy goes, so the file is in one place.
 */
function move(from: string, toDir: string, fileName: string): void {
    fs.mkdirSync(toDir, { recursive: true });
    const target = uniqueName(toDir, fileName);

    try {
        fs.renameSync(from, target);
        return;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    }

    fs.copyFileSync(from, target);
    try {
        fs.unlinkSync(from);
    } catch (error) {
        fs.rmSync(target, { force: true });
        throw error;
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
