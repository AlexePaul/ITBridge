import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Profile } from "~/types/profile.types";

/**
 * A profile update keeps what its answer does not carry — end-to-end testing, 25 September 2026.
 *
 * `PUT /profiles/:id` answers with the row, not its relations, and the store took the answer whole:
 * one tick of the marketing box on /user/profile and the page said the family had no children, with
 * the per-child consent controls gone beside them, until a reload.
 */

const tokenStore = { accessToken: "acces" };
vi.mock("~/stores/tokenStore", () => ({ useTokenStore: () => tokenStore }));

let answer: Partial<Profile> = {};
vi.mock("~/composables/api/useApi", () => ({
  useApi:
    () =>
    <T>(): Promise<T> =>
      Promise.resolve(answer as T),
}));

describe("updateProfile", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps the children the page loaded when the answer does not carry them", async () => {
    const { useProfileStore } = await import("~/stores/profileStore");
    const { useProfileApi } = await import("~/composables/api/useProfileApi");
    const store = useProfileStore();
    store.setProfile({
      id: 8,
      firstName: "Gabriela",
      marketingOptIn: false,
      children: [{ id: 8, firstName: "Vlad" }],
    } as unknown as Profile);
    answer = { id: 8, firstName: "Gabriela", marketingOptIn: true };

    await useProfileApi().updateProfile({ marketingOptIn: true }, 8);

    expect(store.profile).toMatchObject({
      marketingOptIn: true,
      children: [{ id: 8, firstName: "Vlad" }],
    });
  });

  it("takes the answer whole for another family's row", async () => {
    const { useProfileStore } = await import("~/stores/profileStore");
    const { useProfileApi } = await import("~/composables/api/useProfileApi");
    const store = useProfileStore();
    store.setProfile({ id: 8, children: [{ id: 8 }] } as unknown as Profile);
    answer = { id: 9, firstName: "Alta" };

    await useProfileApi().updateProfile({ firstName: "Alta" }, 9);

    expect(store.profile).toEqual({ id: 9, firstName: "Alta" });
  });
});
