import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { PaymentModule } from 'src/modules/payment/payment.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

/**
 * Reconciliation — E16/S8's bank statement half. Its own module because it owns its own rows (the
 * statement lines) and asks two others: the arrears list for what is still owed, the payment
 * service for the one door money comes in by. The SmartBill half of S8 stays with the invoices
 * it reads.
 */
@Module({
    imports: [EntitiesModule, JwtModule.register({}), InvoiceModule, PaymentModule],
    controllers: [ReconciliationController],
    providers: [ReconciliationService, AuthGuard, RolesGuard],
})
export class ReconciliationModule {}
