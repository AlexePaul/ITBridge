export default interface InvoiceTableElement {
  id: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  name: string;
  amount: number;
}