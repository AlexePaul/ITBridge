export interface Payment {
  id: number;
  invoice: {
    id: number;
    amount: number;
    dateIssued: string;
    monthIssued: string;
    status: string;
    parent: {
      firstName: string;
      lastName: string;
    };
  };
  method: string;
  date: string;
}

export interface CreatePaymentDto {
  invoiceId: number;
  method?: string;
  date: string;
}

export interface UpdatePaymentDto {
  method?: string;
  date?: string;
}

export interface FilterPaymentDto {
  invoiceId?: number;
  dateFrom?: string;
  dateTo?: string;
}
