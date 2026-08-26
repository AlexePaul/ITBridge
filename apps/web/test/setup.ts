import { computed, reactive, readonly, ref, shallowRef, watch, type Ref } from "vue";
import { beforeEach, vi } from "vitest";

// Auto-importurile Vue pe care Nuxt le injectează în sursă.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("readonly", readonly);
vi.stubGlobal("reactive", reactive);
vi.stubGlobal("shallowRef", shallowRef);
vi.stubGlobal("watch", watch);

/**
 * `useCookie` din Nuxt, în memorie. Store-urile îl folosesc ca depozit de stare, deci testele au
 * nevoie de un ref persistent per nume, cu aceeași semantică de `default`.
 */
const cookieJar = new Map<string, Ref<unknown>>();

vi.stubGlobal("useCookie", <T>(name: string, opts?: { default?: () => T }): Ref<T> => {
  if (!cookieJar.has(name)) {
    cookieJar.set(name, ref(opts?.default ? opts.default() : null));
  }
  return cookieJar.get(name) as Ref<T>;
});

vi.stubGlobal("clearNuxtCookies", () => cookieJar.clear());

// Fiecare test pornește cu borcanul gol, altfel starea se scurge între ele.
beforeEach(() => {
  cookieJar.clear();
});
