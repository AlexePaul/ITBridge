import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, GetObjectCommandOutput, HeadBucketCommand, NoSuchKey } from '@aws-sdk/client-s3';

/** Thrown when the object simply is not there, so callers can answer 404 instead of 500. */
export class ObjectNotFoundError extends Error {
    constructor(public readonly key: string) {
        super(`Object not found: ${key}`);
        this.name = 'ObjectNotFoundError';
    }
}

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

    async uploadFile(fileBuffer: Buffer, fileName: string, bucket: string = process.env.AWS_S3_BUCKET ?? '') {
        if (!this.s3Client) {
            throw new Error('S3 client not initialized');
        }
        if (!bucket) {
            throw new Error('AWS_S3_BUCKET environment variable is not set');
        }

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: fileName,
            Body: fileBuffer,
            ContentType: 'application/pdf',
        });
        return this.s3Client.send(command);
    }

    async downloadFile(fileName: string, bucket: string = process.env.AWS_S3_BUCKET ?? ''): Promise<Buffer> {
        if (!this.s3Client) {
            throw new Error('S3 client not initialized');
        }
        if (!bucket) {
            throw new Error('AWS_S3_BUCKET environment variable is not set');
        }

        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: fileName,
        });

        let response: GetObjectCommandOutput;
        try {
            response = await this.s3Client.send(command);
        } catch (error: unknown) {
            // A key that is not there is not a fault of ours. Reported as a bare 500 it told the
            // caller the server had broken and wrote a stack into the channel reserved for real
            // faults - the same reasoning `AllExceptionsFilter` already applies to Postgres 22P02.
            if (error instanceof NoSuchKey || (error as { name?: string })?.name === 'NoSuchKey') {
                throw new ObjectNotFoundError(fileName);
            }
            throw error;
        }

        const chunks: Uint8Array[] = [];

        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
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
}
