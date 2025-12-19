import { Module } from '@nestjs/common';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parent } from 'src/entities/parent.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Parent])],
    controllers: [ParentController],
    providers: [ParentService],
})
export class ParentModule {}
