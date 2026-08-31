import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailModule } from 'src/modules/mail/mail.module';
import { StorageModule } from 'src/modules/storage/storage.module';
import { ProjectController } from './project.controller';
import { AgentController } from './agent.controller';
import { ProjectService } from './project.service';
import { ProjectDeliveryService } from './project-delivery.service';
import { ProjectArchiveService } from './project-archive.service';
import { AgentService } from './agent.service';
import { ThumbnailService } from './thumbnail.service';

/**
 * E14: a child's work, from a folder on a network share to that child's parent.
 *
 * Two controllers because there are two audiences — a Windows service in the office, and the screens
 * an admin and a parent use — and four services because the jobs are genuinely different: what a
 * document *is*, what leaves the building, what a parent takes home, and what the agent needs.
 *
 * `MailModule` for `OutboxService`: the send writes messages into the queue inside its own
 * transaction and never calls the provider. `StorageModule` for the bucket. The dependencies point
 * this way round on purpose — projects know they have something to say, and neither mail nor storage
 * has ever heard of a project.
 */
@Module({
    imports: [EntitiesModule, JwtModule.register({}), MailModule, StorageModule],
    controllers: [ProjectController, AgentController],
    providers: [ProjectService, ProjectDeliveryService, ProjectArchiveService, AgentService, ThumbnailService, AuthGuard, RolesGuard],
    exports: [ProjectService],
})
export class ProjectModule {}
