export interface Invoice {
  id: number;
  amount: number;
  dateIssued: string;
  status: "pending" | "paid" | "overdue";
  monthIssued: string;
  parent?: {
    firstName: string;
    lastName: string;
  };
}
