import { chmodSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import sharp from 'sharp';
import { ThumbnailService, ThumbnailToolMissingError } from './thumbnail.service';
import { buildSb3, buildZip, projectJson, BACKDROP_SVG } from './sb3.spec-helpers';

/**
 * The two kinds of file that could not have a picture until E14/S3b, and the host that may not be
 * able to make one.
 *
 * The ffmpeg tests drive the real `spawn` against a stub on `PATH`, rather than mocking
 * `child_process`. What they are actually checking is the difference between "this video has no
 * frame in it" and "this host has no ffmpeg" — and that difference is entirely in how the process
 * fails to start, which a mock would be asserting about itself.
 */

const service = new ThumbnailService();

/** Silence the deliberate warnings; a failing thumbnail is an ordinary outcome, not a broken test. */
beforeAll(() => {
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
});

describe('fromScratchProject', () => {
    it('draws the stage a child saved: backdrop, and the sprites standing on it', async () => {
        const thumbnail = await service.fromScratchProject(buildSb3([{ name: 'Pisica', x: -60, y: -40 }]));

        expect(thumbnail).not.toBeNull();
        const meta = await sharp(thumbnail as Buffer).metadata();
        expect(meta.format).toBe('jpeg');
        // 480×360 is the stage, and 480 is also the thumbnail's long edge, so it survives whole.
        expect(meta.width).toBe(480);
        expect(meta.height).toBe(360);
    });

    it('keeps a sprite that hangs off the edge, clipped to the stage', async () => {
        // sharp refuses an overlay that does not fit inside its canvas, so without the clip this is
        // not a lopsided picture — it is no picture at all, for a project that is perfectly ordinary.
        const thumbnail = await service.fromScratchProject(buildSb3([{ name: 'Marginea', x: 230, y: 170 }]));

        expect(thumbnail).not.toBeNull();
    });

    it('leaves out a sprite that is entirely off the stage', async () => {
        const offStage = await service.fromScratchProject(buildSb3([{ name: 'Departe', x: 900 }]));

        expect(offStage).not.toBeNull();
    });

    it('answers null for a project with nothing to look at', async () => {
        const empty = await service.fromScratchProject(buildSb3([{ name: 'Ascuns', visible: false }], { backdrop: null }));

        expect(empty).toBeNull();
    });

    it('answers null, never throws, for an archive without a project.json', async () => {
        expect(await service.fromScratchProject(buildZip([{ name: 'readme.txt', bytes: Buffer.from('nu e Scratch') }]))).toBeNull();
    });

    it('answers null for a file that is not an archive', async () => {
        expect(await service.fromScratchProject(Buffer.from('504b0304 dar nimic dupa', 'utf8'))).toBeNull();
    });

    it('answers null when project.json names costumes the archive does not hold', async () => {
        const archive = buildZip([{ name: 'project.json', bytes: projectJson([{ name: 'Pisica' }], { backdrop: null }), deflate: true }]);

        expect(await service.fromScratchProject(archive)).toBeNull();
    });

    it('draws the backdrop alone when that is all there is', async () => {
        const archive = buildZip([
            { name: 'project.json', bytes: projectJson([]), deflate: true },
            { name: 'backdrop.svg', bytes: BACKDROP_SVG, deflate: true },
        ]);

        expect(await service.fromScratchProject(archive)).not.toBeNull();
    });
});

describe('fromVideoFile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'itbridge-ffmpeg-'));
    const framePath = join(directory, 'frame.png');
    const originalPath = process.env.FFMPEG_PATH;

    /** A stub that behaves like ffmpeg does for the case under test: writes a frame, or fails. */
    const stub = (body: string): string => {
        const path = join(directory, `stub-${Math.random().toString(36).slice(2)}.sh`);
        writeFileSync(path, `#!/bin/sh\n${body}\n`);
        chmodSync(path, 0o755);
        return path;
    };

    beforeAll(async () => {
        await sharp({ create: { width: 640, height: 360, channels: 3, background: '#2d3436' } })
            .png()
            .toFile(framePath);
    });

    afterEach(() => {
        if (originalPath === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = originalPath;
    });

    it('turns the frame ffmpeg writes into a thumbnail on the same ladder as an image', async () => {
        process.env.FFMPEG_PATH = stub(`cat ${framePath}`);

        const thumbnail = await service.fromVideoFile('/nu/conteaza.mp4');

        expect(thumbnail).not.toBeNull();
        const meta = await sharp(thumbnail as Buffer).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.width).toBe(480);
    });

    it('falls back to the very first frame when a second in is past the end of the clip', async () => {
        // The stub answers nothing for `-ss 1` and a frame for `-ss 0`, which is what a clip shorter
        // than a second does. Without the second pass, every short video gets no picture.
        process.env.FFMPEG_PATH = stub(`for arg in "$@"; do\n  if [ "$arg" = "0" ]; then cat ${framePath}; exit 0; fi\ndone\nexit 0`);

        expect(await service.fromVideoFile('/scurt.mp4')).not.toBeNull();
    });

    it('answers null when ffmpeg runs and finds nothing it can decode', async () => {
        process.env.FFMPEG_PATH = stub('echo "moov atom not found" 1>&2; exit 1');

        expect(await service.fromVideoFile('/stricat.mp4')).toBeNull();
    });

    it('throws when there is no ffmpeg at all, because that is the host answering, not the file', async () => {
        process.env.FFMPEG_PATH = join(directory, 'nu-exista-ffmpeg');

        await expect(service.fromVideoFile('/oricare.mp4')).rejects.toBeInstanceOf(ThumbnailToolMissingError);
    });
});

describe('fromVideoStream', () => {
    const originalPath = process.env.FFMPEG_PATH;
    afterEach(() => {
        if (originalPath === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = originalPath;
    });

    it('cleans up after itself even when the host has no ffmpeg', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'itbridge-ffmpeg-'));
        process.env.FFMPEG_PATH = join(directory, 'nu-exista-ffmpeg');
        const before = temporaryDirectoryCount();

        await expect(service.fromVideoStream(Readable.from([Buffer.from('nu e un video')]))).rejects.toBeInstanceOf(ThumbnailToolMissingError);

        expect(temporaryDirectoryCount()).toBe(before);
    });
});

function temporaryDirectoryCount(): number {
    return readdirSync(tmpdir()).filter((name) => name.startsWith('itbridge-thumb-')).length;
}
