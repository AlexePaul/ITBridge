/**
 * What may be stored, and how the answer is decided. E14/S1.
 *
 * Two rules, and the second is the one that matters:
 *
 *  1. An allow-list of extensions, because a whole class of files has no business arriving at all.
 *  2. **The real type, read from the file's leading bytes** — not from the extension. The extension
 *     is a claim made by whoever named the file, and the door here is a network share that any
 *     machine in the school can write to. The stored `Content-Type` is what the file is later
 *     served back as, so believing the claim would mean serving a parent whatever a name said.
 *
 * There was no limit of any kind before this: no size, no list, no endpoint. The numbers below are
 * an order of magnitude rather than a policy — E14 fixes them properly after a day of watching a
 * real class, which is also what settles whether `.sb3` is the main case.
 *
 * **Deliberately not a dependency.** `file-type` would do this and is ESM-only from v19, which dies
 * in ts-jest with `SyntaxError: Unexpected token 'export'` — not just in the suite that imports it
 * but in every suite that reaches `app.module.ts`. That trap is written up in CLAUDE.md and is why
 * `@nestjs/schedule` is pinned to v6. Sniffing eight signatures is thirty lines.
 */

/** Ordinary work: a Scratch file, a screenshot, some code. Roughly 25MB, as E14/S1 puts it. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Video, which is a different order of magnitude and takes a different road: it is uploaded
 * straight to S3 through a signed URL and never passes through this process. `uploadFile` holds the
 * whole file in memory and the API shares an instance with Postgres — a buffered 200MB upload is
 * not a slow request, it is a dead process.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * What one file may be, by extension, with the type it is expected to actually be.
 *
 * A type of `null` means "no signature to check" — plain text and Scratch's own `.sb3` are the two
 * cases, and `.sb3` is a ZIP, so it is checked as one.
 */
interface AllowedType {
    extensions: string[];
    contentType: string;
    /** Leading bytes, as hex, any one of which identifies the format. Empty when there is nothing to check. */
    signatures: string[];
    /** Video takes the signed-URL road and the larger ceiling. */
    isVideo?: boolean;
    /** Whether a thumbnail can be made from it today. Video and `.sb3` cannot — that is E14/S3b. */
    isImage?: boolean;
}

const ALLOWED_TYPES: AllowedType[] = [
    { extensions: ['.png'], contentType: 'image/png', signatures: ['89504e470d0a1a0a'], isImage: true },
    { extensions: ['.jpg', '.jpeg'], contentType: 'image/jpeg', signatures: ['ffd8ff'], isImage: true },
    { extensions: ['.gif'], contentType: 'image/gif', signatures: ['474946383761', '474946383961'], isImage: true },
    // RIFF....WEBP: the four bytes at offset 8 are what distinguish it from a RIFF wave file, and
    // they are checked separately below.
    { extensions: ['.webp'], contentType: 'image/webp', signatures: ['52494646'], isImage: true },
    // Scratch, Scratch's older sibling, and a plain archive are all ZIP containers. The magic bytes
    // cannot tell them apart and do not need to: what matters is that the thing is a ZIP and not an
    // executable that has been renamed.
    { extensions: ['.sb3'], contentType: 'application/x.scratch.sb3', signatures: ['504b0304', '504b0506'] },
    { extensions: ['.sb2'], contentType: 'application/x.scratch.sb2', signatures: ['504b0304', '504b0506'] },
    { extensions: ['.zip'], contentType: 'application/zip', signatures: ['504b0304', '504b0506'] },
    { extensions: ['.pdf'], contentType: 'application/pdf', signatures: ['25504446'] },
    // ftyp at offset 4. Checked with an offset, like WEBP.
    { extensions: ['.mp4', '.m4v'], contentType: 'video/mp4', signatures: [], isVideo: true },
    { extensions: ['.webm'], contentType: 'video/webm', signatures: ['1a45dfa3'], isVideo: true },
    // Source files a child writes. No signature exists for text, and that is the honest answer
    // rather than a check that pretends to be one.
    { extensions: ['.txt', '.py', '.js', '.html', '.css', '.json', '.md', '.csv'], contentType: 'text/plain', signatures: [] },
];

export interface FileTypeVerdict {
    ok: boolean;
    contentType: string;
    isImage: boolean;
    isVideo: boolean;
    /** English, for the API's error message. The Romanian sentence is the frontend's job. */
    reason?: 'extension_not_allowed' | 'content_mismatch' | 'too_large';
}

export function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
}

/** The type an extension claims, without looking at any bytes. Used before an upload exists. */
export function declaredType(fileName: string): AllowedType | undefined {
    const extension = extensionOf(fileName);
    return ALLOWED_TYPES.find((type) => type.extensions.includes(extension));
}

export function isVideoName(fileName: string): boolean {
    return declaredType(fileName)?.isVideo === true;
}

/** The ceiling for this particular file: video gets the larger one, everything else the ordinary one. */
export function sizeLimitFor(fileName: string): number {
    return isVideoName(fileName) ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
}

/**
 * Decides whether these bytes may be stored, and as what.
 *
 * The extension has to be on the list *and* the bytes have to agree with it. A `.png` whose
 * contents are a ZIP is refused rather than quietly stored as a ZIP: the extension mismatch means
 * somebody either renamed something or exported it wrongly, and both are worth an admin seeing on
 * the group screen rather than a file silently changing identity on the way in.
 */
export function inspectFile(fileName: string, bytes: Buffer): FileTypeVerdict {
    const declared = declaredType(fileName);
    if (!declared) {
        return { ok: false, contentType: 'application/octet-stream', isImage: false, isVideo: false, reason: 'extension_not_allowed' };
    }

    const verdict: FileTypeVerdict = {
        ok: true,
        contentType: declared.contentType,
        isImage: declared.isImage === true,
        isVideo: declared.isVideo === true,
    };

    if (bytes.length > sizeLimitFor(fileName)) {
        return { ...verdict, ok: false, reason: 'too_large' };
    }

    if (!matchesSignature(declared, bytes)) {
        return { ...verdict, ok: false, reason: 'content_mismatch' };
    }

    return verdict;
}

function matchesSignature(type: AllowedType, bytes: Buffer): boolean {
    const head = bytes.subarray(0, 16).toString('hex');

    // MP4 carries `ftyp` at offset 4 rather than at the start, so there is nothing at offset 0 to
    // list above. An empty file cannot be one.
    if (type.contentType === 'video/mp4') {
        return bytes.length > 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    }

    // WEBP is a RIFF container; the leading four bytes are shared with audio, and the four at
    // offset 8 are what actually name the format.
    if (type.contentType === 'image/webp') {
        return head.startsWith('52494646') && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    }

    if (type.signatures.length === 0) {
        return true;
    }

    return type.signatures.some((signature) => head.startsWith(signature));
}
