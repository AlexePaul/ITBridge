import { z } from "zod";

/**
 * Zod's own messages, in Romanian.
 *
 * A schema that names its message says it in Romanian already; one that does not — a `.max(120)`
 * on a name, a bare `.email()` — fell back to zod's English, and "Invalid input" under an email
 * field was what the office read (QA of 27 September 2026). The locale is zod's own, set once for
 * the process: the schemas are module-level, so every form and the contact route share it.
 */
export default defineNuxtPlugin(() => {
  z.config(z.locales.ro());
});
