import type { ISODate } from './common';
import type { Invoice } from './invoice';

export interface Payment {
    id: number;
    invoice: Invoice;
    method: string;
    date: ISODate;
}

export interface CreatePaymentDto {
    invoiceId: number;
    method?: string;
    date: ISODate;
}

export interface UpdatePaymentDto {
    method?: string;
    date?: ISODate;
}

export interface FilterPaymentDto {
    invoiceId?: number;
    dateFrom?: ISODate;
    dateTo?: ISODate;
}
