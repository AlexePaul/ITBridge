import { Module } from '@nestjs/common';
import { ProfileController } from './profile-public.controller';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ProfileAdminController } from './profile-admin.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Profile]), JwtModule.register({})],
    controllers: [ProfileController, ProfileAdminController],
    providers: [ProfileService, AuthGuard, RolesGuard],
})
export class ProfileModule {}
