import { PaymentFiscalStatus } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { DIVERGENCE_CHECK_EVERY_MS, divergenceOf, dueForCheck, type DivergenceInput } from './fiscal-divergence.rules';

/** When the platform and SmartBill disagree about an invoice — E16/S8. */
describe('divergenceOf', () => {
    const recorded = (amount: number, status = PaymentStatus.SUCCEEDED) => ({ amount, status, fiscalStatus: PaymentFiscalStatus.RECORDED });
    const agreed: DivergenceInput = {
        amount: 350,
        smartbill: { checked: true, total: 350, paid: 350 },
        payments: [recorded(200), recorded(150)],
    };

    it('finds nothing when both sides tell the same story', () => {
        expect(divergenceOf(agreed)).toEqual({ reasons: [], platformPaid: 350, recordedPaid: 350 });
    });

    // A figure read before the platform's latest change would be a false alarm.
    it('does not judge an invoice nobody has read yet', () => {
        expect(divergenceOf({ ...agreed, smartbill: { checked: false, total: null, paid: null } }).reasons).toEqual([]);
    });

    it('says when SmartBill no longer knows the number', () => {
        expect(divergenceOf({ ...agreed, smartbill: { checked: true, total: null, paid: null } }).reasons).toEqual(['missing_in_smartbill']);
    });

    // E15/S7 promised the document matches the platform to the leu.
    it('catches a total edited in SmartBill', () => {
        expect(divergenceOf({ ...agreed, smartbill: { checked: true, total: 300, paid: 350 } }).reasons).toEqual(['total_differs']);
    });

    it('catches money entered or removed by hand in SmartBill', () => {
        expect(divergenceOf({ ...agreed, smartbill: { checked: true, total: 350, paid: 450 } }).reasons).toEqual(['changed_in_smartbill']);
        expect(divergenceOf({ ...agreed, smartbill: { checked: true, total: 350, paid: 200 } }).reasons).toEqual(['changed_in_smartbill']);
    });

    it('names a payment reversed here that is still a collection there', () => {
        const divergence = divergenceOf({ ...agreed, payments: [recorded(200, PaymentStatus.REVERSED), recorded(150)] });

        expect(divergence.reasons).toEqual(['reversed_still_recorded']);
        expect(divergence).toMatchObject({ platformPaid: 150, recordedPaid: 350 });
    });

    it('names money received here that SmartBill refused', () => {
        const divergence = divergenceOf({
            ...agreed,
            smartbill: { checked: true, total: 350, paid: 200 },
            payments: [recorded(200), { amount: 150, status: PaymentStatus.SUCCEEDED, fiscalStatus: PaymentFiscalStatus.FAILED }],
        });

        expect(divergence.reasons).toEqual(['not_recorded']);
    });

    // A lost answer may already be a collection SmartBill counts: its paid figure cannot be judged
    // until a person settles it — and the person is named by `not_recorded`.
    it('does not judge the paid figure while an answer is lost, and says a person is needed', () => {
        const divergence = divergenceOf({
            ...agreed,
            payments: [recorded(200), { amount: 150, status: PaymentStatus.SUCCEEDED, fiscalStatus: PaymentFiscalStatus.REVIEW }],
        });

        expect(divergence.reasons).toEqual(['not_recorded']);
    });

    it('leaves a payment still on its way out of the judgement', () => {
        const divergence = divergenceOf({
            ...agreed,
            smartbill: { checked: true, total: 350, paid: 200 },
            payments: [recorded(200), { amount: 150, status: PaymentStatus.SUCCEEDED, fiscalStatus: PaymentFiscalStatus.PENDING }],
        });

        expect(divergence.reasons).toEqual([]);
    });

    it('compares in bani, so floating lei cannot invent a divergence', () => {
        expect(divergenceOf({ ...agreed, smartbill: { checked: true, total: 350, paid: 0.1 + 0.2 }, payments: [recorded(0.3)] }).reasons).toEqual([]);
    });
});

describe('dueForCheck', () => {
    const now = new Date('2026-11-05T10:00:00Z');

    it('reads what was never read, and what was read a day ago or more', () => {
        expect(dueForCheck(null, now)).toBe(true);
        expect(dueForCheck(new Date(now.getTime() - DIVERGENCE_CHECK_EVERY_MS), now)).toBe(true);
        expect(dueForCheck(new Date(now.getTime() - DIVERGENCE_CHECK_EVERY_MS + 60_000), now)).toBe(false);
    });
});
