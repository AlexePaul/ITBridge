import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

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
 * Images only, which is most of what arrives. A frame out of a video needs ffmpeg on a host that
 * does not exist yet (E01/S4) and belongs in a queued job rather than in the request that ingests —
 * a synchronous extraction would block the event loop on every upload. Whether a `.sb3` can give up
 * a stage image at all is an open question with its own answer to write down. Both are E14/S3b.
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
