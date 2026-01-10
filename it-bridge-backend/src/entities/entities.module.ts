import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Profile } from './profile.entity';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { Attendance } from './attendance.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';
import { Discount } from './discount.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, Profile, Child, Group, Attendance, Invoice, Payment, Discount])],
    exports: [TypeOrmModule],
})
export class EntitiesModule {}
