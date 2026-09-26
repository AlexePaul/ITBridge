import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  CreateDiscountDto,
  Discount,
  FamilyDiscount,
  ReferralReward,
  UpdateDiscountDto,
} from "~/types/discount.types";

/**
 * The discounts an admin grants by hand — E15/S5. Admin only, the API enforces it — except
 * `fetchFamilyDiscounts`, which is the signed-in family's own list (terms §11.4).
 */
export const useDiscountsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchDiscounts = async () =>
    api<Discount[]>("/discounts", { method: "GET", headers: auth() });

  /** The signed-in family's own discounts, newest month first — terms §11.4: „Le vezi în portal". */
  const fetchFamilyDiscounts = async () =>
    api<FamilyDiscount[]>("/discounts/family", { method: "GET", headers: auth() });

  const createDiscount = async (dto: CreateDiscountDto) =>
    api<Discount>("/discounts", { method: "POST", headers: auth(), body: dto });

  /**
   * The referral reward — E20/S5: half off, one month per press, in both directions.
   *
   * No month goes over the wire in either direction. The server works out which one is next, on the
   * school's clock, because a second place that knows what „next month" means is a second place
   * that can be wrong about it — and the two would disagree for about two hours every first of the
   * month. All three answer with the whole reward, so a screen renders from the response instead of
   * guessing the new state from the old one plus the press.
   */
  const fetchReferralReward = async (parentId: number) =>
    api<ReferralReward>(`/discounts/referral/${parentId}`, { method: "GET", headers: auth() });

  const grantReferralMonth = async (parentId: number) =>
    api<ReferralReward>("/discounts/referral", {
      method: "POST",
      headers: auth(),
      body: { parentId },
    });

  const revokeReferralMonth = async (parentId: number) =>
    api<ReferralReward>(`/discounts/referral/${parentId}`, { method: "DELETE", headers: auth() });

  const updateDiscount = async (id: number, dto: UpdateDiscountDto) =>
    api<Discount>(`/discounts/${id}`, { method: "PUT", headers: auth(), body: dto });

  const deleteDiscount = async (id: number) =>
    api<void>(`/discounts/${id}`, { method: "DELETE", headers: auth() });

  return {
    fetchDiscounts,
    fetchFamilyDiscounts,
    createDiscount,
    fetchReferralReward,
    grantReferralMonth,
    revokeReferralMonth,
    updateDiscount,
    deleteDiscount,
  };
};
