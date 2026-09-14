import { inflateRawSync } from 'zlib';

/**
 * What a `.sb3` will give up about the project inside it, without a Scratch VM. E14/S3b.
 *
 * S3b asked this as a spike with a written answer, yes or no, before anything was built on it. **The
 * answer is yes**, and this file is why: a `.sb3` is an ordinary ZIP holding `project.json` plus its
 * assets, each named by the hash of its own bytes. The stage is 480×360 units, a backdrop covers it,
 * and every sprite carries the three numbers that place its costume — `x`, `y` and `size` — next to
 * the costume's own rotation centre. That is a picture, composed with the same `sharp` the image
 * thumbnails already use.
 *
 * It matters more than a completeness argument. Scratch is the base offering for Clasa 3–4 and
 * Clasa 5–6, so `.sb3` is most of what a class produces; until now every one of them reached the
 * review screen as a file name, which E14/S3a says is not a review.
 *
 * **Three things are deliberately not done**, and each is a decision rather than a gap:
 *
 *  - **No script execution.** What is drawn is the project as saved — costume zero of each visible
 *    sprite, where the editor last left it — not the project as it looks after the green flag. The
 *    first is a fact in the file; the second would need the VM.
 *  - **No rotation.** `rotationStyle: 'left-right'` flips, because a flip is free and a cat facing
 *    away from its own maze is visibly wrong. A true angle would mean rotating the bitmap and then
 *    re-deriving the anchor from the grown bounding box, for a picture nobody would look at twice.
 *  - **No graphic effects, no clones, no pen layer.** All three are runtime state.
 *
 * `.sb2` — Scratch 2 — is a ZIP as well, but its assets are numbered rather than hashed and its
 * costumes name them through `baseLayerID`. It is a different reader for a format the school does
 * not produce, so it is refused here rather than half-supported.
 *
 * **Hand-rolled ZIP reading, for the reason `file-types.ts` gives.** The obvious packages are
 * ESM-only and die in ts-jest with `SyntaxError: Unexpected token 'export'` — the trap CLAUDE.md
 * writes up twice, and the reason `@nestjs/schedule` is pinned to v6. Reading a central directory is
 * sixty lines and `zlib` is in Node.
 */

/** The stage, in Scratch units: x runs −240…240 and y runs 180…−180, with the origin at the centre. */
export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

/**
 * Refuse a `project.json` past this. The file is a description of a child's project, not a payload;
 * a megabyte of it is already an enormous program, and the process that would parse a hundred is
 * the one holding the database connection.
 */
export const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024;

/**
 * Refuse a single entry that claims to expand past this. A ZIP records the uncompressed size in its
 * own directory, so a bomb can be turned down before a byte of it is inflated.
 */
export const MAX_ENTRY_BYTES = 30 * 1024 * 1024;

/** How many sprites are drawn. A busy project is still recognisable from its first two dozen. */
export const MAX_SPRITES_DRAWN = 24;

export interface ZipEntry {
    /** Offset of the local file header, from the start of the archive. */
    localHeaderOffset: number;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
}

export interface ZipArchive {
    names: string[];
    /** The entry's bytes, or `null` when there is no such entry. Throws when the entry is refused. */
    read(name: string): Buffer | null;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * Reads the archive's directory, and nothing else — the bytes of an entry are inflated only when
 * somebody asks for that entry by name. A `.sb3` holds every costume and every sound a child has
 * ever added to the project, and a thumbnail needs two of them.
 */
export function openZip(bytes: Buffer): ZipArchive {
    const eocd = findEndOfCentralDirectory(bytes);
    if (eocd < 0) throw new Sb3Error('not a zip archive');

    const entryCount = bytes.readUInt16LE(eocd + 10);
    let cursor = bytes.readUInt32LE(eocd + 16);
    const entries = new Map<string, ZipEntry>();

    for (let n = 0; n < entryCount; n++) {
        if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER) {
            throw new Sb3Error('damaged central directory');
        }
        const nameLength = bytes.readUInt16LE(cursor + 28);
        const extraLength = bytes.readUInt16LE(cursor + 30);
        const commentLength = bytes.readUInt16LE(cursor + 32);
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
        entries.set(name, {
            compressionMethod: bytes.readUInt16LE(cursor + 10),
            compressedSize: bytes.readUInt32LE(cursor + 20),
            uncompressedSize: bytes.readUInt32LE(cursor + 24),
            localHeaderOffset: bytes.readUInt32LE(cursor + 42),
        });
        cursor += 46 + nameLength + extraLength + commentLength;
    }

    return {
        names: [...entries.keys()],
        read(name: string): Buffer | null {
            const entry = entries.get(name);
            if (!entry) return null;
            if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
                throw new Sb3Error(`entry ${name} claims ${entry.uncompressedSize} bytes`);
            }
            if (entry.compressionMethod !== STORED && entry.compressionMethod !== DEFLATED) {
                throw new Sb3Error(`entry ${name} uses compression method ${entry.compressionMethod}`);
            }

            // The local header repeats the name and carries its own extra field, which is routinely a
            // different length from the one in the directory. The data starts after both.
            const header = entry.localHeaderOffset;
            if (header + 30 > bytes.length) throw new Sb3Error(`entry ${name} points past the end of the archive`);
            const start = header + 30 + bytes.readUInt16LE(header + 26) + bytes.readUInt16LE(header + 28);
            const raw = bytes.subarray(start, start + entry.compressedSize);

            return entry.compressionMethod === STORED ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
        },
    };
}

/** Thrown for anything malformed. Never escapes `ThumbnailService`, which answers `null` instead. */
export class Sb3Error extends Error {}

export interface Sb3Costume {
    name?: string;
    md5ext?: string;
    dataFormat?: string;
    assetId?: string;
    bitmapResolution?: number;
    rotationCenterX?: number;
    rotationCenterY?: number;
}

export interface Sb3Target {
    isStage?: boolean;
    name?: string;
    costumes?: Sb3Costume[];
    currentCostume?: number;
    layerOrder?: number;
    visible?: boolean;
    x?: number;
    y?: number;
    size?: number;
    direction?: number;
    rotationStyle?: string;
}

export interface Sb3Project {
    targets?: Sb3Target[];
}

/** Where a sprite's costume goes on the 480×360 stage, in pixels from the top left. */
export interface Placement {
    /** The entry to read out of the archive. */
    md5ext: string;
    left: number;
    top: number;
    width: number;
    height: number;
    /** `rotationStyle: 'left-right'` with the sprite facing left. A flip, never an angle. */
    flip: boolean;
}

export function parseProject(bytes: Buffer): Sb3Project {
    if (bytes.length > MAX_PROJECT_JSON_BYTES) throw new Sb3Error(`project.json is ${bytes.length} bytes`);
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) throw new Sb3Error('project.json is not an object');
    // No assertion: every field of `Sb3Project` is optional, which is the honest shape for a file
    // written by a program nobody here controls. Reading `targets` off it still has to cope with the
    // field being absent, and every function below does.
    return parsed;
}

/** The backdrop the project was saved on, or null for a project that has none. */
export function backdropOf(project: Sb3Project): Sb3Costume | null {
    const stage = project.targets?.find((target) => target.isStage === true);
    return currentCostume(stage);
}

/** The costume a target is wearing, falling back to its first when `currentCostume` points nowhere. */
export function currentCostume(target: Sb3Target | undefined): Sb3Costume | null {
    if (!target?.costumes?.length) return null;
    const index = target.currentCostume ?? 0;
    return target.costumes[index] ?? target.costumes[0] ?? null;
}

/**
 * The sprites to draw, back to front.
 *
 * `visible: false` is honoured — a sprite the child hid is one the child does not want seen, and
 * hidden sprites are routinely helpers parked off to one side. `layerOrder` decides what covers
 * what, and a project saved without it keeps the order the file lists.
 */
export function visibleSprites(project: Sb3Project): Sb3Target[] {
    return (project.targets ?? [])
        .filter((target) => target.isStage !== true && target.visible !== false && currentCostume(target) !== null)
        .map((target, index) => ({ target, index }))
        .sort((a, b) => (a.target.layerOrder ?? a.index) - (b.target.layerOrder ?? b.index))
        .slice(0, MAX_SPRITES_DRAWN)
        .map((entry) => entry.target);
}

/**
 * Turns a sprite plus the intrinsic size of its costume into a rectangle on the stage.
 *
 * Three conversions, all of them easy to get subtly wrong:
 *
 *  - **`bitmapResolution`.** The paint editor exports bitmaps at twice the stage resolution, so a
 *    96×100 costume is 48×50 stage units. Vector costumes leave the field out and mean 1.
 *  - **`size` is a percentage**, and it multiplies whatever the resolution left.
 *  - **The anchor is the rotation centre, not the corner**, and y grows upward in Scratch and
 *    downward in every image library. Ignoring either one puts every sprite in the wrong place by
 *    half its own size, which looks like a plausible picture of a different project.
 */
export function placeSprite(sprite: Sb3Target, costumeWidth: number, costumeHeight: number): Placement | null {
    const costume = currentCostume(sprite);
    if (!costume?.md5ext) return null;

    const resolution = costume.bitmapResolution && costume.bitmapResolution > 0 ? costume.bitmapResolution : 1;
    const scale = ((sprite.size ?? 100) / 100) * (1 / resolution);
    const width = Math.max(1, Math.round(costumeWidth * scale));
    const height = Math.max(1, Math.round(costumeHeight * scale));

    const anchorX = (costume.rotationCenterX ?? costumeWidth / 2) * scale;
    const anchorY = (costume.rotationCenterY ?? costumeHeight / 2) * scale;

    return {
        md5ext: costume.md5ext,
        left: Math.round(STAGE_WIDTH / 2 + (sprite.x ?? 0) - anchorX),
        top: Math.round(STAGE_HEIGHT / 2 - (sprite.y ?? 0) - anchorY),
        width,
        height,
        flip: sprite.rotationStyle === 'left-right' && (sprite.direction ?? 90) < 0,
    };
}

function findEndOfCentralDirectory(bytes: Buffer): number {
    // The record is last, but a ZIP comment may follow it — up to 64KB of one, which is as far back
    // as this needs to look.
    const earliest = Math.max(0, bytes.length - 22 - 0xffff);
    for (let i = bytes.length - 22; i >= earliest; i--) {
        if (bytes.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) return i;
    }
    return -1;
}
