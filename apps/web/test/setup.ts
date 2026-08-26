import { computed, reactive, readonly, ref, shallowRef, watch, type Ref } from "vue";
import { beforeEach, vi } from "vitest";

// The Vue auto-imports Nuxt injects into the source.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("readonly", readonly);
vi.stubGlobal("reactive", reactive);
vi.stubGlobal("shallowRef", shallowRef);
vi.stubGlobal("watch", watch);

/**
 * Nuxt's `useCookie`, in memory. The stores use it as a state container, so tests need a ref that
 * persists per name, with the same `default` semantics.
 */
const cookieJar = new Map<string, Ref<unknown>>();

vi.stubGlobal("useCookie", <T>(name: string, opts?: { default?: () => T }): Ref<T> => {
  if (!cookieJar.has(name)) {
    cookieJar.set(name, ref(opts?.default ? opts.default() : null));
  }
  return cookieJar.get(name) as Ref<T>;
});

vi.stubGlobal("clearNuxtCookies", () => cookieJar.clear());

// Every test starts with an empty jar, otherwise state leaks between them.
beforeEach(() => {
  cookieJar.clear();
});
