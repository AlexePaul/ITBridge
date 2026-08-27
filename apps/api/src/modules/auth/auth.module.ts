import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { Session } from 'src/entities/session.entity';
import { SessionService } from './session.service';

@Module({
    imports: [TypeOrmModule.forFeature([User, Session]), JwtModule.register({})],
    providers: [AuthService, SessionService, AuthGuard],
    controllers: [AuthController],
})
export class AuthModule {}
