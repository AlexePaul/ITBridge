import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

        const response = await this.s3Client.send(command);
        const chunks: Uint8Array[] = [];

        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }
}
