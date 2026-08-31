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
import { Enrollment } from 'src/entities/enrollment.entity';
import { StorageModule } from 'src/modules/storage/storage.module';

@Module({
    // `Enrollment` because the amount counts children *actively enrolled*, not children on file:
    // a trial is free (E11/S4) and a child in no group is not attending.
    //
    // `StorageModule` because `S3Service` is no longer only about invoices — E14 stores children's
    // project files through the same client.
    imports: [TypeOrmModule.forFeature([Invoice, Payment, Profile, Discount, Enrollment]), JwtModule.register({}), StorageModule],
    controllers: [InvoiceController],
    providers: [InvoiceService, PdfService, AuthGuard, RolesGuard],
})
export class InvoiceModule {}
