import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from 'src/entities/payment.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';

@Module({
    imports: [TypeOrmModule.forFeature([Payment, Invoice, Profile]), JwtModule.register({})],
    controllers: [PaymentController],
    providers: [PaymentService, AuthGuard, RolesGuard],
})
export class PaymentModule {}
