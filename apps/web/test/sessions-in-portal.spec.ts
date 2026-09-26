import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { deviceLabel, orderSessions } from "~/composables/useSessions";

/**
 * Terms §4.4/§4.5 and privacy §8 promise, in the portal, a list of the open sessions by browser and
 * „Deconectează-te de pe toate dispozitivele". The API had both; nothing in the portal called them
 * (review of 26 September 2026).
 */
const PROFILE = readFileSync(new URL("../app/pages/user/profile.vue", import.meta.url), "utf8");

describe("the sessions a family can see", () => {
  it("names each by browser and system, as the terms say, not by its raw description", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
      )
    ).toBe("Chrome pe Android");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari pe iPhone sau iPad");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0"
      )
    ).toBe("Edge pe Windows");
    expect(deviceLabel(null)).toBe("Dispozitiv necunoscut");
  });

  it("puts this browser's session first", () => {
    const ordered = orderSessions([
      {
        id: 1,
        createdAt: "2026-09-25T10:00:00.000Z",
        expiresAt: "",
        userAgent: null,
        current: false,
      },
      {
        id: 2,
        createdAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "",
        userAgent: null,
        current: true,
      },
      {
        id: 3,
        createdAt: "2026-09-26T10:00:00.000Z",
        expiresAt: "",
        userAgent: null,
        current: false,
      },
    ]);
    expect(ordered.map((session) => session.id)).toEqual([2, 3, 1]);
  });

  it("is on the profile page, with the way out of every device", () => {
    expect(PROFILE).toMatch(/Sesiuni active/);
    expect(PROFILE).toMatch(/Deconectează-te de pe toate dispozitivele/);
    expect(PROFILE).toMatch(/authApi\.logoutEverywhere\(\)/);
    expect(PROFILE).toMatch(/sesiunea aceasta/);
  });
});

describe("the calls behind it", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("asks for the list with this browser's refresh token in the body, never in the address", async () => {
    const client = vi.fn((_url: string, _opts?: { method?: string; body?: unknown }) =>
      Promise.resolve([])
    );
    vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));
    const { useTokenStore } = await import("~/stores/tokenStore");
    useTokenStore().setRefreshToken("al-meu", false);
    const { useAuthApi } = await import("~/composables/api/useAuthApi");

    await useAuthApi().fetchSessions();
    await useAuthApi().logoutEverywhere();

    expect(client.mock.calls[0]?.[0]).toBe("/auth/sessions");
    expect(client.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: { refreshToken: "al-meu" },
    });
    expect(client.mock.calls[1]?.[0]).toBe("/auth/logout-all");
  });
});
