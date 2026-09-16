import { crc32, deflateRawSync } from 'zlib';

/**
 * A `.sb3` built byte by byte, for the tests of `sb3.ts` and `ThumbnailService`.
 *
 * Writing the archive by hand rather than reaching for `archiver` is the point: the reader under
 * test is hand-rolled, so a fixture produced by the same family of code could agree with it about
 * something they are both wrong about. This writes the two compression methods a real Scratch save
 * uses, and lets a test lie about an entry's uncompressed size — which is how a zip bomb announces
 * itself, and the only way to build one without actually building one.
 */

export interface ZipEntryInput {
    name: string;
    bytes: Buffer;
    /** Stored (0) when false. Scratch deflates; both turn up in the wild. */
    deflate?: boolean;
    /** Overrides the size written into the directory, for the refusal tests. */
    declaredUncompressedSize?: number;
}

export function buildZip(entries: ZipEntryInput[], comment = ''): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8');
        const payload = entry.deflate ? deflateRawSync(entry.bytes) : entry.bytes;
        const method = entry.deflate ? 8 : 0;
        const checksum = crc32(entry.bytes);
        const declared = entry.declaredUncompressedSize ?? entry.bytes.length;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(entry.bytes.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, payload);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(declared, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += 30 + name.length + payload.length;
    }

    const centralDirectory = Buffer.concat(centrals);
    const commentBytes = Buffer.from(comment, 'utf8');
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(commentBytes.length, 20);

    return Buffer.concat([...locals, centralDirectory, end, commentBytes]);
}

/** A 480×360 backdrop: sky over grass, so a human looking at a failing test can see what went wrong. */
export const BACKDROP_SVG = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
        '<rect width="480" height="360" fill="#bfe3ff"/><rect y="270" width="480" height="90" fill="#6ab04c"/></svg>',
);

/** A costume, as a vector one arrives: 96×100 stage units, no `bitmapResolution`. */
export const COSTUME_SVG = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="100">' + '<ellipse cx="48" cy="60" rx="40" ry="35" fill="#f39c12"/></svg>',
);

export interface SpriteInput {
    name: string;
    x?: number;
    y?: number;
    size?: number;
    visible?: boolean;
    layerOrder?: number;
    direction?: number;
    rotationStyle?: string;
    md5ext?: string;
    bitmapResolution?: number;
    rotationCenterX?: number;
    rotationCenterY?: number;
}

/** A `project.json` in the shape Scratch 3 writes one, with only the fields a thumbnail reads. */
export function projectJson(sprites: SpriteInput[], options: { backdrop?: string | null } = {}): Buffer {
    const backdrop = options.backdrop === undefined ? 'backdrop.svg' : options.backdrop;

    return Buffer.from(
        JSON.stringify({
            targets: [
                {
                    isStage: true,
                    name: 'Stage',
                    currentCostume: 0,
                    costumes: backdrop
                        ? [{ name: 'backdrop1', dataFormat: 'svg', assetId: 'b', md5ext: backdrop, rotationCenterX: 240, rotationCenterY: 180 }]
                        : [],
                    layerOrder: 0,
                },
                ...sprites.map((sprite, index) => ({
                    isStage: false,
                    name: sprite.name,
                    currentCostume: 0,
                    costumes: [
                        {
                            name: 'costume1',
                            dataFormat: 'svg',
                            assetId: 'c',
                            md5ext: sprite.md5ext ?? 'costume.svg',
                            bitmapResolution: sprite.bitmapResolution,
                            rotationCenterX: sprite.rotationCenterX ?? 48,
                            rotationCenterY: sprite.rotationCenterY ?? 50,
                        },
                    ],
                    x: sprite.x ?? 0,
                    y: sprite.y ?? 0,
                    size: sprite.size ?? 100,
                    direction: sprite.direction ?? 90,
                    rotationStyle: sprite.rotationStyle ?? 'all around',
                    visible: sprite.visible ?? true,
                    layerOrder: sprite.layerOrder ?? index + 1,
                })),
            ],
            monitors: [],
            extensions: [],
            meta: { semver: '3.0.0' },
        }),
    );
}

/** The whole file: `project.json`, a backdrop and one costume, deflated as Scratch saves them. */
export function buildSb3(sprites: SpriteInput[], options: { backdrop?: string | null } = {}): Buffer {
    return buildZip([
        { name: 'project.json', bytes: projectJson(sprites, options), deflate: true },
        { name: 'backdrop.svg', bytes: BACKDROP_SVG, deflate: true },
        { name: 'costume.svg', bytes: COSTUME_SVG, deflate: true },
    ]);
}
