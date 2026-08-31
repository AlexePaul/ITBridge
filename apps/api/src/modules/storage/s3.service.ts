import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    GetObjectCommandOutput,
    HeadBucketCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    NoSuchKey,
    NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

/**
 * The only place the application talks to object storage.
 *
 * **It used to live in the invoice module and knew only how to store one kind of file**: every
 * upload went out labelled `application/pdf`, whatever it was, and the client had no delete, no
 * `HeadObject`, no signed URL and no way to move bytes without holding the whole file in memory.
 * E14 needs all four — a `.sb3`, a JPEG and a 200MB video are not PDFs — so the service moved here
 * and grew the operations rather than acquiring a second, project-shaped copy next to it.
 *
 * Nothing else changed for invoices: `invoicePdfKey` still names the object, the bucket is still
 * one bucket, and E14 shares it under the `projects/` prefix beside `invoices/`. A second bucket
 * would promise an isolation nobody collects at this size; the useful separation is the prefix,
 * which an IAM policy can narrow later (E07/S6).
 */

/** Thrown when the object simply is not there, so callers can answer 404 instead of 500. */
export class ObjectNotFoundError extends Error {
    constructor(public readonly key: string) {
        super(`Object not found: ${key}`);
        this.name = 'ObjectNotFoundError';
    }
}

export interface PutObjectInput {
    key: string;
    body: Buffer;
    /**
     * The real type, decided by the caller from the file's magic bytes — never from the name a
     * teacher gave it. Stored objects are served back with the type they were stored under, so a
     * wrong one here is a wrong `Content-Type` on every download that follows.
     */
    contentType: string;
    /** Kept out of the key, which holds identifiers only, but useful on the object for support. */
    metadata?: Record<string, string>;
}

export interface SignedDownloadOptions {
    /** How long the URL stays usable. Short: it is handed to a browser that is about to use it. */
    expiresInSeconds?: number;
    /**
     * The name the browser saves it as. Set on the *signed request*, not on the object, so that the
     * same stored bytes can be offered under the original file name without a copy.
     */
    filename?: string;
    contentType?: string;
}

/**
 * Fifteen minutes. Long enough for a slow connection to finish a download it has already started,
 * short enough that a URL copied out of the network tab is worthless by the time it is pasted
 * anywhere. Signed URLs never travel in an email — E14 attaches the thumbnail instead precisely so
 * that no long-lived URL to a child's work exists.
 */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class S3Service implements OnModuleInit {
    private s3Client: S3Client;

    onModuleInit() {
        const region = process.env.AWS_REGION;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

        // `AWS_S3_ENDPOINT` points the client somewhere other than AWS. Unset in production, where
        // the SDK resolves the real endpoint from the region; set to the local MinIO in development
        // and in CI. Path-style addressing goes with it: MinIO serves buckets as `/bucket/key`
        // rather than as a `bucket.host` subdomain, which has no DNS entry locally.
        const endpoint = process.env.AWS_S3_ENDPOINT;

        if (!region) {
            throw new Error('Missing AWS configuration. Please set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.');
        }

        this.s3Client = new S3Client({
            region,
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
            // Without an explicit pair the SDK falls back to its default credential chain, which in
            // production means the IAM instance role.
            ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
        });
    }

    /**
     * Stores one object under the type it actually is.
     *
     * The previous signature took `(buffer, fileName)` and hardcoded `ContentType: 'application/pdf'`.
     * A `.sb3` stored through it would have been served back to a parent labelled as a PDF, which
     * some browsers act on and all of them display wrongly. The type is now a required argument, so
     * a caller cannot forget to think about it.
     */
    async putObject({ key, body, contentType, metadata }: PutObjectInput) {
        const bucket = this.requireBucket();

        return this.client().send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                ...(metadata ? { Metadata: metadata } : {}),
            }),
        );
    }

    async downloadFile(fileName: string, bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<Buffer> {
        const response = await this.getObject(fileName, bucket);
        const chunks: Uint8Array[] = [];

        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }

    /**
     * The same object, as a stream.
     *
     * The buffered version above is fine for an invoice PDF and wrong for everything E14 stores: the
     * API shares an instance with Postgres, so a 200MB video read into a Buffer is not a slow
     * request, it is a dead process. The archive download and the file proxy both stream.
     */
    async downloadStream(key: string, bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<Readable> {
        const response = await this.getObject(key, bucket);
        return response.Body as Readable;
    }

    /**
     * What the bucket knows about an object without reading it. `null` when there is none.
     *
     * The size is the useful half: an upload that went straight to S3 through a signed URL never
     * passed through this process, so the only honest way to learn how big it turned out is to ask
     * the bucket. The number the client announced beforehand is a claim.
     */
    async headObject(key: string, bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<{ sizeBytes: number; contentType: string | null } | null> {
        try {
            const response = await this.client().send(new HeadObjectCommand({ Bucket: bucket || this.requireBucket(), Key: key }));
            return { sizeBytes: response.ContentLength ?? 0, contentType: response.ContentType ?? null };
        } catch (error: unknown) {
            if (isMissing(error)) return null;
            throw error;
        }
    }

    /**
     * Removes one object. A missing object is a success, not a failure: delete is called to make
     * sure something is gone, and it already is.
     */
    async deleteObject(key: string, bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<void> {
        try {
            await this.client().send(new DeleteObjectCommand({ Bucket: bucket || this.requireBucket(), Key: key }));
        } catch (error: unknown) {
            if (isMissing(error)) return;
            throw error;
        }
    }

    /**
     * A URL the browser can PUT straight to, for uploads too large to pass through this process.
     *
     * The content type is part of the signature, so the upload cannot arrive labelled as something
     * else than what was agreed. Nothing about the bytes can be checked at this point — the whole
     * purpose is that they never reach us — which is why the caller registers the file only after
     * the upload finishes, and why this is reserved for the agent, an authenticated admin client.
     */
    async presignedUploadUrl(key: string, contentType: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<string> {
        const command = new PutObjectCommand({ Bucket: this.requireBucket(), Key: key, ContentType: contentType });
        return getSignedUrl(this.client(), command, { expiresIn: expiresInSeconds });
    }

    /**
     * A short-lived URL for reading one object, issued only after the caller has been shown to be
     * entitled to it.
     *
     * `Content-Disposition: attachment` is set on the signed request rather than left to the
     * object, so a stored file is always saved and never rendered — E14 keeps uploaded files from
     * ever being interpreted by a browser on the school's domain, and a signed URL is the one path
     * that bypasses this application's own response headers.
     */
    async presignedDownloadUrl(key: string, options: SignedDownloadOptions = {}): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.requireBucket(),
            Key: key,
            ResponseContentDisposition: `attachment; filename="${sanitizeFilename(options.filename ?? 'fisier')}"`,
            ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
        });
        return getSignedUrl(this.client(), command, { expiresIn: options.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS });
    }

    /**
     * Cheap reachability probe for `/ready`: HeadBucket is a metadata call, no object is read.
     * Returns false rather than throwing, because the readiness endpoint reports, it does not fail.
     */
    async isReachable(bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<boolean> {
        if (!this.s3Client || !bucket) return false;
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
            return true;
        } catch {
            return false;
        }
    }

    private async getObject(key: string, bucket: string): Promise<GetObjectCommandOutput> {
        const target = bucket || this.requireBucket();

        try {
            return await this.client().send(new GetObjectCommand({ Bucket: target, Key: key }));
        } catch (error: unknown) {
            // A key that is not there is not a fault of ours. Reported as a bare 500 it told the
            // caller the server had broken and wrote a stack into the channel reserved for real
            // faults - the same reasoning `AllExceptionsFilter` already applies to Postgres 22P02.
            if (isMissing(error)) {
                throw new ObjectNotFoundError(key);
            }
            throw error;
        }
    }

    private client(): S3Client {
        if (!this.s3Client) {
            throw new Error('S3 client not initialized');
        }
        return this.s3Client;
    }

    private requireBucket(): string {
        const bucket = process.env.AWS_S3_BUCKET ?? '';
        if (!bucket) {
            throw new Error('AWS_S3_BUCKET environment variable is not set');
        }
        return bucket;
    }
}

/** MinIO answers `NotFound` to HeadObject and `NoSuchKey` to GetObject; AWS is not always consistent either. */
function isMissing(error: unknown): boolean {
    if (error instanceof NoSuchKey || error instanceof NotFound) return true;
    const name = (error as { name?: string })?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

/**
 * Keeps a file name from breaking out of the header it is written into.
 *
 * The name comes from a folder on a network share that anyone in the school can write to, so it is
 * attacker-influenced in the ordinary sense of the word: a quote or a newline in it would end the
 * `filename="…"` parameter early and let the rest be read as further header content.
 */
export function sanitizeFilename(name: string): string {
    const cleaned = name
        .replace(/[\r\n"\\]/g, '')
        .replace(/[/\\]/g, '-')
        .trim();
    return cleaned.slice(0, 200) || 'fisier';
}
