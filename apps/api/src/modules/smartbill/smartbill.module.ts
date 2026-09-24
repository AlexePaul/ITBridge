import { Module } from '@nestjs/common';
import { SmartBillService } from './smartbill.service';

/**
 * SmartBill, on its own, like `storage`: invoices are the first caller (E16/S2) and payments the
 * next (the receipts of S5 and S6), and a client that lived inside the invoice module would have to
 * be moved the day the second one arrived — exactly what happened to `S3Service`.
 *
 * No controller: nothing here is reachable over HTTP. What SmartBill is asked, and when, is decided
 * by the module that owns the record; this one only knows how to ask.
 */
@Module({
    providers: [SmartBillService],
    exports: [SmartBillService],
})
export class SmartBillModule {}
