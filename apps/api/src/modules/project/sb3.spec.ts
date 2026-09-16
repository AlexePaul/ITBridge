import { backdropOf, MAX_ENTRY_BYTES, MAX_SPRITES_DRAWN, openZip, parseProject, placeSprite, Sb3Error, visibleSprites } from './sb3';
import { buildSb3, buildZip, projectJson } from './sb3.spec-helpers';

/**
 * The spike E14/S3b asked for, held as tests: a `.sb3` is a ZIP with a `project.json` in it, and
 * that is enough to draw the stage the child last saved.
 *
 * The arithmetic below is the part worth pinning. Every one of the three conversions — resolution,
 * percentage, rotation centre — is off by a factor or a sign in a way that still produces a
 * plausible picture, of a project nobody made.
 */

const read = (bytes: Buffer, name: string) => openZip(bytes).read(name);

describe('openZip', () => {
    it('reads a stored entry and a deflated one', () => {
        const archive = buildZip([
            { name: 'plain.txt', bytes: Buffer.from('salut') },
            { name: 'squeezed.txt', bytes: Buffer.from('salut '.repeat(200)), deflate: true },
        ]);

        expect(read(archive, 'plain.txt')?.toString()).toBe('salut');
        expect(read(archive, 'squeezed.txt')?.toString()).toBe('salut '.repeat(200));
    });

    it('answers null for an entry that is not there, rather than throwing', () => {
        expect(read(buildZip([{ name: 'a.txt', bytes: Buffer.from('a') }]), 'project.json')).toBeNull();
    });

    it('finds the directory behind a trailing archive comment', () => {
        const archive = buildZip([{ name: 'a.txt', bytes: Buffer.from('a') }], 'scris de Scratch');

        expect(read(archive, 'a.txt')?.toString()).toBe('a');
    });

    it('refuses an entry that announces more than the ceiling, before inflating a byte of it', () => {
        const archive = buildZip([{ name: 'bomb.bin', bytes: Buffer.from('x'), deflate: true, declaredUncompressedSize: MAX_ENTRY_BYTES + 1 }]);

        expect(() => read(archive, 'bomb.bin')).toThrow(Sb3Error);
    });

    it('refuses something that is not a zip at all', () => {
        expect(() => openZip(Buffer.from('nu sunt o arhivă'))).toThrow(Sb3Error);
    });
});

describe('parseProject', () => {
    it('refuses a project.json that is not an object', () => {
        expect(() => parseProject(Buffer.from('"just a string"'))).toThrow(Sb3Error);
    });
});

describe('backdropOf', () => {
    it('takes the backdrop the project was saved on', () => {
        expect(backdropOf(JSON.parse(projectJson([]).toString()))?.md5ext).toBe('backdrop.svg');
    });

    it('answers null for a project with no backdrop', () => {
        expect(backdropOf(JSON.parse(projectJson([], { backdrop: null }).toString()))).toBeNull();
    });
});

describe('visibleSprites', () => {
    const project = (sprites: Parameters<typeof projectJson>[0]) => JSON.parse(projectJson(sprites).toString()) as Parameters<typeof visibleSprites>[0];

    it('leaves out the stage and anything the child hid', () => {
        const sprites = visibleSprites(project([{ name: 'Pisica' }, { name: 'Ajutor', visible: false }]));

        expect(sprites.map((sprite) => sprite.name)).toEqual(['Pisica']);
    });

    it('orders back to front, so what covers what is what the child saw', () => {
        const sprites = visibleSprites(
            project([
                { name: 'Fata', layerOrder: 9 },
                { name: 'Spate', layerOrder: 2 },
            ]),
        );

        expect(sprites.map((sprite) => sprite.name)).toEqual(['Spate', 'Fata']);
    });

    it('draws at most two dozen of them', () => {
        const many = Array.from({ length: MAX_SPRITES_DRAWN + 5 }, (_unused, index) => ({ name: `S${index}` }));

        expect(visibleSprites(project(many))).toHaveLength(MAX_SPRITES_DRAWN);
    });
});

describe('placeSprite', () => {
    const spriteOf = (input: Parameters<typeof projectJson>[0][number]) =>
        (JSON.parse(projectJson([input]).toString()) as { targets: Parameters<typeof placeSprite>[0][] }).targets[1];

    it('anchors on the rotation centre, not the corner', () => {
        const placement = placeSprite(spriteOf({ name: 'Pisica' }), 96, 100);

        // Centre of the stage, minus the costume's own centre: 240 − 48 and 180 − 50.
        expect(placement).toMatchObject({ left: 192, top: 130, width: 96, height: 100, flip: false });
    });

    it('reads y upward, the way Scratch does and no image library does', () => {
        const up = placeSprite(spriteOf({ name: 'Sus', y: 60 }), 96, 100);
        const down = placeSprite(spriteOf({ name: 'Jos', y: -60 }), 96, 100);

        expect(up?.top).toBe(70);
        expect(down?.top).toBe(190);
    });

    it('halves a bitmap costume, because the paint editor exports at twice the stage resolution', () => {
        const placement = placeSprite(spriteOf({ name: 'Pisica', bitmapResolution: 2, rotationCenterX: 96, rotationCenterY: 100 }), 192, 200);

        expect(placement).toMatchObject({ left: 192, top: 130, width: 96, height: 100 });
    });

    it('applies size as a percentage, on top of the resolution', () => {
        const placement = placeSprite(spriteOf({ name: 'Mica', size: 50 }), 96, 100);

        expect(placement).toMatchObject({ width: 48, height: 50, left: 216, top: 155 });
    });

    it('flips a left-right sprite that faces left, and never rotates one that turns', () => {
        const leftRight = placeSprite(spriteOf({ name: 'Crab', rotationStyle: 'left-right', direction: -90 }), 96, 100);
        const allAround = placeSprite(spriteOf({ name: 'Racheta', rotationStyle: 'all around', direction: -90 }), 96, 100);

        expect(leftRight?.flip).toBe(true);
        expect(allAround?.flip).toBe(false);
    });
});

describe('a whole file', () => {
    it('is readable end to end: project.json, a backdrop and a costume', () => {
        const archive = openZip(buildSb3([{ name: 'Pisica' }]));

        expect(archive.names).toEqual(['project.json', 'backdrop.svg', 'costume.svg']);
        expect(parseProject(archive.read('project.json') as Buffer).targets).toHaveLength(2);
    });
});
