import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Parent } from './parent.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, Parent])],
    exports: [TypeOrmModule],
})
export class EntitiesModule {}
