import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Profile } from './profile.entity';
import { Child } from './child.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, Profile, Child])],
    exports: [TypeOrmModule],
})
export class EntitiesModule {}
