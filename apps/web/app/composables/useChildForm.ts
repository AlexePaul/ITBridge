import * as z from "zod";
import { DATE_KEY_PATTERN } from "~/composables/useDateField";

/** What the family types about a child in Profil — terms §5: first name, last name, birth date. */
export interface ChildFormValues {
  firstName: string;
  lastName: string;
  birthDate: string;
}

export type ChildFormErrors = Partial<Record<keyof ChildFormValues, string>>;

/**
 * The child's fields, checked in the browser with the server's limits and in its words.
 *
 * `CreateChildDto` and `UpdateChildDto` hold the same rules and stay the authority — this only
 * decides whether a request is worth making, so a mistake shows under its field instead of in a
 * banner. Names are trimmed and taken as typed otherwise: a family knows how its child's name is
 * spelled, and the office's capitalising helper would turn „Pop-Ionescu" into „Pop-ionescu".
 *
 * `today` is a day key on the school's clock; day keys compare as strings (CLAUDE.md), so "not after
 * today" is one comparison, the same one the server makes.
 */
export const childFormSchema = (today: string) =>
  z.object({
    firstName: z
      .string()
      .trim()
      .min(1, "Scrie prenumele copilului")
      .max(100, "Prenumele copilului trebuie să aibă cel mult 100 de caractere"),
    lastName: z
      .string()
      .trim()
      .min(1, "Scrie numele de familie al copilului")
      .max(100, "Numele de familie al copilului trebuie să aibă cel mult 100 de caractere"),
    birthDate: z
      .string()
      .regex(DATE_KEY_PATTERN, "Alege data nașterii")
      .refine((value) => value <= today, "Data nașterii nu poate fi după ziua de azi"),
  });

/** The first problem per field, or the cleaned values when there is none. */
export function checkChildForm(
  values: ChildFormValues,
  today: string
): { errors: ChildFormErrors; data: ChildFormValues | null } {
  const result = childFormSchema(today).safeParse(values);
  if (result.success) return { errors: {}, data: result.data };

  const errors: ChildFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ChildFormValues;
    errors[field] ??= issue.message;
  }
  return { errors, data: null };
}
