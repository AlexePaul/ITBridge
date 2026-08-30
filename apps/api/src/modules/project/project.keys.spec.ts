import { hashContent, ingestionKey, projectFileKey, projectThumbnailKey } from './project.keys';

/**
 * The two rules that keep a child's name out of object storage and make an upload idempotent.
 *
 * Both were learned elsewhere in this repo at a cost: the parent's name in an invoice key made every
 * invoice unreachable at the first rename, and an upload that died halfway wedged invoicing for a
 * whole month on a unique constraint.
 */
describe('object keys', () => {
    it('holds identifiers only', () => {
        const key = projectFileKey(41, 7, 92);

        expect(key).toBe('projects/41/7/92');
        // Not a stylistic preference: the key travels into signed URLs, request logs and the outbox
        // row that carries a thumbnail, so a name in it leaks in three places at once.
        expect(key).not.toMatch(/[a-z]{3,}\/[A-ZĂÂÎȘȚ]/);
    });

    it('shares one bucket with invoices, under its own prefix', () => {
        expect(projectFileKey(1, 1, 1).startsWith('projects/')).toBe(true);
        expect(projectThumbnailKey(41)).toBe('projects/41/thumb.jpg');
    });

    it('puts the thumbnail on the project, not on the version', () => {
        // A thumbnail answers "what is this?", and that does not change when a child comes back to
        // improve their work — the newest version replaces the picture in place.
        expect(projectThumbnailKey(41)).toBe(projectThumbnailKey(41));
    });
});

describe('ingestion key', () => {
    it('is derived from content, never from the name', () => {
        const bytes = Buffer.from('un proiect');

        expect(ingestionKey(12, hashContent(bytes))).toBe(ingestionKey(12, hashContent(Buffer.from('un proiect'))));
        expect(hashContent(bytes)).not.toBe(hashContent(Buffer.from('alt proiect')));
    });

    it('is scoped to the child, so a shared starter file is not swallowed as a duplicate', () => {
        // A teacher hands the same starter file to a whole group at the beginning of a module.
        // Without the scope, the second child's upload would be refused as a repeat of the first
        // child's, and one family would silently receive nothing.
        const starter = hashContent(Buffer.from('fisierul de pornire'));

        expect(ingestionKey(12, starter)).not.toBe(ingestionKey(13, starter));
    });

    it('produces a value that fits the column', () => {
        // varchar(120). A SHA-256 in hex is 64 characters, so there is room for an id of any size a
        // school will ever reach — but the check is here rather than assumed.
        expect(ingestionKey(999999, hashContent(Buffer.from('x'))).length).toBeLessThan(120);
    });
});
