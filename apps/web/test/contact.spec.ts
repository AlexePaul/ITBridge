import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTACT_SUBJECTS,
  contactErrorPayload,
  contactMessageSchema,
  fieldErrorsOf,
  replyToAddress,
} from "../shared/contact";
import { rateLimit, resetRateLimits } from "../server/utils/rate-limit";

const validMessage = {
  name: "Maria Ionescu",
  reply: "0712345678",
  subject: CONTACT_SUBJECTS[0],
  message: "Băiatul meu are 9 ani și aș vrea să știu ce grupă i se potrivește.",
};

describe("contactMessageSchema", () => {
  it("accepts a message a parent would actually send", () => {
    const result = contactMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it("trims before it measures, so a field of spaces is empty", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, name: "   " });
    expect(result.success).toBe(false);
    expect(fieldErrorsOf(result.error!).name).toBeDefined();
  });

  it("stores the trimmed value, not what was typed", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, name: "  Maria  " });
    expect(result.success && result.data.name).toBe("Maria");
  });

  it("rejects a subject that is not one of ours", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, subject: "Altceva" });
    expect(result.success).toBe(false);
    expect(fieldErrorsOf(result.error!).subject).toBeDefined();
  });

  it("rejects a message too short to act on", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, message: "salut" });
    expect(result.success).toBe(false);
  });

  it("caps the message, so one post cannot carry a megabyte into an email", () => {
    const result = contactMessageSchema.safeParse({
      ...validMessage,
      message: "a".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("drops keys no field declares", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, isAdmin: true });
    expect(result.success && "isAdmin" in result.data).toBe(false);
  });

  it("reports one error per field, and only for fields the page can show", () => {
    const result = contactMessageSchema.safeParse({ name: "", reply: "", message: "" });
    const errors = fieldErrorsOf(result.error!);
    expect(Object.keys(errors).sort()).toEqual(["message", "name", "reply", "subject"]);
    expect(Object.values(errors).every((message) => typeof message === "string")).toBe(true);
  });
});

describe("replyToAddress", () => {
  it("returns the address when the parent left an email", () => {
    expect(replyToAddress("maria@example.com")).toBe("maria@example.com");
  });

  it("returns null for a phone number, because there is nothing to reply to", () => {
    expect(replyToAddress("0712345678")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(replyToAddress("  maria@example.com  ")).toBe("maria@example.com");
  });
});

describe("rateLimit", () => {
  beforeEach(resetRateLimits);

  it("allows up to the limit and refuses the next one", () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(rateLimit("ip", 3, 1000).allowed).toBe(true);
    }
    expect(rateLimit("ip", 3, 1000).allowed).toBe(false);
  });

  it("counts each key separately", () => {
    expect(rateLimit("a", 1, 1000).allowed).toBe(true);
    expect(rateLimit("a", 1, 1000).allowed).toBe(false);
    expect(rateLimit("b", 1, 1000).allowed).toBe(true);
  });

  it("opens a fresh window once the old one expires", () => {
    expect(rateLimit("ip", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit("ip", 1, 1000, 500).allowed).toBe(false);
    expect(rateLimit("ip", 1, 1000, 1001).allowed).toBe(true);
  });

  it("reports the seconds left, for Retry-After", () => {
    rateLimit("ip", 1, 60_000, 0);
    expect(rateLimit("ip", 1, 60_000, 10_000).retryAfter).toBe(50);
  });
});

describe("contactErrorPayload", () => {
  /**
   * The body Nitro actually sends for `createError({ statusCode, statusMessage,
   * data })`. `message` is the English `statusMessage` h3 copies onto the error;
   * the route's own payload is the sibling `data`. ofetch hands this whole
   * object to the client as `error.data`.
   *
   * This shape is the thing that broke: the page read `error.data.message` and
   * showed Romanian parents "Contact form not configured".
   */
  const nitroError = (statusMessage: string, data: unknown) => ({
    data: { error: true, statusCode: 503, statusMessage, message: statusMessage, data },
  });

  it("reads the route's message, not the English statusMessage beside it", () => {
    const error = nitroError("Contact form not configured", {
      message: "Nu am putut trimite mesajul.",
    });
    expect(contactErrorPayload(error).message).toBe("Nu am putut trimite mesajul.");
  });

  it("never surfaces the English statusMessage, whatever the body carries", () => {
    const error = nitroError("Too many requests", { message: "Ai trimis deja câteva mesaje." });
    expect(contactErrorPayload(error).message).not.toBe("Too many requests");
  });

  it("carries fieldErrors through, so a 400 lands under the right fields", () => {
    const error = nitroError("Invalid contact message", {
      message: "Verifică datele din formular.",
      fieldErrors: { name: "Scrie-ne numele tău" },
    });
    expect(contactErrorPayload(error).fieldErrors).toEqual({ name: "Scrie-ne numele tău" });
  });

  it("returns nothing for a network error, which carries no body at all", () => {
    expect(contactErrorPayload(new Error("Failed to fetch"))).toEqual({});
  });

  it("returns nothing rather than throwing on null or undefined", () => {
    expect(contactErrorPayload(null)).toEqual({});
    expect(contactErrorPayload(undefined)).toEqual({});
  });

  it("ignores a body that has no nested payload of ours", () => {
    expect(contactErrorPayload({ data: { statusCode: 500, message: "Server Error" } })).toEqual({});
  });
});
