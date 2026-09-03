import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailModule } from 'src/modules/mail/mail.module';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';

/**
 * Announcements — E17/S7.
 *
 * A module of its own rather than a third controller inside `mail`, for the reason `project` is not
 * inside it either: `mail` is the channel, and everything that sends is a feature that uses it.
 * What comes back the other way — `MailModule` exporting `OutboxService` — is the only dependency.
 */
@Module({
    imports: [EntitiesModule, MailModule, JwtModule.register({})],
    controllers: [AnnouncementController],
    providers: [AnnouncementService, AuthGuard, RolesGuard],
})
export class AnnouncementModule {}
