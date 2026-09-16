import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { backdropOf, currentCostume, openZip, parseProject, placeSprite, Sb3Target, STAGE_HEIGHT, STAGE_WIDTH, visibleSprites, ZipArchive } from './sb3';

/**
 * A small picture of the work, for the group screen and for the parent's email. E14/S3a.
 *
 * It matters more than it used to. The admin who decides what leaves the building decides by
 * looking, and a list of file names is not a review — a document belonging to another child is
 * obvious in a picture and invisible in `proiect_final.png`.
 *
 * **Failing here must never fail an upload.** A project without a thumbnail is far better than a
 * project that did not upload, so everything below returns `null` rather than throwing, and the
 * caller carries on.
 *
 * Three kinds of file, one output. An image is resized here and now, because the bytes are already
 * in hand; a video frame costs an ffmpeg subprocess and a `.sb3` costs a ZIP and a composite, so
 * both of those are asked for by `ProjectThumbnailJob` rather than by the request that ingests —
 * E14/S3b is explicit that extraction must not sit in the request, and a video never passes through
 * this process at all. Everything ends on `fromImage`: one size, one quality ladder, one ceiling,
 * and the same re-encoding that means what leaves here is a picture sharp produced rather than a
 * file somebody supplied.
 */

/** The long edge, in pixels. Big enough to recognise the work, small enough to attach to an email. */
export const THUMBNAIL_MAX_EDGE = 480;

/**
 * The size the finished thumbnail has to fit under, because it is attached to an email rather than
 * linked. E14/S4 puts the ceiling at ~100KB; the quality ladder below is how it gets there without
 * anybody having to guess a single quality number that works for both a screenshot of code and a
 * photograph of a robot.
 */
export const THUMBNAIL_MAX_BYTES = 100 * 1024;

const QUALITY_LADDER = [80, 65, 50, 35];

/**
 * Refuse to even decode something this large. A decompression bomb is a small file that becomes an
 * enormous bitmap, and the process it would exhaust is the one holding the database connection.
 */
export const THUMBNAIL_MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** How long a resize may take before it is abandoned. Sharp is fast; anything slower is pathological. */
export const THUMBNAIL_TIMEOUT_MS = 5_000;

/**
 * Longer than a resize, because a Scratch project is up to two dozen composites of assets that were
 * drawn by children rather than exported by a camera. Still a ceiling: this runs in the job, and the
 * job holds a database connection while it does.
 */
export const SCRATCH_TIMEOUT_MS = 15_000;

/** Long enough for a decoder to find one frame in a large file, short enough to notice a stuck one. */
export const VIDEO_TIMEOUT_MS = 20_000;

/**
 * A second in, then the very first frame. Fades and auto-exposure make opening frames black often
 * enough that "the first frame" is a worse default than it sounds, and a clip shorter than a second
 * is what the fallback is for.
 */
export const VIDEO_SEEK_SECONDS = [1, 0];

/**
 * The same guards `encode` puts on an uploaded image, applied to every asset inside a `.sb3`.
 *
 * The archive comes off the same network share as everything else here, and a vector costume is a
 * text file that declares its own size: `width="40000"` is four characters that ask for a bitmap the
 * process cannot hold. `failOn: 'error'` is the other half — half a costume drawn onto the stage
 * would be a picture of something that does not exist.
 */
const ASSET_LIMITS = { failOn: 'error', limitInputPixels: 50_000_000 } as const;

/**
 * On `PATH`, like every other tool the instance provides, unless the host puts it elsewhere.
 *
 * Read on each call rather than once at import: a constant frozen at module load cannot be pointed
 * at a stub, and the two cases worth testing here — a frame comes back, and there is no ffmpeg at
 * all — are precisely the ones that need the real `spawn`.
 */
export function ffmpegBinary(): string {
    return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

@Injectable()
export class ThumbnailService {
    private readonly logger = new Logger('Thumbnail');

    /**
     * Turns an uploaded image into a JPEG small enough to mail. Returns `null` when it cannot, for
     * any reason at all.
     *
     * The result is always JPEG, including when the input was a PNG: transparency is meaningless at
     * this size and PNG screenshots of code are several times larger than the same picture as JPEG,
     * which is the difference between an attachment that fits under the ceiling and one that does
     * not.
     *
     * Re-encoding has a second effect worth naming, since the bytes come off a share anyone in the
     * school can write to: what leaves here is a picture sharp produced, not a file somebody
     * supplied. A polyglot that is both a valid image and something else does not survive the trip.
     */
    async fromImage(bytes: Buffer): Promise<Buffer | null> {
        if (bytes.length > THUMBNAIL_MAX_INPUT_BYTES) {
            this.logger.warn(`Input of ${bytes.length} bytes is past the thumbnailing limit; the project keeps its file and gets no thumbnail.`);
            return null;
        }

        try {
            return await withTimeout(this.encode(bytes), THUMBNAIL_TIMEOUT_MS);
        } catch (error: unknown) {
            // Includes the timeout, an image sharp cannot read, and a format built without support.
            // None of them is a reason to reject the child's work.
            this.logger.warn(`Could not make a thumbnail: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Down to the size ceiling by quality, not by shrinking further.
     *
     * A 480px thumbnail that is unreadable is worse than no thumbnail, and dropping the long edge is
     * what makes it unreadable first; JPEG quality degrades far more gracefully at this size. The
     * ladder stops at the first rung that fits, so an ordinary screenshot pays nothing for the
     * existence of the lower rungs.
     */
    private async encode(bytes: Buffer): Promise<Buffer | null> {
        // `failOn: 'error'` rather than the default: a truncated file that decodes to half a picture
        // would otherwise become a thumbnail that is half grey, and half a picture of the wrong
        // thing is exactly what the reviewing admin must not be shown.
        const pipeline = sharp(bytes, { failOn: 'error', limitInputPixels: 50_000_000 })
            .rotate() // honours the EXIF orientation before it is stripped, so phone photos are not sideways
            .resize({ width: THUMBNAIL_MAX_EDGE, height: THUMBNAIL_MAX_EDGE, fit: 'inside', withoutEnlargement: true });

        for (const quality of QUALITY_LADDER) {
            const encoded = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
            if (encoded.length <= THUMBNAIL_MAX_BYTES) {
                return encoded;
            }
        }

        // Everything on the ladder was still too big. Rare — a 480px JPEG at quality 35 is tiny —
        // and the honest answer is no thumbnail rather than an attachment that bloats the email.
        this.logger.warn('Image would not fit under the thumbnail size ceiling at any quality; leaving the project without one.');
        return null;
    }

    /**
     * A frame out of an uploaded video, by path rather than by buffer. E14/S3b.
     *
     * **By path because the file is up to 200MB.** Video takes the signed-URL road precisely so that
     * it never sits in this process's memory; reading it back into a buffer to make a picture of it
     * would undo that in the one place that has no reason to.
     *
     * A second past the start, then the very first frame if that overshoots the whole clip. Opening
     * frames are routinely black — a fade-in, a lens still adjusting — and a black rectangle is
     * indistinguishable on the review screen from a thumbnail that failed.
     *
     * Throws `ThumbnailToolMissingError` when there is no ffmpeg on the host, and only then. That is
     * not this video's answer, it is the host's, and the caller must be able to tell the two apart:
     * the outbox learned the same lesson the expensive way when a deployment without a provider key
     * spent every message's attempts on a failure no message could have avoided.
     */
    async fromVideoFile(path: string): Promise<Buffer | null> {
        for (const seek of VIDEO_SEEK_SECONDS) {
            const frame = await this.extractFrame(path, seek);
            if (frame && frame.length > 0) {
                return this.fromImage(frame);
            }
        }

        this.logger.warn(`No frame could be read out of ${path}; the project keeps its video and gets no thumbnail.`);
        return null;
    }

    /**
     * The same frame, from a stream rather than a path — which is how the object actually arrives.
     *
     * The file lands in a temporary directory first because ffmpeg has to seek, and seeking is the
     * whole reason `-ss` before `-i` is cheap; feeding a stream in on stdin would make it decode the
     * clip from the beginning instead. The directory is removed on every road out, including the one
     * where the tool is missing entirely.
     */
    async fromVideoStream(stream: Readable): Promise<Buffer | null> {
        const directory = await mkdtemp(join(tmpdir(), 'itbridge-thumb-'));
        const file = join(directory, 'video');
        try {
            await pipeline(stream, createWriteStream(file));
            return await this.fromVideoFile(file);
        } finally {
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    /**
     * A picture of a Scratch project, composed from the file itself. E14/S3b.
     *
     * The spike this story asked for is written up in `sb3.ts`, and the answer was yes: a `.sb3` is
     * a ZIP holding `project.json` and the assets it names, which is enough to draw the stage as the
     * child last saved it. What this adds to that is the drawing, and the one part of it that is not
     * arithmetic — **a sprite is clipped to the stage before it is composited**. Scratch lets a
     * sprite hang off the edge and children park them there constantly; sharp refuses an overlay
     * that does not fit inside its canvas, so an uncropped one would not produce a lopsided picture,
     * it would produce no picture at all.
     */
    async fromScratchProject(bytes: Buffer): Promise<Buffer | null> {
        try {
            return await withTimeout(this.renderScratchProject(bytes), SCRATCH_TIMEOUT_MS);
        } catch (error: unknown) {
            // A damaged archive, a `project.json` that is not one, a costume sharp cannot read: all
            // of them mean no thumbnail, and none of them means the child's work is not stored.
            this.logger.warn(`Could not draw a Scratch project: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    private async renderScratchProject(bytes: Buffer): Promise<Buffer | null> {
        const archive = openZip(bytes);
        const manifest = archive.read('project.json');
        if (!manifest) return null;
        const project = parseProject(manifest);

        // White, because that is what the Scratch editor shows behind a project with no backdrop —
        // not transparent, which would come out black in a JPEG.
        let stage = sharp({ create: { width: STAGE_WIDTH, height: STAGE_HEIGHT, channels: 4, background: '#ffffff' } });
        let drewSomething = false;

        const backdrop = backdropOf(project);
        const backdropBytes = backdrop?.md5ext ? archive.read(backdrop.md5ext) : null;
        if (backdropBytes) {
            // `fill`: a backdrop is the stage by definition, whatever its stored resolution, so this
            // is a resolution change rather than a crop.
            stage = sharp(await sharp(backdropBytes, ASSET_LIMITS).resize(STAGE_WIDTH, STAGE_HEIGHT, { fit: 'fill' }).png().toBuffer());
            drewSomething = true;
        }

        const layers: sharp.OverlayOptions[] = [];
        for (const sprite of visibleSprites(project)) {
            const layer = await this.drawSprite(sprite, archive);
            if (layer) layers.push(layer);
        }

        if (!drewSomething && layers.length === 0) {
            // A project with no backdrop and nothing visible on the stage. A blank white rectangle
            // would be a worse answer than none: it says the upload produced something to look at.
            return null;
        }

        return this.fromImage(await stage.composite(layers).png().toBuffer());
    }

    private async drawSprite(sprite: Sb3Target, archive: ZipArchive): Promise<sharp.OverlayOptions | null> {
        const costume = currentCostume(sprite);
        if (!costume?.md5ext) return null;
        const costumeBytes = archive.read(costume.md5ext);
        if (!costumeBytes) return null;

        const metadata = await sharp(costumeBytes, ASSET_LIMITS).metadata();
        const placement = placeSprite(sprite, metadata.width ?? 0, metadata.height ?? 0);
        if (!placement || !metadata.width || !metadata.height) return null;

        const left = Math.max(0, placement.left);
        const top = Math.max(0, placement.top);
        const right = Math.min(STAGE_WIDTH, placement.left + placement.width);
        const bottom = Math.min(STAGE_HEIGHT, placement.top + placement.height);
        if (right <= left || bottom <= top) {
            // Entirely off the stage. Scratch keeps such a sprite; the picture of the stage does not.
            return null;
        }

        let drawn = sharp(costumeBytes, ASSET_LIMITS).resize(placement.width, placement.height, { fit: 'fill' });
        if (placement.flip) drawn = drawn.flop();

        const clipped = await sharp(await drawn.png().toBuffer())
            .extract({ left: left - placement.left, top: top - placement.top, width: right - left, height: bottom - top })
            .png()
            .toBuffer();

        return { input: clipped, left, top };
    }

    /**
     * One frame, on stdout, as PNG — never a file ffmpeg writes somewhere.
     *
     * `-ss` before `-i` so the seek happens on the container rather than by decoding everything up
     * to that point, `-nostdin` so a subprocess can never end up waiting on a terminal that is not
     * there, and a kill after the timeout because a malformed file can keep a decoder busy for a
     * very long time.
     */
    private extractFrame(path: string, seekSeconds: number): Promise<Buffer | null> {
        const args = [
            '-nostdin',
            '-loglevel',
            'error',
            '-ss',
            String(seekSeconds),
            '-i',
            path,
            '-frames:v',
            '1',
            '-an',
            '-f',
            'image2',
            '-c:v',
            'png',
            'pipe:1',
        ];

        return new Promise((resolve, reject) => {
            const binary = ffmpegBinary();
            const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            const chunks: Buffer[] = [];
            let stderr = '';
            let settled = false;

            // `finish` closes over a timer declared below it, and that is safe for one reason worth
            // stating: nothing calls it synchronously. `spawn` emits `error` on the next tick even
            // when the binary does not exist, so by the time any of the three roads out runs, the
            // timer is assigned.
            const finish = (outcome: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                outcome();
            };

            const timer = setTimeout(() => {
                child.kill('SIGKILL');
                finish(() => {
                    this.logger.warn(`ffmpeg took longer than ${VIDEO_TIMEOUT_MS}ms on ${path}; giving up on the frame.`);
                    resolve(null);
                });
            }, VIDEO_TIMEOUT_MS);

            child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
            child.stderr.on('data', (chunk: Buffer) => {
                // Bounded: a decoder complaining once per frame would otherwise be held in memory in
                // full, which is the failure this whole road exists to avoid.
                if (stderr.length < 4000) stderr += chunk.toString('utf8');
            });

            child.on('error', (error: NodeJS.ErrnoException) => {
                finish(() => {
                    if (error.code === 'ENOENT') {
                        reject(new ThumbnailToolMissingError(binary));
                        return;
                    }
                    this.logger.warn(`ffmpeg could not be run: ${error.message}`);
                    resolve(null);
                });
            });

            child.on('close', (code) => {
                finish(() => {
                    if (code !== 0) {
                        this.logger.warn(`ffmpeg exited ${String(code)} on ${path}: ${stderr.trim()}`);
                        resolve(null);
                        return;
                    }
                    resolve(Buffer.concat(chunks));
                });
            });
        });
    }
}

/**
 * There is no ffmpeg on this host.
 *
 * Separate from every other failure because it is the only one where trying again later is the
 * right thing to do: the video is fine, the tool is missing, and the missing tool is a deployment
 * step rather than a property of the file. `ProjectThumbnailJob` leaves such a project unstamped so
 * that the whole backlog drains the first time the job runs on a host that has ffmpeg.
 */
export class ThumbnailToolMissingError extends Error {
    constructor(binary: string) {
        super(`${binary} is not installed on this host`);
    }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
        work.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
}
