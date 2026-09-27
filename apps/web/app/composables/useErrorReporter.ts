import type { ClientErrorKind, ClientErrorReport } from "~/types/error-report.types";

/**
 * What the browser sends when a screen breaks — E06 S1, the pure half.
 *
 * A component that throws while it renders is dropped by Vue and the rest of the page carries on
 * around the hole: no error page, no message, a screen with a piece missing. CLAUDE.md has three
 * such bugs in it, each found by somebody who happened to open the console. This is the part that
 * decides what is worth sending to `/admin/erori` and what it says; the plugin
 * (`plugins/05.error-report.client.ts`) only wires it to the hooks.
 */

/** More than this from one page load is the same fault looping, not ten faults. */
export const MAX_REPORTS_PER_PAGE_LOAD = 10;

/**
 * Whether an error is one the record should hear about from the browser.
 *
 * Not a failed API call: a 5xx is recorded by the server under the request id its response
 * carried, a 4xx is an answer the screen handles, and one with no response at all is the network —
 * the wifi in a classroom, not a bug. Not a 4xx page either (`createError({ statusCode: 404 })` is
 * how a page says a record does not exist). And not the two kinds of noise every browser produces:
 * the ResizeObserver warning, and the chunk an open tab asks for after a deploy replaced it, which
 * Nuxt answers by reloading.
 */
export function isReportableError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  const shape = error as { name?: unknown; message?: unknown; statusCode?: unknown };
  if (shape.name === "FetchError" || shape.name === "AbortError") return false;
  if (typeof shape.statusCode === "number" && shape.statusCode < 500) return false;
  const message = String(typeof shape.message === "string" ? shape.message : error);
  if (/ResizeObserver loop/i.test(message)) return false;
  if (
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (CSS )?chunk/i.test(
      message
    )
  )
    return false;
  return true;
}

/**
 * The request id of a failed API call that answered 5xx — the code the server already recorded it
 * under, so the error page can show it without sending a second report.
 */
export function serverReference(error: unknown): string | null {
  const shape = error as { name?: unknown; data?: { statusCode?: unknown; requestId?: unknown } };
  if (shape?.name !== "FetchError") return null;
  const status = shape.data?.statusCode;
  const requestId = shape.data?.requestId;
  if (typeof status !== "number" || status < 500 || typeof requestId !== "string") return null;
  return requestId.slice(0, 8);
}

/** Eight hex characters: short enough to read out over the phone, which is what it is for. */
export function newErrorReference(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A Vue component instance, as much of it as a name is read from. */
interface ComponentLike {
  $options?: { __name?: string; name?: string };
  type?: { __name?: string; name?: string };
  $parent?: ComponentLike | null;
  parent?: ComponentLike | null;
}

/**
 * The components Vue reported, innermost first — `InvoiceTable < AdminPage` — which is what says
 * where on a page it broke. Three are enough to find the file; the rest is layout.
 */
export function componentTrail(instance: unknown, depth = 3): string | undefined {
  const names: string[] = [];
  let current = instance as ComponentLike | null | undefined;
  while (current && names.length < depth) {
    const name =
      current.$options?.__name ??
      current.$options?.name ??
      current.type?.__name ??
      current.type?.name;
    if (name && !names.includes(name)) names.push(name);
    current = current.$parent ?? current.parent ?? null;
  }
  return names.length ? names.join(" < ").slice(0, 200) : undefined;
}

/** The body of `POST /errors/client`, cut to what the API accepts. */
export function describeClientError(
  error: unknown,
  kind: ClientErrorKind,
  where: { route: string; path?: string; component?: string; reference: string }
): ClientErrorReport {
  const shape = error as { name?: unknown; message?: unknown; stack?: unknown };
  const name = typeof shape?.name === "string" && shape.name ? shape.name : "Error";
  const message =
    typeof shape?.message === "string" && shape.message ? shape.message : String(error);
  const stack = typeof shape?.stack === "string" ? shape.stack : undefined;
  return {
    name: name.slice(0, 100),
    message: (message || "(fără mesaj)").slice(0, 1000),
    ...(stack ? { stack: stack.slice(0, 8000) } : {}),
    route: (where.route || "/").slice(0, 200),
    ...(where.path ? { path: where.path.slice(0, 500) } : {}),
    ...(where.component ? { component: where.component } : {}),
    kind,
    reference: where.reference,
  };
}

/**
 * Sends each fault once per page load, and at most `MAX_REPORTS_PER_PAGE_LOAD` of them.
 *
 * `vue:error` and `app:error` can both see one error, and a component that throws on every render
 * throws on every render: the same object is sent once, and so is the same message on the same
 * route. Sending never throws and never waits — a report about a broken screen that broke the
 * screen further would be the worst version of this.
 */
export function createErrorReporter(send: (report: ClientErrorReport) => Promise<unknown>) {
  const seenErrors = new WeakSet<object>();
  const seenKeys = new Set<string>();
  let sent = 0;

  /**
   * The reference a new report went under; null when nothing was sent — not worth reporting, the
   * same error again, or the same fault again — so the caller says something only once.
   */
  const report = (
    error: unknown,
    kind: ClientErrorKind,
    where: { route: string; path?: string; component?: string }
  ): string | null => {
    if (!isReportableError(error)) return null;
    if (typeof error === "object" && error !== null) {
      if (seenErrors.has(error)) return null;
      seenErrors.add(error);
    }
    const reference = newErrorReference();
    const body = describeClientError(error, kind, { ...where, reference });
    const key = `${body.name}|${body.message}|${body.route}`;
    if (seenKeys.has(key) || sent >= MAX_REPORTS_PER_PAGE_LOAD) return null;
    seenKeys.add(key);
    sent += 1;
    try {
      send(body).catch(() => {
        // Nothing to do: the screen is already broken, and saying so twice helps nobody.
      });
    } catch {
      // Same, for a sender that throws before it returns a promise.
    }
    return reference;
  };

  return { report };
}
