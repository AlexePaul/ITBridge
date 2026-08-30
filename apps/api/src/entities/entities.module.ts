import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Profile } from './profile.entity';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { Attendance } from './attendance.entity';
import { ClassSession } from './class-session.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';
import { Discount } from './discount.entity';
import { Session } from './session.entity';
import { Location } from './location.entity';
import { Room } from './room.entity';
import { OutboxMessage } from './outbox-message.entity';
import { EmailConfirmation } from './email-confirmation.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Profile,
            Child,
            Group,
            Attendance,
            ClassSession,
            Invoice,
            Payment,
            Discount,
            Session,
            Location,
            Room,
            OutboxMessage,
            EmailConfirmation,
        ]),
    ],
    exports: [TypeOrmModule],
})
export class EntitiesModule {}
