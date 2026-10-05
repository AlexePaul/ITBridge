import type { Payment } from 'src/entities/payment.entity';
import { invoiceForParent } from 'src/modules/invoice/invoice-for-parent';

/**
 * What a family reads of its own payment: the money and the receipt, not the office's note nor the
 * fiscal queue's state. The note is where reconciliation writes the transfer's own text ("plata
 * martie Maria Pop") and where the office writes what it wants to remember; it went to the parent
 * with every payment (security pass of 27 September 2026). The invoice joined to the payment goes
 * through `invoiceForParent`, for the same reason.
 */
export function paymentForParent(payment: Payment): Payment {
    return {
        ...payment,
        notes: null,
        fiscalStatus: null,
        fiscalAttempts: 0,
        fiscalNextAttemptAt: null,
        fiscalExpectedPaid: null,
        fiscalExpectedNumber: null,
        fiscalLastError: null,
        invoice: payment.invoice ? invoiceForParent(payment.invoice) : payment.invoice,
    };
}
