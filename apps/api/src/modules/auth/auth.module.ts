import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { SessionService } from './session.service';
import { EmailConfirmationService } from './email-confirmation.service';
import { PasswordResetService } from './password-reset.service';
import { EntitiesModule } from 'src/entities/entities.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { AccountClaimService } from './account-claim.service';

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
    // `AuditModule` for the account-claim link (E11 S2, review of 26 September 2026): the office
    // sending a way into a family, and the family creating an account on the office's row, are both
    // decisions about access, and the trail records them where they happen.
    imports: [EntitiesModule, MailModule, AuditModule, JwtModule.register({})],
    providers: [AuthService, SessionService, EmailConfirmationService, PasswordResetService, AccountClaimService, AuthGuard],
    controllers: [AuthController],
    exports: [EmailConfirmationService, AccountClaimService],
})
export class AuthModule {}
