import { Module } from '@nestjs/common';
import { ChildController } from './child.controller';
import { ChildService } from './child.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { Group } from 'src/entities/group.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Child, Profile, Group]), JwtModule.register({})],
    controllers: [ChildController],
    providers: [ChildService, AuthGuard, RolesGuard],
})
export class ChildModule {}
