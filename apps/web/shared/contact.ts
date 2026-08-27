import { z } from "zod";

/**
 * The contact form's shape, in one place.
 *
 * Both sides read this file: the page validates against it before it posts, so
 * the reader gets errors under the fields instead of a round trip, and
 * `server/api/contact.post.ts` validates the same schema again on arrival.
 * The second check is the one that counts — the route is public, and anyone can
 * post to it without ever loading the page.
 */

export const CONTACT_SUBJECTS = [
  "Întrebare despre cursuri",
  "Înscriere",
  "Parteneriat",
  "Feedback",
  "Altele",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/**
 * The field a person never sees. Browsers leave it empty; the crawlers that
 * post to any form they find fill every input they can name, so a value here is
 * the clearest signal we have that the sender is not a parent.
 */
export const HONEYPOT_FIELD = "website";

/**
 * `.trim()` runs before the length checks, so a field holding only spaces fails
 * `min` instead of slipping past it. The upper bounds are what keeps a single
 * post from carrying a megabyte into an email.
 */
export const contactMessageSchema = z.object({
  name: z
    .string("Numele este obligatoriu")
    .trim()
    .min(2, "Scrie-ne numele tău")
    .max(120, "Numele este prea lung"),
  reply: z
    .string("Lasă un telefon sau un email")
    .trim()
    .min(5, "Lasă un telefon sau un email la care te putem găsi")
    .max(160, "Datele de contact sunt prea lungi"),
  subject: z.enum(CONTACT_SUBJECTS, "Alege un subiect din listă"),
  message: z
    .string("Mesajul este obligatoriu")
    .trim()
    .min(10, "Scrie câteva cuvinte despre ce te interesează")
    .max(4000, "Mesajul este prea lung; păstrează-l sub 4000 de caractere"),
  [HONEYPOT_FIELD]: z.string().max(200).optional(),
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;

/** The fields a reader can actually be shown an error for. */
export type ContactField = "name" | "reply" | "subject" | "message";

export const CONTACT_FIELDS: ContactField[] = ["name", "reply", "subject", "message"];

/**
 * The reply field takes a phone number or an email, because asking a parent to
 * pick one is friction for no gain. When it happens to be an email we can set
 * Reply-To, and answering the notification goes straight back to the parent
 * rather than to ourselves.
 */
export const replyToAddress = (reply: string): string | null => {
  const value = reply.trim();
  return z.email().safeParse(value).success ? value : null;
};

/** Zod's issue list, flattened to one message per field — the first one wins. */
export const fieldErrorsOf = (error: z.ZodError): Partial<Record<ContactField, string>> => {
  const errors: Partial<Record<ContactField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (CONTACT_FIELDS as string[]).includes(field)) {
      errors[field as ContactField] ??= issue.message;
    }
  }
  return errors;
};
