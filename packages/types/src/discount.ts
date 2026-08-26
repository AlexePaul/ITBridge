import type { BillingMonth } from './common';

export interface Discount {
    id: number;
    name: string;
    description?: string | null;
    value: number;
    monthIssued: BillingMonth;
}
