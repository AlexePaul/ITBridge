import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from 'src/entities/group.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';

@Module({
    imports: [TypeOrmModule.forFeature([Group]), JwtModule.register({})],
    controllers: [GroupController],
    providers: [GroupService, AuthGuard, RolesGuard],
})
export class GroupModule {}
