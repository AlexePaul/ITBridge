import { describe, expect, it, vi } from "vitest";
import {
  MAX_REPORTS_PER_PAGE_LOAD,
  componentTrail,
  createErrorReporter,
  describeClientError,
  routePattern,
  isReportableError,
  newErrorReference,
  serverReference,
} from "../app/composables/useErrorReporter";

/**
 * E06 S1 — what a broken screen sends to `/admin/erori`, and what it leaves alone.
 *
 * The plugin is a few lines of wiring; the decisions are here, and each of them is a way the
 * record could fill with noise that buries the one real fault, or loop on itself.
 */
describe("the browser's error reports", () => {
  const where = { route: "/admin/profiles/:id()", path: "/admin/profiles/12" };

  describe("isReportableError", () => {
    it("reports a component that threw", () => {
      expect(isReportableError(new TypeError("Cannot read properties of undefined"))).toBe(true);
    });

    it.each([
      [
        "a failed API call — the server recorded the 5xx, a 4xx is an answer",
        Object.assign(new Error("[GET] /x: 500"), { name: "FetchError" }),
      ],
      ["an aborted request", Object.assign(new Error("aborted"), { name: "AbortError" })],
      [
        "a page saying a record does not exist",
        Object.assign(new Error("Not found"), { statusCode: 404 }),
      ],
      [
        "the chunk an open tab asks for after a deploy",
        new TypeError("Failed to fetch dynamically imported module: /_nuxt/x.js"),
      ],
      [
        "the ResizeObserver warning",
        new Error("ResizeObserver loop completed with undelivered notifications."),
      ],
      ["nothing", undefined],
    ])("leaves out %s", (_label, error) => {
      expect(isReportableError(error)).toBe(false);
    });
  });

  it("reads the reference the server recorded a 5xx under, and nothing else", () => {
    const failed = (status: number) =>
      Object.assign(new Error("x"), {
        name: "FetchError",
        data: { statusCode: status, requestId: "3f2a9c1d-aaaa-bbbb" },
      });
    expect(serverReference(failed(500))).toBe("3f2a9c1d");
    expect(serverReference(failed(409))).toBeNull();
    expect(serverReference(new Error("x"))).toBeNull();
  });

  it("makes references of eight hex characters, the column the server searches", () => {
    expect(newErrorReference()).toMatch(/^[a-f0-9]{8}$/);
  });

  it("names the components, innermost first, without repeating one", () => {
    const layout = { $options: { __name: "AdminPage" }, $parent: null };
    const wrapper = { $options: { __name: "AdminPage" }, $parent: layout };
    const table = { $options: { __name: "InvoiceTable" }, $parent: wrapper };
    expect(componentTrail(table)).toBe("InvoiceTable < AdminPage");
    expect(componentTrail(undefined)).toBeUndefined();
  });

  it("cuts every field to what the API accepts", () => {
    const error = Object.assign(new Error("m".repeat(5000)), { stack: "s".repeat(20000) });
    const body = describeClientError(error, "vue", { ...where, reference: "b7e1c04a" });

    expect(body.message).toHaveLength(1000);
    expect(body.stack).toHaveLength(8000);
    expect(body).toMatchObject({
      name: "Error",
      // Without Nuxt's `()`: the origin reads as the screen map and the runbook write it.
      route: "/admin/profiles/:id",
      path: where.path,
      kind: "vue",
      reference: "b7e1c04a",
    });
  });

  describe("createErrorReporter", () => {
    it("sends a fault once, whichever hook sees it and however often it throws", () => {
      const send = vi.fn().mockResolvedValue({});
      const reporter = createErrorReporter(send);
      const error = new TypeError("boom");

      const first = reporter.report(error, "vue", where);
      expect(reporter.report(error, "vue", where)).toBeNull();
      expect(reporter.report(new TypeError("boom"), "unhandledrejection", where)).toBeNull();

      expect(first).toMatch(/^[a-f0-9]{8}$/);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toMatchObject({ message: "boom", reference: first });
    });

    it(`stops after ${MAX_REPORTS_PER_PAGE_LOAD} from one page load`, () => {
      const send = vi.fn().mockResolvedValue({});
      const reporter = createErrorReporter(send);
      for (let i = 0; i < MAX_REPORTS_PER_PAGE_LOAD + 5; i++)
        reporter.report(new Error(`fault ${i}`), "vue", where);
      expect(send).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE_LOAD);
    });

    // Review of 27 September 2026: the toast said "notată, cu codul X" before anything was stored.
    it("says whether the report arrived, once", async () => {
      const results: boolean[] = [];
      createErrorReporter(() => Promise.resolve({})).report(new Error("ok"), "vue", where, (d) =>
        results.push(d)
      );
      createErrorReporter(() => Promise.reject(new Error("offline"))).report(
        new Error("lost"),
        "vue",
        where,
        (d) => results.push(d)
      );
      createErrorReporter(() => {
        throw new Error("sync");
      }).report(new Error("thrown"), "vue", where, (d) => results.push(d));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(results.sort()).toEqual([false, false, true]);
    });

    // QA of 27 September 2026: an account waiting for approval got "am notat eroarea, cu codul X"
    // for a report the server had thrown away, and the office found nothing under the code.
    it("counts a report the server did not keep as not delivered", async () => {
      const results: boolean[] = [];
      createErrorReporter(() => Promise.resolve({ accepted: false })).report(
        new Error("dropped"),
        "vue",
        where,
        (d) => results.push(d)
      );
      createErrorReporter(() => Promise.resolve({ accepted: true })).report(
        new Error("kept"),
        "vue",
        where,
        (d) => results.push(d)
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(results.sort()).toEqual([false, true]);
    });

    it("never throws, whatever sending does", async () => {
      const reporter = createErrorReporter(() => Promise.reject(new Error("offline")));
      expect(() => reporter.report(new Error("a"), "vue", where)).not.toThrow();
      const throwing = createErrorReporter(() => {
        throw new Error("sync");
      });
      expect(() => throwing.report(new Error("b"), "vue", where)).not.toThrow();
    });
  });
});

describe("routePattern", () => {
  it("writes a route as the map and the runbook do, without Nuxt's matcher syntax", () => {
    expect(routePattern("/admin/profiles/:profileId()")).toBe("/admin/profiles/:profileId");
    expect(routePattern("/files/:publicId()")).toBe("/files/:publicId");
    expect(routePattern("/:slug(.*)*")).toBe("/:slug");
    expect(routePattern("/admin/erori")).toBe("/admin/erori");
  });
});
