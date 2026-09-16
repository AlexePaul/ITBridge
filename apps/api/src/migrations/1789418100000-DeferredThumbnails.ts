import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `projects.thumbnailAttemptedAt` — the whole queue behind E14/S3b.
 *
 * A video and a `.sb3` cannot get their picture in the request that uploads them: the video's bytes
 * never pass through this process, and a Scratch project costs a ZIP and a stack of composites. So
 * `ProjectThumbnailJob` looks for what is still missing one, and "still missing one" is this column
 * together with `hasThumbnail`: no picture, and nobody has tried.
 *
 * Nullable with no backfill and no default, deliberately. Every project that exists today has been
 * through ingestion without anybody asking it for a video frame or a stage drawing, so a null here
 * is exactly right for all of them — the ones that can produce a picture will, on the first tick
 * after this deploys, and the images already have theirs.
 */
export class DeferredThumbnails1789418100000 implements MigrationInterface {
    name = 'DeferredThumbnails1789418100000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ADD "thumbnailAttemptedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "thumbnailAttemptedAt"`);
    }
}
