# Inventarul datelor personale

> **Generat din cod. Nu se editează de mână.**
> Sursa e `apps/api/src/privacy/data-inventory.ts`; fișierul ăsta se reface cu
> `pnpm --filter api inventory:render`, iar `data-inventory.spec.ts` pică dacă cele două nu mai spun
> același lucru.

E07 S1. Tabelul răspunde, pentru fiecare câmp: unde stă, de ce, pe ce temei legal, cât se
păstrează și cine îl poate vedea. **Nota de confidențialitate din E22 S2 se scrie din el**, nu
alături de el.

Trei lucruri de citit înainte de tabele:

- **Ce face o coloană personală e că poartă un fapt despre om, nu că îi scrie numele.** Suma
  unei facturi nu e un număr în abstract, e ce datorează *familia asta*; regula din GDPR e
  „informație care *privește* o persoană identificabilă", nu „informație care o identifică".
  Ce rămâne în afară sunt cheile surogat, marcajele de timp ale rândului și mecanica internă:
  descriu rândul, nu persoana.
- **Ștergerea urmează rândul, nu coloana.** Ce pleacă odată cu familia decide tabelul de mai
  jos, prin `linkedVia`, nu tabelul de aici: un `createdAt` de pe rândul unui copil se șterge
  cu el, chiar dacă nu e trecut ca dată personală. Cele două tabele răspund la întrebări
  diferite — primul la „ce scrie în nota de confidențialitate", al doilea la „ce dispare".
- **Termenele nu sunt aici.** „Cât se păstrează" grupează câmpurile în cinci reguli; numărul pe
  care îl pune fiecare regulă e scris în E22 S3, fiindcă e o promisiune făcută familiei și
  trăiește în documentul pe care ea îl citește. E07 S4 și E04 S5 îl execută.

## Pe scurt

- **30 tabele**, cu **233 coloane** clasificate — toate, fiindcă garda cere o clasificare, nu o listă.
- **101 coloane sunt date personale**, în **22 tabele**.
- Restul de **132** sunt identificatori, marcaje de timp, orarul școlii sau mecanică internă; motivul e scris la fiecare.

## Datele personale, câmp cu câmp

| Câmp | Despre | Categorie | De ce | Temei | Cât | Cine vede |
| ---- | ------ | --------- | ----- | ----- | --- | --------- |
| `users.username` | Titularul contului | Identitate | Numele cu care se autentifică titularul contului. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `users.passwordHash` | Titularul contului | Credențiale | Verificarea parolei la autentificare. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Nimeni (nu se citește înapoi) |
| `users.role` | Titularul contului | Urme de utilizare | Ce poate face contul în platformă. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `users.emailConfirmedAt` | Titularul contului | Urme de utilizare | Dovada că adresa de email chiar aparține familiei. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `users.approvalStatus` | Titularul contului | Urme de utilizare | Dacă școala a recunoscut familia și i-a deschis contul. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `users.approvalDecidedAt` | Titularul contului | Urme de utilizare | Când s-a luat decizia de aprobare. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `users.rejectionReason` | Titularul contului | Conținut | Motivul scris de admin la respingerea unui cont. | Interes legitim | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `profiles.email` | Părinte | Date de contact | Facturi, chitanțe, anunțuri despre ore și proiectele copilului. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.phone` | Părinte | Date de contact | Contactul telefonic al școlii cu familia. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.firstName` | Părinte | Identitate | Identificarea familiei pe ecrane, facturi și mesaje. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.lastName` | Părinte | Identitate | Identificarea familiei pe ecrane, facturi și mesaje. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.address` | Părinte | Date de contact | Adresa de facturare. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `profiles.emergencyContactName` | Părinte | Date de contact | Pe cine sună școala dacă i se întâmplă ceva copilului și părintele nu răspunde. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.emergencyContactRelation` | Părinte | Date de contact | Ce e persoana de urgență pentru copil. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.emergencyContactPhone` | Părinte | Date de contact | Numărul la care se sună în urgență. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.marketingOptIn` | Părinte | Urme de utilizare | Dacă familia a acceptat comunicările comerciale. | Consimțământ | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.erasureRequestedAt` | Părinte | Urme de utilizare | Ziua în care familia a cerut ștergerea contului; de la ea curge termenul de 30 de zile. | Obligație legală | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `profiles.erasedAt` | Părinte | Urme de utilizare | Ziua în care s-a făcut ștergerea. | Obligație legală | Termenul contabil legal | Admin |
| `children.firstName` | Copil | Identitate | Catalogul, orarul și fișa copilului. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `children.lastName` | Copil | Identitate | Catalogul, orarul și fișa copilului. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `children.birthDate` | Copil | Identitate | Potrivirea cu banda de vârstă a grupei. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `enrollments.status` | Copil | Participare | Dacă copilul e la probă, activ sau a ieșit. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `enrollments.startDate` | Copil | Participare | De când vine copilul la grupă. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `enrollments.endDate` | Copil | Participare | Când s-a încheiat participarea. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `enrollments.exitReason` | Copil | Conținut | De ce a ieșit copilul din grupă. | Interes legitim | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `enrollments.contractSignedAt` | Copil | Participare | Ziua în care s-a semnat contractul pe hârtie (E07 S8). | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `waitlist_entries.status` | Copil | Participare | Unde stă cererea: în așteptare, ofertată, acceptată, expirată. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `waitlist_entries.offeredAt` | Copil | Participare | Când i s-a oferit familiei locul eliberat. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `waitlist_entries.respondBy` | Copil | Participare | Până când ține oferta. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `waitlist_entries.note` | Copil | Conținut | Nota biroului pe cererea din listă. | Interes legitim | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `attendances.type` | Copil | Participare | În ce calitate a fost copilul la oră — înscris, la probă, la recuperare. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `attendances.present` | Copil | Participare | Prezența la ședință; stă la baza facturii lunii. | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `absence_notices.reason` | Copil | Conținut | Ce a spus familia — de obicei „răcit", „plecați din oraș". | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `absence_notices.inTime` | Copil | Participare | Dacă anunțul a venit înainte de termen — se îngheață la scriere. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `session_count_overrides.monthIssued` | Copil | Financiar | Luna pe care se aplică decizia. | Executarea contractului | Termenul contabil legal | Admin |
| `session_count_overrides.sessions` | Copil | Financiar | Numărul de ședințe facturat în locul celui numărat din catalog. | Executarea contractului | Termenul contabil legal | Admin |
| `session_count_overrides.reason` | Copil | Conținut | De ce s-a decis altfel decât spune catalogul. | Interes legitim | Termenul contabil legal | Admin |
| `invoices.amount` | Părinte | Financiar | Cât datorează familia pe luna respectivă. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `invoices.dateIssued` | Părinte | Financiar | Data emiterii; de la ea curg cele 14 zile de termen. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `invoices.monthIssued` | Părinte | Financiar | Luna de curs facturată. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `invoices.status` | Părinte | Financiar | Dacă factura e neplătită, restantă, plătită sau anulată. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.amount` | Părinte | Financiar | Cât a plătit familia. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.method` | Părinte | Financiar | Cum a venit banul — numerar, transfer. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.status` | Părinte | Financiar | Dacă plata e inițiată, reușită, eșuată sau stornată. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.date` | Părinte | Financiar | Ziua plății. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.externalReference` | Părinte | Financiar | Referința din extrasul de cont, ca să se poată potrivi cu banca. | Obligație legală | Termenul contabil legal | Admin, Familia respectivă |
| `payments.smartbillReference` | Părinte | Financiar | Numărul documentului din SmartBill, când integrarea va exista. | Obligație legală | Termenul contabil legal | Admin |
| `payments.notes` | Părinte | Conținut | Nota biroului pe încasare. | Interes legitim | Termenul contabil legal | Admin |
| `discounts.name` | Părinte | Financiar | Cum se numește reducerea pe factură — „Frate", „Recomandare". | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `discounts.description` | Părinte | Conținut | Explicația scrisă de birou lângă reducere. | Interes legitim | Termenul contabil legal | Admin |
| `discounts.type` | Părinte | Financiar | Dacă reducerea e în lei sau în procente. | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `discounts.value` | Părinte | Financiar | Cât se scade din factura familiei. | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `discounts.monthIssued` | Părinte | Financiar | Luna pe care se aplică. | Executarea contractului | Termenul contabil legal | Admin, Familia respectivă |
| `projects.title` | Copil | Conținut | Numele lucrării, așa cum îl vede familia. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `projects.description` | Copil | Conținut | Ce a scris profesorul despre lucrare. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `projects.capturedOn` | Copil | Conținut | Când a fost salvată lucrarea. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `projects.status` | Copil | Conținut | Dacă lucrarea e nouă, revizuită sau trimisă. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `projects.source` | Copil | Conținut | De unde a venit lucrarea — agent sau încărcare manuală. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `projects.sentAt` | Copil | Conținut | Când a plecat lucrarea către familie. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `projects.sentToEmail` | Părinte | Date de contact | Adresa la care s-a trimis efectiv, păstrată ca dovadă a trimiterii. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `projects.reassignedAt` | Copil | Conținut | Când s-a corectat atribuirea greșită a unei lucrări (E14 S7). | Interes legitim | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `projects.reassignedFromChildId` | Copil | Conținut | De la ce copil a fost mutată lucrarea. | Interes legitim | Cât ține contul familiei (termenul: E22 S3) | Admin |
| `project_files.originalName` | Copil | Conținut | Numele sub care a salvat copilul fișierul. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `project_files.ingestionKey` | Copil | Conținut | Cheia de idempotență la încărcare: copilul plus hash-ul conținutului. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Nimeni (nu se citește înapoi) |
| `project_links.label` | Copil | Conținut | Cum se numește legătura. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `project_links.url` | Copil | Conținut | Unde duce — de obicei proiectul copilului pe un site terț. | Executarea contractului | Cât ține contul familiei (termenul: E22 S3) | Admin, Familia respectivă |
| `unassigned_files.relativePath` | Copil | Conținut | Unde stătea fișierul pe partajare, ca adminul să se ducă să se uite. | Interes legitim | Cât e nevoie operațional | Admin |
| `unassigned_files.fileName` | Copil | Conținut | Numele fișierului rătăcit. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.status` | Părinte | Participare | Unde a ajuns familia în pâlnie. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.source` | Părinte | Urme de utilizare | De unde a venit familia — formular, telefon, recomandare. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.channel` | Părinte | Urme de utilizare | Pe ce canal a ajuns la școală. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.parentName` | Părinte | Identitate | Cine a întrebat. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.parentEmail` | Părinte | Date de contact | Cum răspunde școala. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.parentPhone` | Părinte | Date de contact | Cum sună școala înapoi. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.childFirstName` | Copil | Identitate | Despre ce copil e vorba. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.childLastName` | Copil | Identitate | Despre ce copil e vorba. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.childBirthDate` | Copil | Identitate | Ca să se vadă ce grupă i s-ar potrivi. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.experience` | Copil | Conținut | Ce a spus părintele despre experiența copilului. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.lostReason` | Părinte | Conținut | De ce nu s-a înscris familia. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.notes` | Părinte | Conținut | Notele biroului după telefon. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.nextActionAt` | Părinte | Urme de utilizare | Când se recontactează familia. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.lastActivityAt` | Părinte | Urme de utilizare | Când s-a mișcat ultima oară ceva pe lead. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.trialHeldAt` | Copil | Participare | Când a fost ținută lecția de probă. | Interes legitim | Cât e nevoie operațional | Admin |
| `leads.decidedAt` | Părinte | Urme de utilizare | Când s-a hotărât familia, într-un sens sau altul. | Interes legitim | Cât e nevoie operațional | Admin |
| `outbox.to` | Părinte | Date de contact | Adresa la care pleacă mesajul. | Executarea contractului | Cât e nevoie operațional | Admin |
| `outbox.subject` | Părinte | Conținut | Subiectul mesajului trimis familiei. | Executarea contractului | Cât e nevoie operațional | Admin |
| `outbox.bodyText` | Părinte | Conținut | Textul trimis familiei — poate numi copilul, factura sau ora anulată. | Executarea contractului | Cât e nevoie operațional | Admin |
| `outbox.bodyHtml` | Părinte | Conținut | Aceeași scrisoare, în HTML. | Executarea contractului | Cât e nevoie operațional | Admin |
| `outbox.sentAt` | Părinte | Urme de utilizare | Când a plecat mesajul — dovada că familia a fost anunțată. | Executarea contractului | Cât e nevoie operațional | Admin |
| `sessions.tokenHash` | Titularul contului | Credențiale | Recunoașterea tokenului la reîmprospătare. | Executarea contractului | Expiră singur | Nimeni (nu se citește înapoi) |
| `sessions.revokedAt` | Titularul contului | Urme de utilizare | Când s-a încheiat sesiunea — logout sau semnal de furt. | Executarea contractului | Expiră singur | Admin |
| `sessions.userAgent` | Titularul contului | Urme de utilizare | De pe ce dispozitiv s-a intrat, ca sesiunile să se poată deosebi într-o listă. | Interes legitim | Expiră singur | Admin, Familia respectivă |
| `email_confirmations.tokenHash` | Titularul contului | Credențiale | Recunoașterea linkului de confirmare. | Executarea contractului | Expiră singur | Nimeni (nu se citește înapoi) |
| `email_confirmations.email` | Titularul contului | Date de contact | Adresa care se confirmă — înghețată la emitere, ca o schimbare ulterioară să nu valideze altceva. | Executarea contractului | Expiră singur | Nimeni (nu se citește înapoi) |
| `email_confirmations.consumedAt` | Titularul contului | Urme de utilizare | Când s-a deschis linkul. | Executarea contractului | Expiră singur | Admin |
| `document_acceptances.document` | Titularul contului | Urme de utilizare | Care document a fost acceptat. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin, Familia respectivă |
| `document_acceptances.version` | Titularul contului | Urme de utilizare | Ce versiune de text a citit familia — singura întrebare care contează dacă cineva întreabă. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin, Familia respectivă |
| `document_acceptances.acceptedAt` | Titularul contului | Urme de utilizare | Când a acceptat. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin, Familia respectivă |
| `audit_log.actorUserId` | Titularul contului | Urme de utilizare | Ce cont a făcut schimbarea. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin |
| `audit_log.actorUsername` | Titularul contului | Urme de utilizare | Numele contului, copiat la scriere ca urma să rămână citibilă după ștergerea lui. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin |
| `audit_log.changes` | Părinte | Financiar | Ce s-a schimbat: suma, data, starea — doar câmpurile care s-au mișcat. | Obligație legală | Evidență; supraviețuiește rândului descris | Admin |

## Unde stau rândurile unei familii

Coloana din mijloc e drumul pe care îl parcurge E07 S4: un export trebuie să găsească fiecare
rând despre o familie, iar o ștergere aceeași mulțime. Cele trei rânduri fără drum sunt scrise
așa dinadins, iar motivul e la fiecare în „Ce se ratează ușor".

| Tabel | Despre | Cum se ajunge la familie | Ce ține |
| ----- | ------ | ------------------------ | ------- |
| `users` | Titularul contului | `profile` | Contul de autentificare: cine se poate loga și cu ce rol. |
| `profiles` | Părinte | `self` | Familia: cine e părintele și cum se ia legătura cu el. |
| `children` | Copil | `parent` | Copilul înscris: cine e și în ce grupă intră. |
| `enrollments` | Copil | `child.parent` | Participarea unui copil la o grupă: de când, până când, în ce stare. |
| `waitlist_entries` | Copil | `child.parent` | Cererea unui copil pentru o grupă plină, și oferta făcută când s-a eliberat un loc. |
| `attendances` | Copil | `child.parent` | Catalogul: dacă un copil a fost la o ședință. |
| `absence_notices` | Copil | `child.parent` | Anunțul familiei că un copil nu vine la o ședință. |
| `session_count_overrides` | Copil | `child.parent` | Decizia biroului de a factura alt număr de ședințe decât cel numărat, pentru un copil, pe o lună. |
| `invoices` | Părinte | `parent` | Factura lunii pentru o familie. |
| `payments` | Părinte | `invoice.parent` | O sumă primită de la o familie pe o factură. |
| `discounts` | Părinte | `parent` | O reducere acordată unei familii pe o lună. |
| `projects` | Copil | `child.parent` | O lucrare a unui copil, de la salvarea pe partajare până la trimiterea către familie. |
| `project_versions` | Copil | `project.child.parent` | O versiune a lucrării — copilul a salvat din nou. |
| `project_files` | Copil | `version.project.child.parent` | Un fișier al lucrării, urcat în bucket. |
| `project_links` | Copil | `project.child.parent` | O legătură pusă lângă lucrare — Scratch, un site. |
| `unassigned_files` | Copil | **nu se poate ajunge prin relații** | Un fișier pe care agentul nu l-a putut atribui unui copil (E14 S2). |
| `leads` | Părinte | `profile` | Tot ce e între „cineva a întrebat" și „s-a înscris" (E20). |
| `outbox` | Părinte | **nu se poate ajunge prin relații** | Coada de mesaje: tot ce pleacă din backend trece pe aici. |
| `sessions` | Titularul contului | `user.profile` | Un refresh token emis, ca să poată fi revocat. |
| `email_confirmations` | Titularul contului | `user.profile` | Tokenul trimis la înregistrare, ca să se confirme adresa. |
| `document_acceptances` | Titularul contului | `user.profile` | Ce versiune a cărui document a acceptat cine, și când (E22 S4). |
| `audit_log` | Titularul contului | **nu se poate ajunge prin relații** | Cine a schimbat ce și când, pe drumurile banilor (E07 S3). |

## Ce nu e dată personală, și de ce

| Motiv | Câte | Coloane |
| ----- | ---- | ------- |
| configurația școlii | 18 | `locations.name`, `locations.slug`, `locations.street`, `locations.city`, `locations.district`, `locations.postalCode`, `locations.latitude`, `locations.longitude`, `locations.phone`, `locations.email`, `locations.openingHours`, `locations.isActive`, `rooms.name`, `rooms.isActive`, `groups.isActive`, `agent_status.agentName`, `agent_status.version`, `agent_status.watchedRoot` |
| identificator surogat | 31 | `users.id`, `profiles.id`, `children.id`, `enrollments.id`, `waitlist_entries.id`, `attendances.id`, `absence_notices.id`, `session_count_overrides.id`, `invoices.id`, `payments.id`, `discounts.id`, `projects.id`, `projects.publicId`, `project_versions.id`, `project_files.id`, `project_links.id`, `unassigned_files.id`, `leads.id`, `outbox.id`, `announcements.id`, `mail_templates.id`, `sessions.id`, `email_confirmations.id`, `document_acceptances.id`, `audit_log.id`, `locations.id`, `rooms.id`, `groups.id`, `class_sessions.id`, `non_teaching_periods.id`, `agent_status.id` |
| mecanică internă | 17 | `projects.sentOutboxMessageId`, `project_files.contentType`, `project_files.sizeBytes`, `unassigned_files.sizeBytes`, `unassigned_files.reportKey`, `leads.bookingKey`, `outbox.attempts`, `outbox.nextAttemptAt`, `outbox.lastError`, `outbox.dedupeKey`, `outbox.attachments`, `announcements.dedupeKey`, `sessions.familyId`, `audit_log.entityType`, `audit_log.entityId`, `audit_log.note`, `agent_status.lastError` |
| marcaj de timp al rândului | 23 | `users.createdAt`, `children.createdAt`, `enrollments.createdAt`, `waitlist_entries.createdAt`, `absence_notices.createdAt`, `session_count_overrides.createdAt`, `session_count_overrides.updatedAt`, `payments.createdAt`, `projects.createdAt`, `project_versions.createdAt`, `project_files.uploadedAt`, `project_files.createdAt`, `project_links.createdAt`, `unassigned_files.reportedAt`, `leads.createdAt`, `leads.updatedAt`, `outbox.createdAt`, `announcements.createdAt`, `mail_templates.updatedAt`, `sessions.createdAt`, `email_confirmations.createdAt`, `audit_log.occurredAt`, `non_teaching_periods.createdAt` |
| orar, sală, capacitate | 16 | `rooms.capacity`, `rooms.computers`, `rooms.hasProjector`, `rooms.hasWhiteboard`, `groups.name`, `groups.weekday`, `groups.startTime`, `groups.endTime`, `groups.capacity`, `groups.minAge`, `groups.maxAge`, `class_sessions.date`, `class_sessions.startTime`, `class_sessions.endTime`, `non_teaching_periods.startDate`, `non_teaching_periods.endDate` |
| text scris de școală | 10 | `announcements.audience`, `announcements.kind`, `announcements.subject`, `announcements.bodyText`, `mail_templates.key`, `mail_templates.subject`, `mail_templates.bodyText`, `mail_templates.bodyHtml`, `class_sessions.notes`, `non_teaching_periods.name` |
| starea rândului | 17 | `projects.hasThumbnail`, `project_versions.versionNumber`, `unassigned_files.reason`, `unassigned_files.resolvedAt`, `leads.noSeats`, `outbox.status`, `outbox.undeliverableReason`, `announcements.recipientCount`, `announcements.declinedCount`, `mail_templates.version`, `sessions.expiresAt`, `email_confirmations.expiresAt`, `audit_log.action`, `class_sessions.status`, `class_sessions.isVacation`, `agent_status.lastSeenAt`, `agent_status.pendingFiles` |

## Ce se ratează ușor

- **`users.passwordHash`** — Hash bcrypt, niciodată parola. Coloana e `select: false`: iese din bază doar cerută pe nume, de `AuthService.login`.
- **`users.rejectionReason`** — Nota adminului. Nu se întoarce părintelui — de asta `parent.user` se scoate din răspunsuri.
- **`profiles.emergencyContactName`** — Poate fi o a treia persoană, care nu are cont: datele ei ajung aici prin părinte.
- **`profiles.marketingOptIn`** — Implicit `false`. Gatează exclusiv `queueMarketing`; nicio factură și niciun anunț despre ore nu trece prin ea.
- **`profiles.erasureRequestedAt`** — O a doua cerere înainte ca prima să fie servită e aceeași cerere făcută de două ori: ziua dintâi rămâne.
- **`profiles.erasedAt`** — Rândul supraviețuiește ștergerii fiindcă facturile atârnă de el (`Invoice.parent` e `CASCADE`). Coloana asta e ce spune ecranelor că e o coajă, nu o familie pe care n-a completat-o nimeni.
- **`children.birthDate`** — Data nașterii unui minor. Verificarea de vârstă din E11 S6 e singurul lucru care o citește ca regulă.
- **`enrollments.exitReason`** — Text liber scris de birou despre o familie.
- **`enrollments.contractSignedAt`** — Doar faptul și ziua. Textul contractului nu e în platformă.
- **`absence_notices.reason`** — **De semnalat avocatului.** Școala nu cere date de sănătate, dar câmpul e liber și părinții scriu „răcit", „varicelă" — deci poate primi date din art. 9 GDPR fără ca cineva să le fi cerut. Ce se face cu asta se decide în E22 S2; aici se consemnează doar că se poate întâmpla.
- **`invoices.status`** — O memorie, nu adevărul: restanța se derivă din plățile reușite (E16 S7).
- **`projects.publicId`** — UUID pentru linkul de partajare; nu conține nimic despre copil.
- **`projects.status`** — Portalul arată doar `sent`: părintele nu vede ce n-a verificat încă nimeni.
- **`projects.sentToEmail`** — O a doua copie a adresei părintelui, înghețată la momentul trimiterii. E07 S4 trebuie să o găsească și pe ea.
- **`projects.reassignedFromChildId`** — Trimite la un alt copil decât cel al rândului: e urma greșelii, și e chiar rostul coloanei.
- **`project_files.originalName`** — Copiii își pun numele în numele fișierului. De asta cheile de obiect se derivă din identificatori, nu din el.
- **`project_files.ingestionKey`** — `{childId}:{sha256}` — conține id-ul copilului, deci e legată de el, chiar dacă nu se citește înapoi nicăieri.
- **`project_links.url`** — Poate conține numele de utilizator al copilului pe acel site.
- **`unassigned_files.relativePath`** — Calea trece prin folderele copiilor, deci **poate conține numele unui copil** — și nu se poate lega de un rând `Child`, fiindcă tocmai asta a eșuat. De aceea `linkedVia` e `null`: E07 S4 nu poate găsi rândul pornind de la familie.
- **`unassigned_files.reportKey`** — Grup plus cale, hash-uit pentru idempotență.
- **`leads.parentName`** — Scris de un formular public, înainte să existe vreun cont.
- **`leads.childBirthDate`** — Data nașterii unui minor, scrisă dintr-un formular public. Cel mai sensibil câmp pe care îl poate scrie cineva fără cont.
- **`leads.noSeats`** — Cererea pe care școala nu a putut-o servi. Despre grupă, nu despre familie.
- **`leads.bookingKey`** — Idempotență pentru formularul public.
- **`outbox.to`** — Rândul nu are relație către `Profile` — coada e partajată și scrie și către birou. E07 S4 trebuie să caute după adresă, nu după legătură; de asta `linkedVia` e `null`.
- **`outbox.lastError`** — Mesajul furnizorului. Poate cita adresa respinsă — de asta e citit doar de admin.
- **`outbox.dedupeKey`** — Conține identificatori (`receipt:412`), niciodată nume.
- **`outbox.attachments`** — Chei de obiect, nu octeți: cheile sunt derivate din identificatori.
- **`announcements.subject`** — Scris de școală. O verificare refuză să numească un copil fără confirmare explicită.
- **`sessions.tokenHash`** — SHA-256, niciodată tokenul: un backup scurs nu trebuie să dea nimănui sesiuni valide.
- **`sessions.familyId`** — Identifică lanțul de tokenuri al unui login, nu persoana.
- **`sessions.userAgent`** — Trunchiat dinadins: cât să deosebești două sesiuni, nu cât să faci o amprentă.
- **`audit_log.actorUsername`** — Denormalizat dinadins: o urmă care arată către un rând ce poate fi șters pierde exact intrările care contează.
- **`audit_log.entityId`** — Trimite la rândul schimbat — o factură, o plată. Datele familiei stau acolo, nu aici.
- **`audit_log.changes`** — Numai drumurile banilor sunt consemnate azi. Ce se ține despre o schimbare de `Profile` sau `Child` e decizia deschisă din E07 S3, exact fiindcă acolo *valoarea* e data personală.
- **`audit_log.note`** — Identificatori („copil 5, luna 2026-10"), niciodată nume.
- **`locations.phone`** — Telefonul filialei, nu al unei persoane.
- **`locations.email`** — Adresa filialei, nu a unei persoane.
- **`groups.minAge`** — Banda de vârstă a grupei, nu vârsta cuiva.
- **`class_sessions.notes`** — De ce s-a anulat ora — „Vacanța de iarnă". Despre oră, nu despre cineva.
- **`agent_status.agentName`** — Numele serviciului, nu al unui om.
- **`agent_status.watchedRoot`** — Rădăcina partajării. Sub ea sunt folderele copiilor, dar calea în sine e configurație.
