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
import { ArrearsService } from './arrears.service';
import { ArrearsJob } from './arrears.job';
import { MailModule } from 'src/modules/mail/mail.module';
import { Enrollment } from 'src/entities/enrollment.entity';
import { StorageModule } from 'src/modules/storage/storage.module';
import { ClassSession } from 'src/entities/class-session.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { BillableSessionsService } from './billable-sessions.service';

@Module({
    // `Enrollment` because the amount counts children *actively enrolled*, not children on file:
    // a trial is free (E11/S4) and a child in no group is not attending.
    //
    // `StorageModule` because `S3Service` is no longer only about invoices — E14 stores children's
    // project files through the same client.
    //
    // `ClassSession` and `Attendance` because since E15/S9 the amount is counted from the month's
    // registers, not typed: `BillableSessionsService` is the one query that reads them.
    imports: [
        TypeOrmModule.forFeature([Invoice, Payment, Profile, Discount, Enrollment, ClassSession, Attendance]),
        JwtModule.register({}),
        StorageModule,
        MailModule,
    ],
    controllers: [InvoiceController],
    providers: [InvoiceService, BillableSessionsService, PdfService, ArrearsService, ArrearsJob, AuthGuard, RolesGuard],
    // The overview screen asks the arrears question rather than re-deriving it — one definition.
    exports: [ArrearsService],
})
export class InvoiceModule {}
