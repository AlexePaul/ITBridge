import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { SessionService } from './session.service';
import { EmailConfirmationService } from './email-confirmation.service';
import { EntitiesModule } from 'src/entities/entities.module';
import { MailModule } from 'src/modules/mail/mail.module';

/**
 * `EntitiesModule` replaces the two-entity `forFeature` this module used to carry: registration now
 * writes a `Profile` and an `EmailConfirmation` alongside the `User`, and listing four entities by
 * hand is the pattern the shared module exists to end.
 *
 * `MailModule` is here for the confirmation link and the "a family is waiting" notice. What gets
 * injected is `OutboxService`, never `MailService` — the queue is the contract, so a provider
 * outage can never fail a registration.
 */
@Module({
    imports: [EntitiesModule, MailModule, JwtModule.register({})],
    providers: [AuthService, SessionService, EmailConfirmationService, AuthGuard],
    controllers: [AuthController],
    exports: [EmailConfirmationService],
})
export class AuthModule {}
