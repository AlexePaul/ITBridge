import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AccountApprovalService } from './account-approval.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { MailModule } from 'src/modules/mail/mail.module';

@Module({
    imports: [EntitiesModule, MailModule, JwtModule.register({})],
    controllers: [UserController],
    providers: [UserService, AccountApprovalService, AuthGuard, RolesGuard],
})
export class UserModule {}
