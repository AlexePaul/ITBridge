import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { ProfileController } from './profile.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Profile]), JwtModule.register({})],
    controllers: [ProfileController],
    providers: [ProfileService, AuthGuard, RolesGuard],
})
export class ProfileModule {}
