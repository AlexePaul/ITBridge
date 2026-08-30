import { inspectFile, isVideoName, MAX_FILE_BYTES, sizeLimitFor } from './file-types';

/**
 * The door E14 puts in front of a network share that every machine in the school can write to.
 *
 * The point of these tests is the second rule, not the first: an extension is a claim made by
 * whoever named the file, and believing it would mean serving a parent whatever a name said.
 */

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600', 'hex');
const ZIP = Buffer.from('504b0304140000000800', 'hex');
const MP4 = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypisom'), Buffer.alloc(8)]);

describe('inspectFile', () => {
    it('accepts a PNG that is a PNG', () => {
        const verdict = inspectFile('captura.png', PNG);

        expect(verdict.ok).toBe(true);
        expect(verdict.contentType).toBe('image/png');
        expect(verdict.isImage).toBe(true);
    });

    it('accepts a Scratch file, which is a ZIP underneath', () => {
        const verdict = inspectFile('robot.sb3', ZIP);

        expect(verdict.ok).toBe(true);
        expect(verdict.contentType).toBe('application/x.scratch.sb3');
        // No thumbnail from it today: whether a `.sb3` can even give up a stage image is an open
        // question with an answer of its own to write down (E14/S3b).
        expect(verdict.isImage).toBe(false);
    });

    it('refuses a file whose bytes disagree with its extension', () => {
        // Renaming an archive to `.png` is how a file changes identity on the way in, and the stored
        // type is what it is served back as later.
        const verdict = inspectFile('captura.png', ZIP);

        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('content_mismatch');
    });

    it('refuses an extension nobody asked for, whatever the bytes are', () => {
        expect(inspectFile('setup.exe', PNG).reason).toBe('extension_not_allowed');
        expect(inspectFile('macro.docm', ZIP).reason).toBe('extension_not_allowed');
    });

    it('accepts a text file without pretending to check a signature it does not have', () => {
        // Honest rather than theatrical: there is no magic number for text, and a check that always
        // passes should say so instead of looking like verification.
        expect(inspectFile('notite.txt', Buffer.from('salut')).ok).toBe(true);
        expect(inspectFile('joc.py', Buffer.from('print("hi")')).ok).toBe(true);
    });

    it('recognises MP4 by the marker at offset four, not at the start', () => {
        expect(inspectFile('prezentare.mp4', MP4).ok).toBe(true);
        expect(inspectFile('prezentare.mp4', PNG).reason).toBe('content_mismatch');
    });

    it('tells video apart, because it takes a different road and a different ceiling', () => {
        expect(inspectFile('prezentare.mp4', MP4).isVideo).toBe(true);
        expect(isVideoName('prezentare.mp4')).toBe(true);
        expect(isVideoName('captura.png')).toBe(false);
        expect(sizeLimitFor('prezentare.mp4')).toBeGreaterThan(sizeLimitFor('captura.png'));
    });

    it('refuses anything past the ordinary ceiling', () => {
        const oversized = Buffer.concat([JPEG, Buffer.alloc(MAX_FILE_BYTES)]);

        expect(inspectFile('poza.jpg', oversized).reason).toBe('too_large');
    });

    it('is not fooled by an uppercase extension', () => {
        // Windows is case-insensitive and a camera writes `.JPG`. Refusing that would reject a
        // perfectly ordinary photograph of a finished robot.
        expect(inspectFile('POZA.JPG', JPEG).ok).toBe(true);
    });

    it('refuses an empty file rather than calling it whatever its name says', () => {
        expect(inspectFile('captura.png', Buffer.alloc(0)).ok).toBe(false);
    });
});
