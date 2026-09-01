import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { CreateDiscountDto, Discount, UpdateDiscountDto } from "~/types/discount.types";

/** The discounts an admin grants by hand — E15/S5. Admin only, the API enforces it. */
export const useDiscountsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchDiscounts = async () =>
    api<Discount[]>("/discounts", { method: "GET", headers: auth() });

  const createDiscount = async (dto: CreateDiscountDto) =>
    api<Discount>("/discounts", { method: "POST", headers: auth(), body: dto });

  const updateDiscount = async (id: number, dto: UpdateDiscountDto) =>
    api<Discount>(`/discounts/${id}`, { method: "PUT", headers: auth(), body: dto });

  const deleteDiscount = async (id: number) =>
    api<void>(`/discounts/${id}`, { method: "DELETE", headers: auth() });

  return { fetchDiscounts, createDiscount, updateDiscount, deleteDiscount };
};
