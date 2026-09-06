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

  // E20 — acquisition. The first three can reach a parent on the public booking page, so they are
  // written for one: no jargon, and each says what to do next.
  CONTACT_REQUIRED: "Lasă un email sau un telefon, ca să te putem contacta.",
  TRIAL_SESSION_UNAVAILABLE: "Ora aleasă nu mai este disponibilă. Alege alta din listă.",
  TRIAL_AGE_MISMATCH: "Grupa aleasă este pentru altă vârstă. Alege una dintre cele propuse.",
  LEAD_NOT_NEW: "Cererea a trecut deja de acest pas; stările următoare vin din ce s-a întâmplat.",
  LEAD_ALREADY_ENROLLED:
    "Familia este deja înscrisă. Dacă a renunțat, se închide înscrierea, nu cererea.",
  ASSIGNMENT_AMBIGUOUS: "Alege: fie îi dai un responsabil, fie i-l iei.",

  // E20/S5 — the one-press referral reward. The refusal has to say what would have happened,
  // because "already has one" sounds harmless and a free month is not.
  DISCOUNT_ALREADY_GRANTED:
    "Pe luna aceea stă deja o reducere procentuală dată din formular. Încă una s-ar aduna cu ea și ar face luna gratuită — dacă asta vrei, dă-o tot din formular.",
  REFERRAL_NOTHING_TO_REVOKE: "Familia nu are nicio lună de recomandare de scos.",

  // E08. "Există deja o înregistrare cu aceste date" is true of all of these and useful for none:
  // an admin who has just double-booked a room needs to know that is what happened.
  GROUP_SLOT_TAKEN: "Sala este deja ocupată în acest interval de altă grupă.",
  GROUP_OVER_ROOM_CAPACITY: "Grupa are mai multe locuri decât încap în sală.",
  LOCATION_SLUG_TAKEN: "Există deja o locație cu acest identificator (slug).",
  LOCATION_HAS_ROOMS: "Locația are săli. Șterge sau mută întâi sălile.",
  ROOM_NAME_TAKEN: "Există deja o sală cu acest nume la această locație.",
  ROOM_HAS_GROUPS: "Sala găzduiește grupe. Mută întâi grupele în altă sală.",
  ROOM_INACTIVE: "Sala sau locația este inactivă, deci nu poate primi grupe noi.",

  // E17/S7. All three are conflicts an admin can hit from the announcement screen, and the generic
  // "există deja o înregistrare cu aceste date" is wrong about every one of them. The names-a-child
  // one arrives with the names in its own message, so it is not listed here — the generic sentence
  // would be a downgrade, the same reason `GROUP_FULL` is absent.
  ANNOUNCEMENT_ALREADY_SENT:
    "Același anunț a plecat deja astăzi către aceeași audiență. Schimbă textul dacă vrei totuși să îl retrimiți.",
  ANNOUNCEMENT_NO_RECIPIENTS:
    "Nu există nicio familie în audiența aleasă, deci anunțul nu are cui să plece.",

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

  PARENT_PROFILE_INCOMPLETE:
    "Profilul familiei este incomplet. Completează telefonul, adresa și contactul de urgență din pagina de profil.",
  PARENT_ACCOUNT_NOT_ACTIVE:
    "Contul părintelui nu este activ. Trebuie confirmat prin email și aprobat înainte de înscriere.",
  ACCOUNT_ALREADY_APPROVED: "Contul este deja aprobat.",
  NOT_A_PARENT_ACCOUNT: "Doar conturile de părinte trec prin aprobare.",

  // E11/S1 and S3. `GROUP_FULL` arrives with its own sentence from the server, naming the numbers,
  // so it is deliberately absent here — the generic line would be a downgrade.
  CHILD_ALREADY_ENROLLED:
    "Copilul are deja o înscriere în vigoare. Fă un transfer, nu o a doua înscriere.",
  ENROLLMENT_ALREADY_CLOSED: "Înscrierea este deja închisă.",
  ENROLLMENT_STATUS_NOT_OPENABLE: "O înscriere nouă poate fi doar activă sau de probă.",
  ENROLLMENT_STATUS_NOT_CLOSING: "O înscriere se închide ca încheiată, abandonată sau transferată.",
  ALREADY_ON_WAITLIST: "Copilul este deja pe lista de așteptare a acestei grupe.",
  NOTHING_TO_TRANSFER: "Copilul nu are o înscriere în vigoare. Înscrie-l direct, nu prin transfer.",
  ALREADY_IN_GROUP: "Copilul este deja în această grupă.",
  NOT_A_TRIAL: "Doar o probă poate fi confirmată sau închisă astfel.",
  // `COMPATIBILITY_WARNINGS` arrives with the warnings themselves in the message — a generic line
  // here would replace "are 7 ani, iar grupa e pentru 11-14" with "datele nu sunt valide".

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

  // E12/S3. Announcing an absence — each of these is a different thing to do about it, and the
  // shared "există deja o înregistrare" would be true of the last one and useless for all three.
  CHILD_NOT_IN_SESSION_GROUP: "Copilul nu e în grupa care ține ședința asta.",
  ATTENDANCE_ALREADY_MARKED:
    "Prezența la ora asta a fost deja marcată — anunțul nu mai schimbă nimic.",

  // E12/S4. Moving a child to another group for the week. Each names a different reason that
  // class will not do, and the shared "există deja o înregistrare" would fit none of them.
  REPLACEMENT_OUT_OF_WEEK: "Mutarea se face în aceeași săptămână cu ora pierdută.",
  REPLACEMENT_SESSION_STARTED: "Ora a început deja — mutarea nu mai poate fi consemnată la ea.",
  REPLACEMENT_SESSION_FULL: "Nu mai e loc la ședința asta.",
  REPLACEMENT_AGE_MISMATCH: "Grupa nu e potrivită ca vârstă pentru copil.",
  REPLACEMENT_SAME_GROUP: "Asta e chiar grupa copilului — e ora lui, nu o mutare.",

  // E12/S5. The timetable screen can hit these when two admins act on the same class, or when the
  // list is stale; each is a different thing to do next.
  CLASS_SESSION_ALREADY_CANCELLED: "Ora e deja anulată.",
  CLASS_SESSION_NOT_CANCELLED: "Ora nu e anulată, deci nu are ce reactiva.",
  CLASS_SESSION_HAS_ATTENDANCE:
    "Ora are deja prezențe înregistrate, deci s-a ținut — nu mai poate fi anulată sau mutată.",

  // E15/S5. A percentage past 100 would take the invoice below zero, where the floor in pricing.ts
  // silently clamps it — so the only visible symptom would be a month that cost nothing.
  DISCOUNT_PERCENT_OVER_100: "O reducere procentuală nu poate depăși 100%.",

  // E16/S1. Money against a month the school chose not to charge for — the row picked is wrong.
  INVOICE_WAIVED: "Factura este anulată (0 lei) — nu se pot înregistra plăți pe ea.",

  // E12/S2. `PERIOD_OVERLAPS` and `PERIOD_ENDS_BEFORE_IT_STARTS` are deliberately absent: both
  // arrive already in Romanian, and the first names the period it collided with and its dates —
  // which is the whole answer. A generic line here would replace „se suprapune cu «Vacanța de
  // iarnă» (2026-12-21 – 2027-01-07)" with „există deja o înregistrare cu aceste date".
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
