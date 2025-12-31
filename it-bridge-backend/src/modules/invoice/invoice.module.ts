import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { Profile } from 'src/entities/profile.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';

@Module({
    imports: [TypeOrmModule.forFeature([Invoice, Payment, Profile]), JwtModule.register({})],
    controllers: [InvoiceController],
    providers: [InvoiceService, AuthGuard, RolesGuard],
})
export class InvoiceModule {}
