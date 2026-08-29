/**
 * Turns a failed API call into something a parent can read.
 *
 * The backend answers every error with one shape (E05/S2):
 * `{ statusCode, code, message, requestId, path, timestamp, details? }`.
 * `code` is the stable, machine-readable half — switch on that, never on `message`.
 * `details` carries the per-field problems from the ValidationPipe.
 *
 * Until now nothing on the frontend read any of it: three composables caught the error and
 * returned `err.data?.statusCode` as a plain number, so a 400 reached the page as the value `400`
 * and every caller treated it as success.
 */

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string;
  requestId?: string;
  details?: string[];
}

export function apiErrorBody(err: unknown): ApiErrorBody {
  const data = (err as { data?: unknown })?.data;
  return data && typeof data === "object" ? (data as ApiErrorBody) : {};
}

export function apiErrorCode(err: unknown): string | undefined {
  return apiErrorBody(err).code;
}

/** Romanian wording for the codes a parent or an admin can actually hit. */
const MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "Datele trimise nu sunt valide.",
  ALREADY_EXISTS: "Există deja o înregistrare cu aceste date.",
  CONFLICT: "Există deja o înregistrare cu aceste date.",
  UNAUTHORIZED: "Sesiunea a expirat. Autentifică-te din nou.",
  FORBIDDEN: "Nu ai dreptul să faci această operațiune.",
  NOT_FOUND: "Nu am găsit ce ai cerut.",
  TOO_MANY_REQUESTS: "Prea multe încercări. Încearcă din nou peste un minut.",
  RELATED_RECORD_MISSING: "O înregistrare la care se face referire nu există.",
  MISSING_REQUIRED_FIELD: "Un câmp obligatoriu lipsește.",
  INVALID_VALUE: "Un câmp are o valoare de tipul greșit.",
  SERVICE_UNAVAILABLE: "Serviciul este momentan indisponibil. Încearcă din nou.",

  // E08. "Există deja o înregistrare cu aceste date" is true of all of these and useful for none:
  // an admin who has just double-booked a room needs to know that is what happened.
  GROUP_SLOT_TAKEN: "Sala este deja ocupată în acest interval de altă grupă.",
  GROUP_OVER_ROOM_CAPACITY: "Grupa are mai multe locuri decât încap în sală.",
  LOCATION_SLUG_TAKEN: "Există deja o locație cu acest identificator (slug).",
  LOCATION_HAS_ROOMS: "Locația are săli. Șterge sau mută întâi sălile.",
  ROOM_NAME_TAKEN: "Există deja o sală cu acest nume la această locație.",
  ROOM_HAS_GROUPS: "Sala găzduiește grupe. Mută întâi grupele în altă sală.",
  ROOM_INACTIVE: "Sala sau locația este inactivă, deci nu poate primi grupe noi.",

  // E12. Only reachable by opening an inactive group's attendance page directly - the listing
  // filters them out - but without an entry here the admin gets the English sentence from the API.
  GROUP_INACTIVE: "Grupa este inactivă. Reactiveaz-o înainte să îi generezi orarul.",
};

/**
 * A message to show the user. `details` wins when present: "phone must be a valid phone number"
 * is more useful than "datele nu sunt valide", even in English, because it names the field.
 */
export function apiErrorMessage(
  err: unknown,
  fallback = "A apărut o eroare. Încearcă din nou."
): string {
  const body = apiErrorBody(err);

  if (body.details?.length) {
    return body.details.join(" · ");
  }
  if (body.code && MESSAGES[body.code]) {
    return MESSAGES[body.code] as string;
  }
  if (body.message) {
    return body.message;
  }
  return (err as { message?: string })?.message || fallback;
}
