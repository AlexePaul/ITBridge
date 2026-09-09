import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ProfileController } from './profile.controller';
import { AuditModule } from 'src/modules/audit/audit.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { User } from 'src/entities/user.entity';

@Module({
    // `AuditModule` because a change to a family's own details leaves a trail — E07/S3. The names
    // of the fields that moved, never their values: those are held under a different retention rule
    // and would outlive the family that owns them.
    // `Child` and `Invoice` alongside `Profile`: deleting a profile cascades into both, so the
    // service has to look before it deletes — see `deleteProfile`.
    // `AuthModule` for `EmailConfirmationService`: changing the address on file closes the
    // confirmation gate behind it and sends a fresh link, which is the job `resendConfirmation`
    // says belongs to this edit. No cycle — `AuthModule` reaches only entities, mail and JWT.
    imports: [TypeOrmModule.forFeature([Profile, Child, Invoice, User]), JwtModule.register({}), AuditModule, AuthModule],
    controllers: [ProfileController],
    providers: [ProfileService, AuthGuard, RolesGuard],
})
export class ProfileModule {}
