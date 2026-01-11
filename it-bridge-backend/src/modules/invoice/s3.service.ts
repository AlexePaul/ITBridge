import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service implements OnModuleInit {
    private s3Client: S3Client;

    onModuleInit() {
        const region = process.env.AWS_REGION;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

        if (!region || !accessKeyId || !secretAccessKey) {
            throw new Error('Missing AWS configuration. Please set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.');
        }

        this.s3Client = new S3Client({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
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

        for await (const chunk of response.Body as any) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }
}
