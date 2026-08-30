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

  // E11/S2. Registration can now collide on three different things, and one shared "există deja o
  // înregistrare cu aceste date" left a parent whose email was taken changing their username.
  USERNAME_TAKEN: "Există deja un cont cu acest nume de utilizator. Alege altul.",
  EMAIL_TAKEN: "Există deja un cont cu această adresă de email.",
  PHONE_TAKEN: "Există deja un cont cu acest număr de telefon.",

  // The confirmation link. Three separate cases, because what the reader should do differs in each:
  // ask for a new link, nothing at all, or check they copied the whole address.
  CONFIRMATION_TOKEN_INVALID:
    "Linkul de confirmare nu este valid. Verifică dacă l-ai copiat întreg.",
  CONFIRMATION_TOKEN_USED: "Linkul a fost deja folosit — adresa ta este confirmată.",
  CONFIRMATION_TOKEN_EXPIRED: "Linkul de confirmare a expirat. Cere unul nou din contul tău.",
  EMAIL_ALREADY_CONFIRMED: "Adresa ta de email este deja confirmată.",
  NO_EMAIL_ON_FILE: "Contul nu are o adresă de email pe care să trimitem confirmarea.",

  PARENT_ACCOUNT_NOT_ACTIVE:
    "Contul părintelui nu este activ. Trebuie confirmat prin email și aprobat înainte de înscriere.",
  ACCOUNT_ALREADY_APPROVED: "Contul este deja aprobat.",
  NOT_A_PARENT_ACCOUNT: "Doar conturile de părinte trec prin aprobare.",

  // E14. Every one of these is something an admin or a parent can actually hit, and the shared
  // "există deja o înregistrare" or "nu ai dreptul" would be true of all of them and useful for
  // none — a teacher whose export was refused needs to know it was the file type, not the rules.
  PROJECT_NOT_YOURS: "Documentul aparține altei familii.",
  PROJECT_EMPTY: "Un proiect are nevoie de cel puțin un fișier sau un link.",
  PROJECT_ALREADY_ASSIGNED: "Documentul este deja al acelui copil.",
  PROJECT_CHILD_MISMATCH: "Proiectul acela este al altui copil.",
  PROJECT_FILE_TOO_LARGE: "Fișierul depășește limita de dimensiune.",
  PROJECT_FILE_TYPE_NOT_ALLOWED: "Tipul acesta de fișier nu este acceptat.",
  PROJECT_FILE_CONTENT_MISMATCH: "Fișierul nu este ce spune extensia lui.",
  PROJECT_FILE_NOT_UPLOADED: "Fișierul nu s-a încărcat complet încă.",
  PROJECT_FILE_ALREADY_UPLOADED: "Fișierul acesta este deja încărcat pentru copilul respectiv.",
  PROJECT_FILE_NEEDS_DIRECT_UPLOAD: "Fișierele video se încarcă direct în stocare, nu prin API.",
  PROJECT_FILE_NOT_DIRECT_UPLOADABLE: "Doar fișierele video se încarcă direct în stocare.",
  PROJECT_CONTENT_HASH_MISMATCH: "Fișierul nu corespunde cu suma de control trimisă.",
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
