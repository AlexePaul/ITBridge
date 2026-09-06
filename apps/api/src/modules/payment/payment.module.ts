import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from 'src/entities/payment.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { MailModule } from 'src/modules/mail/mail.module';

@Module({
    // `MailModule` because a recorded payment now confirms itself to the family — E16/S6. What is
    // injected is `OutboxService`, never `MailService`: the queue is the contract, so a receipt
    // cannot be lost to a provider being down at the moment the money was entered.
    imports: [TypeOrmModule.forFeature([Payment, Invoice]), JwtModule.register({}), MailModule],
    controllers: [PaymentController],
    providers: [PaymentService, AuthGuard, RolesGuard],
})
export class PaymentModule {}
