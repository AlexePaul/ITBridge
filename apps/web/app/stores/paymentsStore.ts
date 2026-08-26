import { defineStore } from "pinia";
import { ref, readonly } from "vue";
import type { Payment } from "~/types/payment.types";

export const usePaymentsStore = defineStore("payment", () => {
  const payments = ref<Payment[]>([]);
  const selectedPayment = ref<Payment | null>(null);

  const setPayments = (data: Payment[]) => {
    payments.value = data;
  };

  const addPayment = (payment: Payment) => {
    payments.value.push(payment);
  };

  const updatePaymentInStore = (id: number, updatedPayment: Partial<Payment>) => {
    const index = payments.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      payments.value[index] = { ...payments.value[index], ...updatedPayment } as Payment;
    }
  };

  const removePayment = (id: number) => {
    payments.value = payments.value.filter((p) => p.id !== id);
  };

  const setSelectedPayment = (payment: Payment | null) => {
    selectedPayment.value = payment;
  };

  const clearPayments = () => {
    payments.value = [];
    selectedPayment.value = null;
  };

  return {
    payments: readonly(payments),
    selectedPayment: readonly(selectedPayment),
    setPayments,
    addPayment,
    updatePaymentInStore,
    removePayment,
    setSelectedPayment,
    clearPayments,
  };
});
