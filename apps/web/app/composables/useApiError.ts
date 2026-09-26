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

  // E04/S5 and E22/S3. A withdrawal starts the clock on a family's data, so it is refused while
  // something still ties the family to the school — and each refusal names what to close first.
  FAMILY_HAS_ENROLMENTS_IN_FORCE:
    "Familia are încă un copil înscris. Încheie întâi înscrierea — așa se eliberează și locul, pentru lista de așteptare.",
  FAMILY_ON_WAITLIST:
    "Familia e încă pe o listă de așteptare. Scoate-o întâi de acolo, apoi consemnează retragerea.",
  WITHDRAWAL_IN_FUTURE: "Retragerea se consemnează cu o zi care a trecut deja, sau cu ziua de azi.",
  ALREADY_ERASED: "Datele familiei au fost deja șterse.",
  NO_ERASURE_REQUEST:
    "Familia nu mai are o cerere de ștergere: a retras-o între timp, sau n-a făcut-o niciodată. Nu s-a șters nimic.",
  FAMILY_NOT_WITHDRAWN: "Familia nu mai e retrasă, deci nu s-a șters nimic la termen.",
  FAMILY_HAS_FISCAL_WORK:
    "Familia are o factură încă în drum spre SmartBill. Emite-o sau retrage-o, apoi șterge datele.",

  // E07/S4. The two refusals that stop a profile delete from taking the school's records with it.
  // Both name the door that does the thing the admin probably meant.
  PROFILE_HAS_INVOICES:
    "Familia are facturi emise, iar acelea se păstrează. Dacă a cerut ștergerea datelor, fă-o din Ștergeri.",
  PROFILE_HAS_CHILDREN:
    "Familia are copii înregistrați, cu prezențe și proiecte legate de ei. Șterge întâi copiii, sau fă ștergerea din Ștergeri.",

  // E07/S4 again, for a child. Deleting one cascades into the register and into the bucket, so the
  // two refusals name what happened rather than what is stored.
  CHILD_HAS_ATTENDANCE:
    "Copilul are prezențe marcate, iar catalogul se păstrează. Dacă nu mai vine, scoate-l din grupă.",
  CHILD_HAS_PROJECTS:
    "Copilul are lucrări încărcate. Șterge întâi lucrările, sau fă ștergerea din Ștergeri.",

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

  // E11/S2. Registration collides on two things, and one shared "există deja o înregistrare cu
  // aceste date" left a parent whose email was taken changing their username.
  USERNAME_TAKEN: "Există deja un cont cu acest nume de utilizator. Alege altul.",
  EMAIL_TAKEN: "Există deja un cont cu această adresă de email.",

  // A family's contact details, typed by the office or by the family. "Altei familii", not "unui
  // cont": the holder is often a family the office entered from a phone call, with no account.
  PROFILE_EMAIL_TAKEN: "Adresa de email este deja trecută la altă familie.",
  PROFILE_PHONE_TAKEN: "Numărul de telefon este deja trecut la altă familie.",

  // The confirmation link. Three separate cases, because what the reader should do differs in each:
  // ask for a new link, nothing at all, or check they copied the whole address.
  CONFIRMATION_TOKEN_INVALID:
    "Linkul de confirmare nu este valid. Verifică dacă l-ai copiat întreg.",
  CONFIRMATION_TOKEN_USED: "Linkul a fost deja folosit — adresa ta este confirmată.",
  CONFIRMATION_TOKEN_EXPIRED: "Linkul de confirmare a expirat. Cere unul nou din contul tău.",
  CONFIRMATION_TOKEN_SUPERSEDED:
    "Adresa de email s-a schimbat între timp, iar linkul acesta confirma adresa veche. Caută în inbox linkul trimis la adresa nouă.",
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
  ENROLLMENT_END_IN_FUTURE:
    "O înscriere se închide în ziua în care pleacă copilul, nu dinainte: închiderea eliberează locul pe loc.",
  ALREADY_ON_WAITLIST: "Copilul este deja pe lista de așteptare a acestei grupe.",
  // The entry left the list between the screen loading and the press — the family answered, or the
  // offer expired. Reloading shows what happened to it.
  WAITLIST_ENTRY_CLOSED:
    "Cererea nu mai este pe listă. Reîncarcă pagina ca să vezi ce s-a întâmplat cu ea.",
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
  PROJECT_CHANGED: "Documentul s-a schimbat între timp. Reîncarcă pagina și încearcă din nou.",
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
  // `ROOM_TOO_SMALL` and `ROOM_SMALLER_THAN_GROUP` are absent on purpose, like `GROUP_FULL`: both
  // arrive with the room and the numbers in their own sentence.
  // E12/S8 and E15/S9. The vacation tick and the session-count override are billing facts, and
  // both freeze with the invoice.
  MONTH_ALREADY_INVOICED: "Luna e deja facturată — ce a intrat pe factură nu se mai poate schimba.",
  CLASS_SESSION_NOT_CANCELLED: "Ora nu e anulată, deci nu are ce reactiva.",
  CLASS_SESSION_HAS_ATTENDANCE:
    "Ora are deja prezențe înregistrate, deci s-a ținut — nu mai poate fi anulată sau mutată.",

  // E15/S5. A percentage past 100 would take the invoice below zero, where the floor in pricing.ts
  // silently clamps it — so the only visible symptom would be a month that cost nothing.
  DISCOUNT_PERCENT_OVER_100: "O reducere procentuală nu poate depăși 100%.",
  // E15/S6. The invoice was computed from the month's discounts when it was issued, never again.
  DISCOUNT_MONTH_INVOICED:
    "Familia are deja factura pe luna aceea, iar suma ei nu se mai recalculează — reducerea n-ar ajunge pe ea. Corectează factura sau șterge-o și emite luna din nou; o factură fiscală se stornează în SmartBill.",

  // E16/S1. Money against a month the school chose not to charge for — the row picked is wrong.
  INVOICE_WAIVED: "Factura este anulată (0 lei) — nu se pot înregistra plăți pe ea.",
  // A free month is recorded as a 0-lei row with nothing to print (E15/S6).
  INVOICE_WAIVED_HAS_NO_PDF:
    "Luna aceasta a fost consemnată fără plată (0 lei), deci nu are factură de descărcat.",

  // The review of 25 September 2026: an invoice's payments are not deleted along with it, and a
  // month made free cannot keep money against it.
  INVOICE_HAS_PAYMENTS:
    "Factura are plăți înregistrate pe ea. Ca s-o ștergi, șterge întâi plățile; ca s-o treci la 0 lei, stornează sau șterge plățile încasate.",

  // E16/S2. SmartBill holds the fiscal document; the platform's row cannot drift from it.
  INVOICE_HAS_FISCAL_DOCUMENT:
    "Factura e emisă în SmartBill — suma, data sau ștergerea se corectează acolo, printr-o stornare.",
  FISCAL_NOT_RETRYABLE: "Factura nu e refuzată și nici în verificare, deci nu are ce retrimite.",
  FISCAL_NOT_UNDER_REVIEW: "Factura nu mai e în verificare — reîncarcă pagina.",
  FISCAL_NOT_CONFIGURED: "Seria de facturi SmartBill nu e configurată pe server.",
  FISCAL_INVOICE_NOT_ISSUED_YET:
    "Factura fiscală nu a fost emisă încă în SmartBill. Revino în câteva minute.",
  FISCAL_PDF_UNAVAILABLE:
    "SmartBill nu a trimis încă PDF-ul facturii. Încearcă din nou peste puțin timp.",

  // E16/S5. A payment SmartBill holds keeps its sum; the way out is a reversal, not a delete.
  PAYMENT_RECORDED_IN_SMARTBILL:
    "Încasarea e înregistrată în SmartBill: suma, data și metoda nu se mai schimbă, iar plata nu se șterge. Stornează plata aici și șterge încasarea din SmartBill.",
  PAYMENT_FISCAL_NOT_RETRYABLE:
    "Plata nu e refuzată și nici în verificare, deci nu are ce retrimite în SmartBill.",
  PAYMENT_FISCAL_NOT_UNDER_REVIEW: "Plata nu mai e în verificare — reîncarcă pagina.",
  // E16/S8. The statement reader names what it looked for; a line becomes a payment once.
  STATEMENT_UNREADABLE:
    "Nu am găsit în fișier capul de tabel al extrasului — o coloană de dată și una de sumă (sau credit). Exportă extrasul din bancă în CSV.",
  STATEMENT_LINE_ALREADY_MATCHED:
    "Linia din extras e deja înregistrată ca plată — reîncarcă pagina.",
  RECEIPT_NUMBER_REQUIRED:
    "O plată în numerar e o chitanță în SmartBill: scrie numărul chitanței, așa cum apare acolo.",

  // E12/S2. `PERIOD_OVERLAPS` and `PERIOD_ENDS_BEFORE_IT_STARTS` are deliberately absent: both
  // arrive already in Romanian, and the first names the period it collided with and its dates —
  // which is the whole answer. A generic line here would replace „se suprapune cu «Vacanța de
  // iarnă» (21 decembrie 2026 – 7 ianuarie 2027)" with „există deja o înregistrare cu aceste date".
};

/**
 * A message to show the user. `details` wins when present: "phone must be a valid phone number"
 * is more useful than "datele nu sunt valide", even in English, because it names the field.
 *
 * **`err.message` is never shown, and that is the point of the last line.** Everything above it
 * comes out of `err.data` — the body the API answered with. `err.message` is the layer below that:
 * when the request never reached anybody, ofetch synthesises a string out of the method, the URL
 * and the browser's own wording. It used to win over `fallback`, so an admin whose connection
 * dropped read this, in a Romanian-only interface, with the internal address in it:
 *
 *     [GET] "http://127.0.0.1:3000/groups": <no response> Failed to fetch
 *
 * Which is the most likely error of all on the wifi in a classroom, on every screen at once. The
 * caller's `fallback` says what the screen was trying to do and is written in the right language,
 * so it is what is left when the server said nothing.
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
  return fallback;
}
