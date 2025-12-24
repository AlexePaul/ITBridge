import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Profile } from './profile.entity';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { Attendance } from './attendance.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, Profile, Child, Group, Attendance])],
    exports: [TypeOrmModule],
})
export class EntitiesModule {}
