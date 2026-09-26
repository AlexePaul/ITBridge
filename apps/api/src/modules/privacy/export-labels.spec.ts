import { exportLabel } from './export-labels';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { InvoiceStatus } from 'src/entities/invoice.entity';

/** QA of 26 September 2026: the export's values were database codes a family cannot read. */
describe('exportLabel', () => {
    it('says the codes a family meets in Romanian', () => {
        expect(exportLabel('approval', ApprovalStatus.APPROVED)).toBe('aprobat');
        expect(exportLabel('payment', PaymentStatus.SUCCEEDED)).toBe('încasată');
        expect(exportLabel('paymentMethod', PaymentMethod.BANK_TRANSFER)).toBe('transfer bancar');
        expect(exportLabel('invoice', InvoiceStatus.OVERDUE)).toBe('restantă');
    });

    it('has a word for every value of the enums it covers, so a new value is noticed here', () => {
        const check = (kind: Parameters<typeof exportLabel>[0], values: string[]) =>
            values.forEach((value) => expect({ value, label: exportLabel(kind, value) }).not.toEqual({ value, label: value }));
        check('enrollment', Object.values(EnrollmentStatus));
        check('waitlist', Object.values(WaitlistStatus));
        check('lead', Object.values(LeadStatus));
        check('leadSource', Object.values(LeadSource));
        check('payment', Object.values(PaymentStatus));
        check('invoice', Object.values(InvoiceStatus));
    });

    it('passes an unknown code through, and keeps null as null', () => {
        expect(exportLabel('payment', 'something_new')).toBe('something_new');
        expect(exportLabel('role', null)).toBeNull();
    });
});
