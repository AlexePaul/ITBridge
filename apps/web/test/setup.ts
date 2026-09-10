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

/**
 * `useRequestURL`, which `tokenStore` reads to decide whether its cookies are `secure`. Plain HTTP
 * by default, the way `pnpm dev` and a phone on the LAN see the app; a test that cares about the
 * other answer stubs it again with an `https:` URL.
 */
vi.stubGlobal("useRequestURL", () => new URL("http://localhost:3001/"));

/**
 * The two Nuxt helpers the auth chain is written with.
 *
 * `defineNuxtRouteMiddleware` is identity at runtime — it exists for types — so handing the
 * function straight back lets a spec call the middleware the way Nuxt would. `navigateTo` records
 * where it was sent rather than navigating, which is the whole assertion for a redirect.
 */
vi.stubGlobal("defineNuxtRouteMiddleware", <T>(middleware: T): T => middleware);
vi.stubGlobal(
  "navigateTo",
  vi.fn((to: string) => to)
);

/**
 * `defineNuxtPlugin`, for the same reason and with one extra consequence worth naming: the auth
 * middleware imports `authInitialized` from the boot plugin, so loading the middleware evaluates
 * the plugin module. Identity registers the plugin without running it, which is what a spec about
 * the middleware wants.
 */
vi.stubGlobal("defineNuxtPlugin", <T>(plugin: T): T => plugin);

/**
 * `useRuntimeConfig`, because `useApi` reads `apiBase` the moment a store that uses it is created —
 * `userStore` does, so anything that touches it needs this present. A spec that cares about the
 * value stubs it again.
 */
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBase: "http://localhost:3000" } }));

/**
 * `$fetch`, which `useApi` calls `.create` on while a store is being built.
 *
 * It refuses rather than answering: no spec here should reach the network, so a call is a bug in
 * the spec and should say so loudly instead of hanging or returning undefined. A spec that wants a
 * response stubs it again — `useApi.spec.ts` does.
 */
const refuse = () =>
  Promise.reject(
    new Error("$fetch is stubbed in test/setup.ts; stub it in your spec if you need a response")
  );
vi.stubGlobal("$fetch", Object.assign(refuse, { create: () => refuse }));

// Every test starts with an empty jar, otherwise state leaks between them.
beforeEach(() => {
  cookieJar.clear();
});
