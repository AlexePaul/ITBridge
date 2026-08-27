import {
  HONEYPOT_FIELD,
  contactMessageSchema,
  fieldErrorsOf,
  replyToAddress,
} from "#shared/contact";
import { SCHOOL_EMAIL, SCHOOL_NAME } from "#shared/school";
import { rateLimit } from "../utils/rate-limit";

/**
 * The contact form's only sending path.
 *
 * This is a server route rather than a call from the page on purpose. Resend's
 * key is a bearer token that can send mail as the school's own domain to anyone;
 * in a browser bundle it is readable by every visitor with the network tab open,
 * and there is no scope or origin restriction that would contain it. So the key
 * stays in `runtimeConfig` — outside `public`, so Nuxt never inlines it — and
 * only this handler ever sees it. On Vercel the route deploys as a serverless
 * function alongside the site, so this still needs no backend of ours.
 *
 * Resend's REST API is one authenticated POST, so it is called directly instead
 * of pulling in the SDK — the same call the `resend` package would make.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Five messages a quarter hour from one address is far above a real parent. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

/** Resend is normally well under a second; past this the reader is waiting for nothing. */
const SEND_TIMEOUT_MS = 10_000;

/** What we tell the reader when the send fails on our side, whatever the cause. */
const FALLBACK_MESSAGE =
  `Nu am putut trimite mesajul. Te rugăm să ne scrii direct la ${SCHOOL_EMAIL} ` +
  "sau să ne suni — răspundem la fel de repede.";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface ResendResponse {
  id?: string;
}

export default defineEventHandler(async (event) => {
  // `readBody` also parses `application/x-www-form-urlencoded`, which is a
  // CORS-simple content type: a cross-origin <form> can post to this route with
  // no preflight, and every visitor a bot sends brings its own per-IP budget.
  // The page posts JSON, so requiring it costs nothing and closes that door.
  const contentType = getRequestHeader(event, "content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Unsupported media type",
      data: { message: FALLBACK_MESSAGE },
    });
  }

  const config = useRuntimeConfig(event);

  /*
   * `process.env` first, `runtimeConfig` second, and the order matters.
   *
   * Nuxt reads `process.env` when it *builds*, and bakes the result into the
   * server bundle as the default. So a build that ran without the secret — a
   * preview, a CI job with no access to it — bakes in `undefined`, and setting
   * the variable on the host afterwards changes nothing: the route answers 503
   * for good, with nothing in the logs to say why. Reading the environment at
   * request time makes the value the host has now the value we use, and it
   * means rotating the key does not need a rebuild.
   *
   * `runtimeConfig` stays as the fallback: it is what declares the setting, and
   * it carries Nuxt's own `NUXT_RESEND_API_KEY` runtime override.
   */
  const apiKey = process.env.RESEND_API_KEY || config.resendApiKey;
  const from = process.env.CONTACT_FROM || config.contactFrom;

  // A missing key is a deployment mistake, not something the reader did. Say so
  // in the log, and give them the address that always works.
  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY is not set; the contact form cannot send.");
    throw createError({
      statusCode: 503,
      statusMessage: "Contact form not configured",
      data: { message: FALLBACK_MESSAGE },
    });
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const limit = rateLimit(`contact:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!limit.allowed) {
    // h3 types Retry-After as a number; it serialises it to the header itself.
    setResponseHeader(event, "retry-after", limit.retryAfter);
    throw createError({
      statusCode: 429,
      statusMessage: "Too many requests",
      data: {
        message:
          "Ai trimis deja câteva mesaje. Mai așteaptă câteva minute, " +
          `sau scrie-ne direct la ${SCHOOL_EMAIL}.`,
      },
    });
  }

  const body = await readBody<Record<string, unknown>>(event);

  // A filled honeypot answers 200 and sends nothing. Telling a bot it was caught
  // only teaches whoever wrote it which field to leave alone next time.
  const honeypot = body?.[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { ok: true } as const;
  }

  const parsed = contactMessageSchema.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid contact message",
      data: {
        message: "Verifică datele din formular.",
        fieldErrors: fieldErrorsOf(parsed.error),
      },
    });
  }

  const { name, reply, subject, message } = parsed.data;
  const replyTo = replyToAddress(reply);

  const text = [
    `Nume: ${name}`,
    `Contact: ${reply}`,
    `Subiect: ${subject}`,
    "",
    message,
    "",
    "—",
    "Trimis din formularul de contact de pe itbridgeschool.com",
  ].join("\n");

  const html = [
    '<div style="font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.6;">',
    `<p><strong>Nume:</strong> ${escapeHtml(name)}</p>`,
    `<p><strong>Contact:</strong> ${escapeHtml(reply)}</p>`,
    `<p><strong>Subiect:</strong> ${escapeHtml(subject)}</p>`,
    `<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>`,
    '<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />',
    '<p style="color: #666; font-size: 13px;">',
    "Trimis din formularul de contact de pe itbridgeschool.com",
    "</p>",
    "</div>",
  ].join("");

  try {
    const sent = await $fetch<ResendResponse>(RESEND_ENDPOINT, {
      method: "POST",
      timeout: SEND_TIMEOUT_MS,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: {
        // The From address must be on a domain verified in Resend; the sender is
        // always us, never the parent, because a parent's address here would be
        // an unauthenticated spoof and fail SPF/DKIM at the recipient.
        from,
        to: [SCHOOL_EMAIL],
        // Answering the notification reaches the parent when they left an email;
        // when they left a phone number there is nothing to reply to.
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `[${SCHOOL_NAME}] ${subject} — ${name}`,
        text,
        html,
      },
    });

    return { ok: true, id: sent?.id ?? null } as const;
  } catch (error) {
    // Log what Resend actually said — the reader gets the fallback either way,
    // but an unverified domain and a revoked key look identical without this.
    const detail =
      error && typeof error === "object" && "data" in error
        ? JSON.stringify((error as { data: unknown }).data)
        : String(error);
    console.error(`[contact] Resend rejected the send: ${detail}`);

    throw createError({
      statusCode: 502,
      statusMessage: "Failed to send message",
      data: { message: FALLBACK_MESSAGE },
    });
  }
});
