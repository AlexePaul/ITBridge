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
import { PdfService } from './pdf.service';
import { Discount } from 'src/entities/discount.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Invoice, Payment, Profile, Discount]), JwtModule.register({})],
    controllers: [InvoiceController],
    providers: [InvoiceService, PdfService, AuthGuard, RolesGuard],
})
export class InvoiceModule {}
