# CLAUDE.md

Ghid pentru agenți care lucrează în acest repo. Vezi și [README.md](README.md) pentru quick start.

## Ce este

ITBridge School — platformă de management pentru o școală de IT pentru copii (interfață în română).
Părinții își fac cont, înregistrează copiii, copiii intră în grupe, se marchează prezența, iar
lunar se emit facturi (PDF în S3) și se înregistrează plățile.

Monorepo pnpm, orchestrat cu Turborepo, plus Postgres ca infrastructură locală:

| Workspace            | Stack                                                                 | Port       |
| -------------------- | --------------------------------------------------------------------- | ---------- |
| `apps/api/`          | NestJS 11, TypeORM, JWT, PDFKit, AWS S3, sharp                        | 3000       |
| `apps/web/`          | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind                                   | 3001       |
| `apps/agent/`        | Node 22 simplu, **zero dependențe de runtime** — agentul de încărcare | —          |
| `packages/types/`    | contractul API partajat, `@itbridge/types`                            | —          |
| `docker-compose.yml` | Postgres 17 + MinIO — singurele lucruri care rulează în Docker        | 5432, 9000 |

`apps/agent` nu rulează local și nu pornește cu `pnpm dev`: e un serviciu Windows care stă pe
calculatorul din birou al școlii, urmărește o partajare de rețea și urcă prin API ce salvează
profesorii acolo (E14 S2). Se construiește cu `pnpm --filter agent build`; instalarea e în
[apps/agent/README.md](apps/agent/README.md).

## Cele două branch-uri

**`release/prod` e site-ul public. `release/stage` e restul.**

Vercel servește `release/prod` pe `itbridgeschool.com`, iar paginile publice nu ating backend-ul —
de asta site-ul stă în producție deși API-ul de producție nu e deployat nicăieri. Tot ce e după
autentificare — portalul, zona de admin, întreg `apps/api` de după E08 — trăiește pe `release/stage`,
iar de acolo **se deployează singur**: web pe `stage.itbridgeschool.com` (Vercel), API pe
`api-stage.itbridgeschool.com` (EC2). Un push pe branch e un deploy; vezi „Infrastructură — stare
reală" mai jos.

În `release/prod` intră doar ce afectează site-ul public și poate fi verificat fără backend:
conținut, SEO, performanță, corecturi de interfață publică. Se aduc prin cherry-pick, nu prin merge
din `release/stage` — un merge ar trage în producție jumătate de platformă care n-are unde să
ruleze.

**Documentația din `docs/` și fișierul ăsta sunt identice pe ambele branch-uri**, fiindcă descriu
proiectul, nu ramura. Deci pe `release/prod` vei citi despre module care nu există în arborele de
sub tine — `enrollment`, `project`, `storage` — și e în regulă: sunt pe `release/stage`. Ce **nu** e
în regulă e ca cele două copii ale documentației să divergă; dacă atingi una, adu-o și pe cealaltă.

**Amândouă numele sunt noi: `main` → `release/prod` și `develop` → `release/stage`, septembrie 2026.** Sunt redenumiri, nu branch-uri noi — același istoric, aceleași SHA-uri — deci un mesaj de
commit, un titlu de PR sau un paragraf mai vechi care spune `main` sau `develop` vorbește despre
ele. Pe origin nu mai există niciunul dintre numele vechi. Într-o clonă mai veche:

```bash
git branch -m main release/prod
git branch -m develop release/stage
git fetch origin
git branch -u origin/release/prod release/prod
git branch -u origin/release/stage release/stage
git remote set-head origin -a
```

**Vercel nu află de redenumire dintr-un webhook.** El construiește la push, iar o redenumire nu
produce niciun commit — deci tot istoricul de deployment-uri rămâne legat de numele vechi și
`release/prod` are zero, iar dashboard-ul refuză să-i dea Production Branch sau un domeniu, cu
„No deployments found". Nu e un buton de apăsat: se deblochează la primul commit care ajunge pe
branch. Production Branch din Settings → Git se pune de mână, o singură dată.

## Comenzi

Toate de la rădăcină. Nu intra în `apps/*` să rulezi `npm` — nu există `package-lock.json` și nu
mai există `node_modules` propriu.

```bash
cp .env.example .env              # un singur .env, la rădăcină
pnpm install
docker compose up -d              # Postgres + MinIO; aplicația rulează pe Node
pnpm --filter api migration:run   # schema; synchronize e oprit
pnpm seed                         # date de dezvoltare; admin / parola123
SEED_TODAY=2026-03-16 pnpm seed   # aceleași date, dar ancorate la o zi fixă
pnpm dev                          # api + web, hot reload

pnpm build          # turbo, în ordinea dependențelor
pnpm typecheck      # toate workspace-urile
pnpm lint           # verifică, nu modifică; corectare: pnpm --filter api lint:fix
pnpm test           # jest pe api, vitest pe web
pnpm test:e2e       # integrare prin HTTP; cere Postgres pornit
pnpm test:a11y      # axe-core pe paginile publice, într-un Chromium adevărat; construiește întâi
pnpm test:a11y:auth # același lucru pe ecranele din spatele autentificării; cere API pornit și seed
pnpm test:privacy   # aceleași pagini: nicio cerere în afara originii, niciun cookie
pnpm test:links     # aceleași pagini: fiecare link intern răspunde 200, fragmente incluse

pnpm --filter api <script>   # o comandă într-un singur workspace
```

Aplicația **nu** rulează în Docker, nici local nici în producție. Backend-ul își citește `.env`
prin `apps/api/src/load-env.ts`, importat înaintea oricărui modul care atinge `process.env` la
încărcare — dacă adaugi un import nou în `main.ts`, lasă-l pe ăsta primul.

**Seed-ul e ancorat la ziua de azi, nu la o constantă.** Tot ce scrie atârnă de `SEED_TODAY` din
`apps/api/src/seed/seed.ts`: cele opt săptămâni de prezență din urmă, orizontul de orar din față,
lunile care au facturi. Era o dată fixă, iar la șase luni după ce a fost scrisă o bază proaspăt
populată se deschidea pe „Nicio oră azi", cu cea mai nouă factură veche de jumătate de an. Acum
implicitul e ziua curentă, iar `SEED_TODAY=2026-03-16` o fixează la loc dacă vrei două rulări
identice. Grupele acoperă luni–sâmbătă tocmai ca „azi" să aibă o oră în șase zile din șapte.
`pnpm seed` nu trece prin turbo, deci variabila **nu** se declară în `globalEnv`.

**Seed-ul are două ținte, iar `seed-target.ts` e tot ce le desparte.** `pnpm seed` merge pe baza
locală; `pnpm seed:stage` citește `.env.stage` și merge pe staging. Pe orice host care nu e
localhost, `checkSeedTarget` cere două lucruri și le **refuză**, nu le avertizează:
`SEED_ALLOW_NON_LOCAL` trebuie să fie **numele bazei**, nu `1` — un „da" rămas într-un fișier de
mediu autorizează orice scrie `DB_NAME` data viitoare —, iar `SEED_PASSWORD` trebuie setată, fiindcă
`parola123` e în repo și pe un host public ar fi un cont de admin publicat. Parola de pe staging nu
se tipărește la final: ar ajunge în logul rulării. Regula e pură și are spec propriu; dacă adaugi o
a treia țintă, treci prin ea, nu pe lângă.

**`seed:stage` trimite `SEED_TARGET=stage`, iar o bază locală de acolo e refuz.** `dotenv -e
.env.stage` **nu dă eroare când fișierul lipsește** — încarcă nimic —, iar `data-source.ts` cade
atunci pe `localhost`, deci comanda ar fi golit tăcut baza de dezvoltare a celui care aștepta să se
umple staging-ul: exact greșeala de țintă pe care restul fișierului o oprește, intrată pe ușa din
față. Dacă adaugi o comandă de seed pentru încă un mediu, dă-i și ei un `SEED_TARGET` — un flag de
mediu care se pierde tăcut e mai rău decât unul care lipsește.

**O variabilă de mediu nouă trebuie declarată în `turbo.json`, la `globalEnv`.** Turbo rulează în
mod `strict`: un task vede doar ce e declarat acolo, iar restul lipsesc fără niciun mesaj. E cea
mai probabilă cauză când ceva „nu vede” o variabilă pe care tocmai ai pus-o în `.env`.

Swagger UI: `http://localhost:3000/api`. La fiecare boot, `apps/api/src/main.ts` scrie schema în
`./swagger.json`, relativ la directorul din care rulează procesul. Fișierul e în `.gitignore`,
deci nu există într-o clonă proaspătă — apare doar după prima pornire.

## Contractul API

`packages/types` descrie **formatul de pe sârmă**, nu entitățile: `Date` devine string, fiindcă
asta face `JSON.stringify` la ieșirea din controller. E consumat de ambele părți — `apps/web` prin
punțile subțiri din `app/types/`, `apps/api` prin verificările de tip din `src/contract.ts`.

Consecința practică: dacă schimbi un câmp într-o entitate, actualizează și contractul, altfel cade
`pnpm typecheck` pe `api`. Dacă schimbi contractul, cade `web`. Asta e intenția — înainte, cele
două seturi de tipuri divergeau tăcut.

## Arhitectură

**Backend** — douăzeci de module în `apps/api/src/modules/`, cincisprezece după același tipar
`controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `enrollment`, `location`,
`room`, `group`, `class-session`, `attendance`, `invoice`, `payment`, `discount`, `announcement`,
`lead`.
Cinci ies din tipar: `storage` n-are controller, fiindcă nimic din el nu e expus pe HTTP, `mail` are unul singur
și îngust — editorul de șabloane din E17 S2; trimiterea în sine rămâne neexpusă —, `health` n-are
decât atât, iar `project` are **două** controllere și patru servicii — audiențele sunt diferite
(agentul de pe Windows și ecranele), iar treburile la fel: ce e un document, ce pleacă din clădire,
ce ia părintele acasă, ce cere agentul. `dashboard` are și el două controllere și patru servicii, dar
din motivul opus: nu deține nimic, ci adună — vezi regula lui E21 mai jos. Entitățile stau centralizat
în `apps/api/src/entities/` și
sunt expuse tuturor modulelor prin `EntitiesModule` (un singur `TypeOrmModule.forFeature`
reexportat), deci un modul nou importă `EntitiesModule`, nu entitățile individual.

**Stocarea de obiecte e un modul propriu, `storage`.** `S3Service` stătea în modulul de facturi și
știa un singur tip de fișier: fixa `ContentType: 'application/pdf'` pe orice upload. E14 are nevoie
de `.sb3`, de JPEG și de video, deci serviciul s-a generalizat și s-a mutat — `putObject` cere acum
tipul ca argument, iar clientul știe `HeadObject`, ștergere, stream și URL semnat. Bucket-ul rămâne
unul singur; `projects/` stă lângă `invoices/`.

**Model de date** — `User` (credențiale) și `Profile` (date de contact) sunt separate
intenționat: un admin poate crea un `Profile` fără cont, iar `GET /users/without-profile`
servește fluxul de legare ulterioară. `Profile` e "părintele" în tot restul modelului.

```
User ─1:1─ Profile ─1:N─ Child ─N:1─ Group ─N:1─ Room ─N:1─ Location
                    │      ├─1:N─ Enrollment ─N:1─ Group
                    │      ├─1:N─ WaitlistEntry ─N:1─ Group
                    │      ├─1:N─ Attendance ─N:1─ ClassSession ─N:1─ Group
                    │      └─1:N─ Project ─1:N─ ProjectVersion ─1:N─ ProjectFile
                    │                    └─1:N─ ProjectLink
                    ├─1:N─ Invoice ─1:1─ Payment
                    └─1:N─ Discount
```

**`Child.group` e derivată, nu un fapt.** Din E11/S1, participarea unui copil la o grupă e un rând
în `enrollments`, cu perioadă, stare și motiv la ieșire. Coloana de pe `Child` a rămas fiindcă șase
interogări o citesc — printre ele filtrarea orarului pentru părinte și cine poate fi marcat prezent
— dar are **un singur scriitor**, `EnrollmentService`, care o scrie în aceeași tranzacție cu
înscrierea care o justifică. Nu o scrie de mână nicăieri; dacă ai nevoie să schimbi grupa unui copil,
deschizi sau închizi o înscriere.

Două reguli sunt aplicate **și în baza de date**, prin indecși parțiali, nu doar în serviciu:
`UQ_enrollments_one_in_force` (un copil are cel mult o înscriere `TRIAL` sau `ACTIVE` — D6) și
`UQ_waitlist_one_open_per_child_group`. Serviciul verifică întâi, ca refuzul să fie un 409 cu motiv;
indexul e acolo pentru doi admini care apasă în aceeași secundă.

**Proba ocupă un loc, dar nu se facturează.** Orice număr de „locuri ocupate" e `TRIAL` plus
`ACTIVE`, niciodată doar al doilea — un copil la probă stă pe un scaun, la un calculator, în aceeași
sală (D7). Numără-le prin `EnrollmentService.occupancyOf`, nu din lungimea listei de copii afișate:
lista nu conține probele, deci un număr calculat din ea spune că o grupă plină mai are loc.

**Factura numără înscrierile `ACTIVE`, nu copiii din familie.** Din E11/S4: proba e gratuită, iar un
copil care nu e în nicio grupă nu vine, deci nu plătește. Al doilea caz era greșit dinainte să existe
probele. Dacă schimbi asta, e o decizie de preț și e a E15 — nu o numărare de rânduri în `children`.

**Un copil își schimbă grupa doar prin transfer**, `POST /enrollments/transfer`: închide vechea
înscriere și o deschide pe cea nouă într-o singură tranzacție. Locul eliberat de un transfer **nu**
se oferă listei de așteptare — nu e liber, se dă acestui copil. Coada e întrebată doar când un loc
chiar pleacă din grupă.

**Contractul de înscriere e pe hârtie; platforma ține faptul și ziua, nimic altceva** (E07 S8).
`Enrollment.contractSignedAt` se completează la înscriere, la confirmarea probei sau după, prin
`PUT /enrollments/:id/contract` — cu `null` pentru o dată greșită. **Proba e refuzată**
(`TRIAL_HAS_NO_CONTRACT`): e gratuită și n-are contract, deci o dată pe ea ar spune că familia s-a
angajat înainte să decidă. Lista `GET /enrollments/without-contract` numără doar înscrierile
**active**: o înscriere închisă e istorie, iar tabloul de bord o cere de la
`EnrollmentService.withoutContract`, nu numără el. Nu adăuga textul, versiunea sau o acceptare
digitală: nu există auto-înscriere, deci e mereu cineva în cameră când se semnează, iar hârtia se
obține la fel de ușor ca o bifă.

**Verificarea de vârstă e avertisment, nu blocaj** (E11/S6): prima cerere primește 409
`COMPATIBILITY_WARNINGS` cu vârstele în mesaj, a doua trece cu `acknowledgeWarnings: true`. Nu e o
cale de acces peste capacitate — aia se verifică prima și refuză oricum. Dacă adaugi un endpoint care
înscrie, dă-i și câmpul: un avertisment fără cale de răspuns e un blocaj cu numele greșit.

**Prezența se leagă de ședință, nu de o dată și o oră.** `ClassSession` (tabelul `class_sessions`)
e ședința din orar, generată din programul grupei pe un orizont rulant de opt săptămâni, idempotent
pe `(group, date)`. Numele are prefix fiindcă `Session` e deja luat de tabelul de refresh tokenuri.

**Orarul ascultă de calendarul școlar, iar calendarul anulează, nu șterge.** `NonTeachingPeriod`
(E12 S2) e un **interval**, nu o zi: o vacanță de două săptămâni e un rând, o sărbătoare legală e un
rând cu aceleași date la ambele capete. `location` gol înseamnă „toată școala". Trei reguli care se
încalcă ușor:

- `generateForGroup` sare peste zilele acoperite și le numără în `skipped`. **Grupele se încarcă cu
  `relations: { room: { location: true } }`** — fără `location`, fiecare grupă se citește ca fiind
  fără locație și orice interval local golește orarul întregii școli, tăcut, fiindcă ședințele pe
  care le scoate pur și simplu nu apar. Testul unitar nu prinde asta: fixture-ul lui are relația
  oricum populată.
- Adăugarea unui interval trece ședințele din el în `CANCELLED` și le scrie numele intervalului în
  `notes`. Ștergerea intervalului **nu** le reactivează — o ședință anulată de vacanță și una anulată
  fiindcă profesorul a fost bolnav arată la fel după aceea. Reactivarea e per ședință.
- Suprapunerile sunt refuzate simetric, indiferent de locație (`PERIOD_OVERLAPS`). Regula mai îngustă
  ar face acceptarea să depindă de ordinea în care au fost tastate cele două intervale.

**O oră schimbată e trei scrieri într-o singură tranzacție** (E12 S5). Anularea, mutarea și
reactivarea trec prin `dataSource.transaction`: rândul, plasările copiilor mutați în ora aceea și
mesajele către familiile grupei stau sau cad împreună — o oră anulată fără ca nimeni să afle e exact
defecțiunea pentru care există coada. `ClassSessionNotifier` scrie **un mesaj per părinte**, nu per
copil, iar cheia de deduplicare poartă **a câta anunțare e pentru ședința aceea**, nu ziua: o oră
anulată, reactivată și anulată din nou — chiar în aceeași după-amiază — trebuie anunțată de două
ori, în timp ce doi admini care apasă în aceeași clipă nu. Reactivarea are mesaj din același motiv —
familiile au fost anunțate că nu se ține. Copiii mutați în ora anulată se eliberează în aceeași
tranzacție, prin `ReplacementService.clearOn` — **după** `notifyCancelled`, și ordinea e regula, nu
stilul: notificatorul citește plasările ca să afle care sunt familiile vizitatoare, iar una ștearsă
deja e o familie pe care n-o mai vede. Anularea **nu** compensează cu nimic: prețul e pe ședință
ținută (`pricing.ts`), deci ora care nu s-a ținut nu se facturează, iar un drept pe deasupra ar fi a
patra lecție la prețul a trei — o decizie de preț, nu o consecință a butonului. Dacă familia
trebuie totuși mutată undeva, se mută, din `/admin/absente`.

**O oră care nu se poate ține se recuperează dintr-un singur act, cheiat pe grupă și zi** (E12 S9).
`RescheduleService` (`apps/api/src/modules/class-session/reschedule.service.ts`) nu pornește de la
un id de ședință, fiindcă ora poate să nu fie un rând: o sărbătoare trecută în `/admin/calendar`
înainte de generare lasă ziua goală, una trecută după o anulează. Din amândouă stările — și din
cea programată — `POST /class-sessions/reschedule` scrie **exact un rând** pentru săptămâna grupei:
îl editează pe cel care există (și îl pune la loc dacă era anulat, cu nota de anulare păstrată) sau
îl scrie pe ziua-țintă. Nu trece prin `reinstateSession` + `moveSession`: ar fi două mesaje către
familie, dintre care primul, „ora se ține", e neadevărat pe o zi liberă. Ținta trebuie să fie **în
aceeași săptămână** — `RESCHEDULE_OUT_OF_WEEK` — fiindcă luna facturată e a lunii în care cade lunea
săptămânii (E15 S9), iar `moveSession` **nu** verifică asta, prin decizie amânată, nu prin scăpare.
Ferestrele din `GET /class-sessions/reschedule-windows` sunt pe grila școlii — orele de început ale
grupelor active de la adresa grupei, în sălile ei, regula pură fiind în `reschedule.rules.ts` — și
„liber" înseamnă doar sala: platforma nu are profesori (E09 e scos din MVP), deci o fereastră în care
același om predă în cealaltă sală se oferă cu convingere.

**O absență anunțată nu marchează pe nimeni absent** (E12 S3). `AbsenceNotice` leagă copilul de o
**ședință**, ca tot ce vorbește despre o oră de curs. Catalogul rămâne al profesorului: un copil al
cărui părinte a anunțat poate veni totuși. Trei lucruri de ținut minte: `inTime` se **îngheață la
scriere** — eligibilitatea e un fapt despre momentul anunțului, iar o valoare derivată la citire
și-ar schimba răspunsul pe măsură ce ora intră în trecut; un al doilea anunț **modifică** rândul, nu
adaugă unul (`UQ_absence_notice_child_session`), și rejudecă `inTime`; iar termenul se compară pe
**ceasul școlii**, prin `Intl` pe `Europe/Bucharest` — prin UTC, un anunț de la 01:00 ora Bucureștiului
ar fi judecat ca fiind ziua dinainte. Regula însăși („luni la 12:00 din săptămâna ședinței") e o linie
în `apps/api/src/modules/attendance/absence-notice.rules.ts`. **Biroul notează și mută din
`/admin/absente`**, iar ecranul arată `inTime` fără să-l facă poartă: de când notează adminul,
coloana spune când a tastat el, nu când a sunat familia, deci un buton „Mută" ascuns pe „după
termen" ar fi ținut de cod o regulă pe care S3 a lăsat-o dinadins biroului. Cifra celor de mutat stă
în meniu, prin `unplacedAbsencesStore`, din același motiv ca restanța de documente din E17 S8.

**`User.passwordHash` e `select: false`: nu iese din bază decât cerut pe nume.** Până în septembrie
2026 nu era, și singurul lucru dintre hash-ul unei familii și un browser era forma fiecărei
interogări — iar două au greșit-o: rândul întors de `POST /attendance/absences` și cel întors de
`PUT /children/:childId`, al doilea chiar către părinte. Consecințele de ținut minte: **singurul
cititor e `AuthService.login`**, care îl cere cu `.addSelect('user.passwordHash')` — un al doilea
loc care compară parola trebuie să facă la fel, altfel `bcrypt.compare` primește `undefined` și
refuză pe toată lumea; inserările și `update()` îl scriu oricum, fiindcă `select` guvernează doar
citirile. Și **contul tot nu se întoarce** acolo unde a fost încărcat doar ca să verifice
proprietatea: `AbsenceNoticeService.forResponse`, `ChildService.updateChild` și
`ProjectService.withoutAccount` scot `parent.user` înainte să răspundă, ca `ProfileService`, fiindcă
pe rând stă și `rejectionReason`, nota adminului pe care un părinte respins n-are de ce s-o
citească. Al treilea a venit ultimul și arată de ce regula are nevoie de mătură: `PROJECT_RELATIONS`
încarcă contul **numai** pentru ramurile de proprietate din `findByPublicId` și `findOne`, iar toate
trei răspunsurile îl dădeau înapoi — inclusiv singura rută pe care i-o trimite școala părintelui
prin email, `GET /projects/link/:publicId`. Hash-ul nu mai putea pleca pe acolo, fiindcă între timp
coloana devenise `select: false`; restul rândului putea. **Se scoate copiind, nu golind pe loc**:
`child.parent` e o relație încărcată, iar un câmp șters ajunge în orice altceva ține același obiect.
`password-hash.e2e-spec.ts` mătură rutele care au cont la un join distanță și verifică că
`passwordHash` nu apare nicăieri în corp, iar login-ul încă merge.

**Recuperarea nu e un credit, e o mutare pe o săptămână — și n-a mai fost un credit din E12 S4.**
`MakeUpCredit`, `MakeUpCreditService`, `AttendanceService.settleMakeUp`, `expiresOn` și tabela
`make_up_credits` **nu mai există**; dacă le găsești pomenite undeva, textul e vechi, nu codul.
Un jeton descrie o școală în care familia alege ora; asta citește luni absențele anunțate și mută
copiii între grupe cu mâna, fiindcă „ce grupă are un scaun liber și un profesor care mai poate lua
un copil de nouă ani" nu e o interogare. Deci toată tabela s-a strâns într-o coloană nullable pe
anunțul care a provocat-o: `AbsenceNotice.replacementSession`, scrisă de `ReplacementService`
(`apps/api/src/modules/attendance/replacement.service.ts`) din `/admin/absente`. Patru consecințe:

- **`null` înseamnă două lucruri, și le desparte calendarul**: cât săptămâna e în față, „nu s-a
  ocupat nimeni încă"; după ce a trecut, „nu s-a întâmplat". Nu adăuga o coloană de stare — ar fi al
  doilea loc care spune ce spune deja data.
- **Fereastra e săptămâna în care s-a pierdut ora** (`replacement.rules.ts`), fiindcă un copil nu
  poate sta cu altă grupă într-o săptămână care a trecut. Ce oprește o mutare e ora oferită
  (`canBackfill` — ședința de înlocuire n-a început încă), **nu** `inTime`: ăla rămâne un fapt despre
  anunț, iar biroul care tastează marți ce a sunat luni n-are de ce să coste familia săptămâna.
- **Marcarea nu mai consumă nimic.** `AttendanceType.MAKE_UP` se scrie în continuare singur pentru
  orice copil marcat în afara grupei lui, dar e o observație despre unde a stat, nu decontarea unui
  drept.
- **Locul liber se numără pe ședință**: un copil mutat temporar ocupă un scaun ca o probă (D7), deci
  înscrieri în vigoare plus copiii mutați în acea ședință — nu `occupancyOf`, care e despre grupă.
  Numărătoarea stă în `EnrollmentService.freeSeatsAt` / `freeSeatsAtSessions`, lângă `occupancyOf`:
  D7 are un singur proprietar, iar cei trei care întreabă — mutările, programarea la probă și
  rezervarea ei — obțin același răspuns. **Și se numără ținând lacătul**: `lockGroup` se ia pe rândul
  grupei _înaintea_ numărătorii, în aceeași tranzacție cu scrierea. Verificat-apoi-scris fără lacăt
  a fost exact defecțiunea pe care E20/S2 a închis-o pentru grupă și a lăsat-o deschisă pentru
  ședință: două programări la aceeași oră citeau amândouă ultimul loc, iar la `ReplacementService`
  verificarea stătea chiar în afara tranzacției care o folosea. Lacătul se pune înaintea numărului
  pe care îl apără; a doua luare, în `enrol`, e no-op în aceeași tranzacție.
- **A patra oară a fost pe partea care _eliberează_ locul**, și acolo victima nu e cel care se
  așază, ci cel care așteaptă. `offerFreedSeat` număra fără lacăt, deci un `enrol` care lua ultimul
  scaun se comitea nevăzut, iar familia din capul listei era anunțată că are locul 48 de ore pentru
  un scaun deja ocupat — exact rezultatul pentru care există lista. Lacătul stă acum **în**
  `offerFreedSeat`, lângă numărul pe care îl apără, nu în cei patru apelanți, ca a cincea cale care
  eliberează un loc să-l moștenească în loc să și-l amintească. Iar cele două căi care scriu un
  `WaitlistEntry` înainte să ajungă acolo — `expireLapsedOffers` și `removeFromWaitlist` — îl iau
  înaintea rândului ăluia: `enrol` ia grupa și _apoi_ decontează lista, deci ordinea inversă e
  singurul ciclu de deadlock din zonă.

**Proiectele elevilor merg într-o singură direcție, și nimic nu pleacă singur** (E14). Un fișier
salvat de profesor în folderul copilului, pe partajarea de rețea, e urcat de `apps/agent` prin
`POST /projects/ingest`, apare pe ecranul grupei în starea `nou`, iar un admin bifează și apasă. Abia
atunci se scriu mesajele în `outbox`, unul per **părinte** — nu per copil, ca un părinte cu doi copii
să primească un singur email. Trei consecințe de ținut minte:

- **Cheile de obiect se derivă, nu se stochează.** `projectFileKey(projectId, versionId, fileId)` și
  `projectThumbnailKey(projectId)` din `apps/api/src/modules/project/project.keys.ts` sunt singura
  definiție a locului. Numai identificatori, niciodată numele copilului — cheia ajunge în URL-uri
  semnate și în loguri, iar lecția e deja plătită pe facturi.
- **Încărcarea e idempotentă pe conținut**, nu pe nume: `{childId}:{sha256}`, cu index unic pe
  `project_files.ingestionKey`. Cheia e scopată pe copil, ca doi copii care salvează același fișier
  de pornire să nu se anuleze unul pe altul.
- **Un părinte vede doar ce a fost trimis.** Restrângerea e în serviciu, ca peste tot, și adaugă
  `status = 'sent'` pe lângă restrângerea pe utilizator. Portalul nu are voie să fie portița prin
  care se vede ce n-a verificat încă nimeni.

**Locația nu e un câmp pe grupă, ci o consecință a sălii.** `Group.room` e obligatoriu, `Room.location`
la fel, deci fiecare grupă știe unde se ține fără să poată contrazice sala. Ștergerile sunt
`RESTRICT` în ambele direcții, verificate întâi în serviciu, ca refuzul să ajungă la client ca 409 cu
explicație, nu ca 500 de la driver.

**Familia, în schimb, e `CASCADE` în trei direcții deodată, și de aia nu se șterge de nicăieri.**
`children.parent_id`, `invoices.parent_id` și `discounts.parent_id` sunt toate `CASCADE`, iar
`payments.invoice_id` e `CASCADE` după ele — deci un singur `DELETE` pe `profiles` lua copiii, toate
prezențele lor, proiectele, facturile emise și încasările înregistrate. Măsurat pe o bază reală:
1 copil, 1 înscriere, 1 factură, 1 plată înainte; zero din fiecare după. `ProfileService.deleteProfile`
refuză acum, cu cod propriu, dacă familia are facturi (`PROFILE_HAS_INVOICES`) sau copii
(`PROFILE_HAS_CHILDREN`) — ruta rămâne pentru rândul tastat greșit, atât. **Ștergerea unei familii e
E07 S4, `/admin/stergeri`**: aia păstrează facturile, golește rândul, curăță bucket-ul și scrie cine
a apăsat. Dacă adaugi o a doua ușă care șterge o familie, prima întrebare e ce ia cu ea — și
răspunsul nu se citește din entitate, fiindcă `onDelete` stă pe partea copilului.

**Același lucru, un nivel mai jos: `DELETE /children/:id`.** Tot ce atârnă de un copil e `CASCADE`,
inclusiv catalogul și proiectele — măsurat la fel: un copil, o înscriere și un marcaj înainte, zero
din fiecare după, 200, de pe tokenul părintelui. `ChildService.deleteChild` refuză acum dacă
copilul are prezențe (`CHILD_HAS_ATTENDANCE` — catalogul e ce s-a întâmplat, iar E15 S9 facturează
din el) sau lucrări (`CHILD_HAS_PROJECTS` — cheile de obiect se derivă din id-uri, deci după
ștergerea rândurilor nimic nu mai poate spune ce era de scos din bucket). **Înscrierile singure nu
blochează**, dinadins: o înscriere fără niciun marcaj consemnează o intenție, nu un fapt, iar
refuzul pe ea ar închide singura folosință rămasă rutei — un copil adăugat și repartizat din
greșeală. Ștergerea din E07 S4 nu trece pe aici: `ErasureService` șterge rândurile prin tranzacția
lui, după ce citește cheile.

**Auth** — două roluri, `ADMIN` și `PARENT` (`apps/api/src/enum/role.enum.ts`). `register` creează
întotdeauna `PARENT`; adminul se promovează manual prin DB sau `PUT /users/:id`. JWT în pereche
access (15 min) / refresh (7 zile), cu secrete distincte în `apps/api/src/constants/jwtConstants.ts`.

**Un cont de părinte trece prin două porți înainte să fie folosibil** (E11 S2). Sunt două coloane
independente pe `User`, nu un singur status: `emailConfirmedAt` — părintele a deschis linkul trimis
la înregistrare — și `approvalStatus` — un admin a recunoscut familia. „Activ" nu e stocat, e derivat
prin `isAccountActive` din `apps/api/src/entities/user.entity.ts`, fiindcă o a treia coloană ar fi
liberă să contrazică primele două. Adminii sunt exceptați: nimeni nu-i confirmă și nu-i aprobă.
**O adresă schimbată închide poarta la loc.** `PUT /profiles/:id` golește `emailConfirmedAt` și
trimite un link nou către adresa nouă, în aceeași tranzacție cu editarea — fiindcă „confirmat"
înseamnă că familia a dovedit că citește adresa _aceea_, iar după mutare n-a dovedit nimic. Regula
era deja scrisă, în comentariul lui `AuthService.resendConfirmation`: acela refuză să primească o
adresă tocmai ca nimeni cu o sesiune să nu poată trimite confirmarea unde vrea, și lasă redeschiderea
porții în seama editării care a mutat-o. Editarea n-o făcea. Cine apasă nu contează: un admin care
corectează o greșeală de tastare n-a dovedit mai mult decât familia. Compoziția — rând, token, link
randat, mesaj în coadă — e una singură, `EmailConfirmationService.issueAndSend`, iar cei trei
apelanți i-o dau pe a lor `EntityManager`.

**Și linkul vechi încetează să meargă în clipa aia.** Poarta închisă de editare se redeschidea
singură: linkul emis înainte de mutare mai trăia restul celor 48 de ore, iar un clic pe el punea
`emailConfirmedAt` la loc — pe o adresă pe care nu o dovedise nimeni. Ce autorizează ștampila aia e
tot: `queueOrRecord` o citește înainte să scrie la o adresă, iar `isAccountActive` înainte să lase un
copil într-o grupă. Deci cine putea citi adresa _veche_ — un străin, dacă motivul editării a fost o
greșeală de tastare — putea declara dovedită adresa nouă. `EmailConfirmation.email` purta de la
început adresa pentru care a fost emis linkul; nimeni n-o întreba. `confirm` refuză acum când nu mai
e adresa de pe fișă, cu cod propriu (`CONFIRMATION_TOKEN_SUPERSEDED`): cel care ține linkul n-a
greșit cu nimic, iar ieșirea e linkul mai nou, deja în inbox — altă propoziție decât „expirat".
Comparația trece prin `sameAddress` din `apps/api/src/common/same-address.ts`, aceeași pe care o
folosește `movesTheAddress`: una decide că editarea _e_ o mutare, cealaltă că linkul e vechi, și
n-au voie să nu fie de acord ce înseamnă „aceeași cutie poștală" — scrisă mai strict aici, o editare
care schimbă doar majusculele ar omorî singurul link viu al familiei.

Porțile se pot deschide în orice ordine, iar singurul lucru pe care îl blochează efectiv e
repartizarea unui copil într-o grupă (`PARENT_ACCOUNT_NOT_ACTIVE`). **Un cont neactiv se poate
autentifica** — portalul îi arată ce mai lipsește și butonul de retrimitere a linkului; un login care
refuză fără să explice ar lăsa familia să nu distingă „încă nu" de „stricat".

**Parola uitată e al treilea link din familia asta, și singurul care deschide contul.**
`PasswordResetService` (`apps/api/src/modules/auth/password-reset.service.ts`) stă lângă
`EmailConfirmationService` din același motiv pentru care acela stă lângă `AuthService`: unul e despre
a dovedi cine ești la fiecare cerere, ăsta despre singura clipă în care se schimbă chiar
credențialul. Tabela `password_resets` e modelată pe `email_confirmations`, care e modelată pe
`sessions` — **tokenul nu se stochează niciodată**, doar un SHA-256 al lui. Șase reguli, și cinci
dintre ele sunt diferențe față de linkul de confirmare, nu asemănări:

- **O oră, nu patruzeci și opt.** Linkul de confirmare are voie să aștepte duminica dimineața a
  cuiva, fiindcă tot ce dovedește e o adresă. Ăsta deschide un cont, iar fiecare oră în care rămâne
  valabil e o oră în care poate fi găsit într-un mail redirecționat sau într-o cutie de familie.
  Cine întârzie cere din nou — costă un clic, față de o ușă lăsată deschisă două zile.
- **A doua cerere o omoară pe prima.** Exact invers față de `resendConfirmation`, și dinadins: două
  tokenuri vii sunt două șanse pentru cine n-ar trebui să aibă niciuna, iar părintele care a apăsat
  de două ori se uită oricum la mailul mai nou. La confirmare, prețul invalidării e o familie care
  dă clic pe mailul vechi și e certată pentru asta; aici, prețul **ne**-invalidării e o ușă deschisă.
- **Nimic nu spune dacă adresa are cont.** `POST /auth/forgot-password` răspunde aceeași propoziție
  fie că a scris un rând, fie că n-a găsit nimic, fie că profilul e unul tastat de admin fără cont;
  iar `reset` dă **același** `RESET_TOKEN_INVALID` pentru un token necunoscut, unul expirat, unul
  folosit și unul emis pentru o adresă pe care contul n-o mai are. Un endpoint care distinge e un
  endpoint care enumeră, iar ăsta ar enumera familiile unei școli de copii. Ce **nu** e identic e
  durata: o adresă cunoscută randează un șablon și scrie două rânduri, una necunoscută se întoarce
  după un singur `SELECT`. Nivelarea ar însemna să facem munca și pentru adresele fără cont, iar
  ruta e limitată la trei pe minut — scris aici ca să nu fie descoperit mai târziu.
- **Adresa e înghețată la emitere și recitită la folosire.** E raționamentul
  `CONFIRMATION_TOKEN_SUPERSEDED` cu miza ridicată: dacă adresa a fost corectată fiindcă era greșit
  tastată, cutia în care a ajuns linkul poate fi a unui străin, iar un token care ar mai merge ar fi
  drumul lui înăuntru. Comparația trece prin acelaşi `sameAddress`.
- **Porțile contului nu se consultă.** O familie neconfirmată sau neaprobată își poate reseta
  parola: `isAccountActive` guvernează ce poate _face_ un cont, iar alegerea unei parole nu e printre
  acele lucruri. Un refuz aici ar lăsa o familie încuiată afară cu o ușă care se deschide doar după
  ce apasă altcineva un buton.
- **Se revocă toate sesiunile**, la resetare și la schimbarea din cont deopotrivă. Cine cere o
  resetare e ori încuiat afară, ori îngrijorat, iar în al doilea caz sesiunile rămase vii sunt exact
  cele ale persoanei de care se teme. `AuthGuard` nu atinge `sessions`, deci un access token emis
  înainte mai merge până la cincisprezece minute — compromisul deja documentat, și locul de schimbat
  dacă vine vreodată o cerință de revocare instantanee.

`POST /auth/change-password` **cere parola actuală**, și nu e ceremonie: un access token ține un
sfert de oră și e onorat fără să se atingă `sessions`, deci un telefon împrumutat sau un tab uitat
deschis ajunge până la rută. Ce știe doar proprietarul e ce oprește schimbarea să fie la îndemâna
oricui are fila deschisă. Cititorul hash-ului e al doilea din tot repo-ul, după `AuthService.login`,
și îl cere pe nume cu `.addSelect('user.passwordHash')` — fără asta, `bcrypt.compare` primește
`undefined` și refuză pe toată lumea.

**Înregistrarea are doi pași, iar al doilea nu se poate sări.** `register` cere cinci câmpuri —
utilizator, parolă, prenume, nume, email — și scrie în aceeași tranzacție contul, un `Profile`
**coajă** (atât cât să știm cine e și unde pleacă linkul de confirmare), tokenul de confirmare și
mesajele din outbox. Restul — telefon, adresă și contactul de urgență, toate trei — se cer imediat
după, pe `/user/profile-setup`, prin `PUT /profiles/:id`, unde sunt **obligatorii**. E11/S2 avusese
dreptate să strângă cei doi pași într-unul: ecranul al doilea de atunci era _opțional_, deci o
familie putea rămâne pentru totdeauna fără nicio cale de contact. Dar rezultatul a fost un prim
ecran cu zece câmpuri obligatorii, fix în epicul în care E20 coboară bariera de intrare — iar cine
abandonează la câmpul opt nu e o familie cu date incomplete, e o familie pe care școala n-a
văzut-o. Distincția față de starea dinainte de S2 e tot ce contează: pasul doi e acum de netrecut.

„Complet" nu se stochează, se derivă — `isProfileComplete` din
`apps/api/src/entities/profile.entity.ts` — din același motiv pentru care nu există o coloană
„activ": o a treia valoare ar fi liberă să contrazică cele șase câmpuri pe care le rezumă. Pleacă pe
sârmă ca `CurrentUser.profileComplete`, iar frontend-ul **nu o recalculează**: middleware-ul care
redirecționează și endpoint-ul care refuză repartizarea trebuie să spună același lucru despre
aceeași familie.

Poarta e tot repartizarea într-o grupă, dar cu cod propriu: `PARENT_PROFILE_INCOMPLETE`, separat de
`PARENT_ACCOUNT_NOT_ACTIVE`, fiindcă unul așteaptă un admin și celălalt așteaptă părintele — iar
trimiterea la ușa greșită înseamnă o familie care așteaptă pe cineva ce n-are ce face. Se verifică
în `EnrollmentService.enrol`, numai pentru profilurile **care au cont**: programarea publică la
probă din E20 scrie tot un `Profile` coajă, fără user, fără email și fără telefon, iar o poartă
oarbă la asta ar închide exact ușa pe care epicul o deschide. Nu se verifică la `transfer`: o
familie deja înscrisă nu se blochează retroactiv.

Celălalt drum către un `Profile` — adminul care introduce o familie de la telefon, prin
`POST /profiles` — rămâne exact cum era, cu toate câmpurile opționale. Sunt două uși cu reguli
diferite, fiindcă au surse de adevăr diferite. Un test ține fluxul adminului viu, ca să nu fie
strâns din greșeală odată cu `register`.

**Formularul are două bife, iar a doua nu e o exagerare de avocat** (E22 S4). Codul civil
art. 1203 spune că într-un contract standard clauzele neuzuale — la noi §14 suspendarea, §15
limitarea răspunderii, §18 modificarea unilaterală — **nu produc efecte** decât acceptate expres și
separat, deci o bifă care acoperă tot documentul e exact acceptarea care nu contează pentru ele.
De aici `acceptedUnusualClauses`, refuzat ca orice altceva decât `true`, și un al treilea rând în
`document_acceptances`: `unusual_clauses`, care poartă versiunea **termenilor**, fiindcă asta e — o
parte din ei, nu un al treilea document. Din același motiv titlurile din `docs/legal/` au acum
id-uri (`headingSlug` din `apps/web/server/utils/legal-markdown.ts`): o bifă care numește trei
secțiuni și duce în capul unui document de douăzeci nu e „expres" în niciun sens util.

**O versiune nouă se cere la prima autentificare de după, iar cine decide asta e serverul.**
`outstandingDocuments` (`apps/api/src/modules/auth/legal-acceptance.rules.ts`) compară evidența cu
`LEGAL_DOCUMENT_VERSIONS` prin **apartenență la mulțime**, nu prin „ultimul rând e vechi": un text
pus la loc la o versiune deja acceptată nu se cere a doua oară, fiindcă familia chiar a acceptat-o,
într-o zi pe care evidența o știe. Răspunsul pleacă în `GET /auth/me` ca
`pendingLegalDocuments`, lângă `profileComplete` și pentru același motiv — altfel ecranul care
redirecționează și evidența care consemnează ar avea două păreri despre aceeași familie. Patru
lucruri de ținut minte:

- **`POST /auth/accept-documents` scrie numai ce lipsește**, deci a doua apăsare nu mută ziua
  primei acceptări, și **refuză o listă care lasă ceva neacceptat** — cazul care contează fiind fix
  cel din art. 1203, bifa pe termeni fără bifa pe clauzele dinăuntru.
- **Evidența nu se actualizează niciodată, se adaugă.** Rândul de la versiunea veche rămâne: „ce a
  acceptat familia asta, și când" are răspuns pentru fiecare versiune, nu doar pentru ultima.
- **Adminii sunt exceptați**, ca la porțile de cont: termenii sunt contractul părintelui cu școala,
  iar o versiune nouă n-are voie să încuie afară singurii oameni care ar putea repara ceva.
- **Nicio rută nu refuză o cerere pentru asta.** §18 promite că portalul cere, nu că platforma se
  închide; poarta e `03.legal-acceptance.global.ts`, care **cedează cât timp ține poarta de profil**
  — două middleware-uri globale care redirecționează amândouă sunt o buclă fără eroare și fără log,
  iar precedența e scrisă în fișierul care a venit al doilea.

Protecția se compune per-handler, nu global:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
```

**Autorizarea pe date se face în service, nu în guard.** Tiparul de urmat, când adaugi un
endpoint pe care un părinte îl poate accesa doar pentru propriile date:

```ts
const qb = this.invoiceRepository
  .createQueryBuilder("invoice")
  .leftJoinAndSelect("invoice.parent", "parent");
if (role !== Role.ADMIN) {
  qb.leftJoin("parent.user", "user").andWhere("user.id = :userId", { userId });
}
```

Vezi `apps/api/src/modules/invoice/invoice.service.ts:118`. Același tipar în `payment`, `child`, `profile` — respectă-l.

**Numai `andWhere`, niciodată `where`, după ce ai început să compui.** `qb.where()` _înlocuiește_
toată clauza, deci un `where` pus după restrângerea pe utilizator o șterge fără niciun semn. Exact
așa a scăpat `PaymentService.findOne`: orice părinte putea citi plata oricărei alte familii, cu
profilul complet atașat. Dacă ai nevoie de o primă condiție, pune-o tot cu `andWhere`.

**Un slot care nu se potrivește cu nimic e aruncat în tăcere.** Ecranul de catalog a stat trei
story-uri fără butonul de salvare: blocul cu selectorul de oră și cu **Salvează Prezența** e un
`<template #footer>`, iar S5b a înlocuit `<UCard>`-ul care îl învelea cu `<AdminPage>`, care are doar
`#actions` și slotul implicit. Vue nu spune nimic despre un slot pe care nu-l cere nimeni, deci
profesorul putea marca toată grupa și n-avea ce apăsa. **Nimic nu putea prinde asta**: un slot care
nu duce nicăieri nu e eroare de tip, nu e finding de lint și nu e încălcare de accesibilitate —
conținutul absent n-are contrast și n-are etichetă lipsă, deci poarta din S6 a trecut ecranul de
două ori. Când muți un ecran pe `AdminPage`, uită-te ce sloturi foloseau învelișurile dinainte; ce
nu e `#actions` sau conținut implicit trebuie mutat, nu redenumit.

**Magazinele Pinia întorc `readonly(...)`, iar `Array.sort` reordonează pe loc.** Deci
`payments.value = paymentsStore.payments.sort(...)` nu sortează nimic: fiecare schimb e o scriere
refuzată de Vue — optsprezece avertismente pentru optsprezece rânduri — și înapoi vine lista în
ordinea în care a venit de la API, prefăcându-se sortată. Ecranul de plăți a promis „cele mai noi
întâi" fără să fie, de la început. Copiază înainte de sortare: `[...store.lista].sort(...)`.

**Un buton de retry care nu șterge eroarea apasă degeaba.** `AdminError` cheamă `load()` din nou, dar dacă acel `load()` nu pune `loadError` pe gol **înainte** de cerere, a doua încercare reușește, datele vin, iar `v-else-if="loadError"` ține cardul de eroare deasupra lor: cererea pleacă, primește 200, și pe ecran nu se schimbă nimic. Cinci ecrane au fost livrate așa, și niciunul n-a fost găsit citind — butonul e acolo, e legat, cheamă funcția care trebuie, iar ce lipsește sunt două linii la începutul unei funcții aflate la douăzeci de rânduri distanță. Forma corectă e `loading.value = true;` plus golirea lui `loadError`, amândouă înaintea lui `try`; `retry-clears-error.spec.ts` mătură sursele după ordinea asta.

**Nu pune `@input` pe un câmp de text Nuxt UI.** Handler-ul rulează, dar **înainte** ca `v-model` să scrie caracterul tocmai tastat: Vue îmbină ascultătorul venit prin `$attrs` cu al componentei într-un vector și le cheamă în ordinea aia, al nostru primul. Deci orice citește din model e cu o tastă în urmă. Căutarea de copii din catalog a fost exact asta: `a` nu găsea nimic (filtra pe șirul gol), `aa` găsea unsprezece (filtra pe `a`), iar un nume întreg nu găsea niciodată nimic. Derivă din model — un `computed` nu poate fi decalat față de ce citește. `@change` și `@blur` sunt emit-uri declarate și se produc după actualizare, deci sunt în regulă. `no-input-listener.spec.ts` ține linia.

**Frontend** — lanțul de autentificare are o ordine care contează:
`apps/web/app/plugins/01.auth.client.ts` setează `authInitialized` → middleware-urile globale
`01.auth.global.ts` și `02.profile-setup.global.ts` **ies devreme** dacă flag-ul e fals →
`apps/web/app/middleware/admin-check.ts` e opt-in, pus explicit pe paginile `/admin/*`. Prefixele numerice
din numele fișierelor dictează ordinea de execuție; nu le redenumi.

**Un plugin `async` care aruncă duce toată aplicația în pagina de eroare.** O respingere neprinsă la
boot nu strică ecranul care a cerut, ci **orice** pagină, pentru oricine e autentificat — iar cauza
nu se vede de pe ecranul stricat. `02.payments.client.ts` a fost exact asta: cerea toate facturile
la fiecare încărcare de pagină, fără `try`, ca să umple două booleene pe care nu le citea nimeni.
Șters. Dacă adaugi un plugin care atinge rețeaua, prinde-i eroarea și scrie de ce e în regulă să
continui fără — cum face `03.profile.client.ts`.

**Iar `useInvoiceApi()` și frații lui își fac câte un `ref` propriu la fiecare apel**, deci ce umple
un apelant nu se vede din alt apelant. E de ce plugin-ul de mai sus n-avea cum să folosească
cuiva: fiecare ecran își cheamă oricum propriul `fetch`. Ce se împarte între apelanți sunt doar
lucrurile declarate la nivel de modul, în afara factory-ului — și alea sunt magazinele Pinia, nu
composable-urile de API.

Tokenurile trăiesc în cookies (`apps/web/app/stores/tokenStore.ts`). Toate apelurile trec prin
`apps/web/app/composables/api/useApi.ts`, care face refresh automat pe 401 și de-duplică refresh-urile
concurente printr-un `refreshPromise` partajat. Nu apela `$fetch` direct — folosește
composable-urile din `apps/web/app/composables/api/`.

State-ul e în Pinia stores (`stores/`), tipurile în `types/`, câte un fișier per domeniu.

**Nuxt UI citește din `classical.css` și fundalul, și accentul.** Blocul de la finalul lui `:root`
(și geamănul lui din `.dark`) pune în variabilele lui Nuxt UI `--ui-bg`, `--ui-text`, `--ui-border`
**și `--ui-primary`**. Ultima a lipsit până la E18 S7, iar consecința e capcana pe care o repetă
oricine adaugă un jeton pe jumătate: `--ui-primary` rămâne la 500-ul rampei, adică `--color-accent`
— o culoare tunată pentru 3:1, deci pentru chenare și text mare, nu pentru text. Toată zona
autentificată citea așa la **2,61:1**, exact cifra pe care E18 S6 o scosese din paginile publice.
Textul de accent merge pe `--color-accent-ink`; dacă adaugi o variabilă nouă de Nuxt UI, pune-o
tot acolo, nu într-o componentă.

**Șirurile lui Nuxt UI sunt în română, prin `<UApp :locale="ro">` din `app.vue`.** Tot ce randează
o componentă pentru sine — eticheta care deschide meniul, „No data" sub un tabel gol, butoanele de
închidere — vine din locale-ul pachetului, iar implicitul e engleza. Regula „numai codul e în
engleză" acoperă și etichetele pe care nu le-a scris nimeni din echipă.

**Iconițele sunt împachetate local, nu cerute de la Iconify.** `@iconify-json/lucide` e instalat, deci
`@nuxt/icon` scanează sursele și pune în bundle doar iconițele folosite (43, 10,4KB la E18 S7),
servite de pe domeniul propriu. Fără pachet, fiecare iconiță e o cerere către `api.iconify.design`
la rulare — pe conexiunea din sală asta înseamnă butoane goale, iar butonul de meniu **e** o
iconiță și nimic altceva. Dacă folosești un prefix dintr-o altă colecție, instaleaz-o și pe aia,
altfel exact acele iconițe se întorc pe rețea, tăcut.

**Zona autentificată se verifică pe telefon, la 390px, nu doar pe desktop** (E18 S7). Două lucruri
se strică acolo și nicăieri altundeva. Grupul din dreapta al navbar-ului are nevoie de `min-w-0`:
fără el își păstrează lățimea intrinsecă și crește **peste** butonul de meniu din stânga — din 44px
rămăseseră 10 apăsabili, iar o atingere în centrul hamburgerului deschidea filtrul de locație. Și
ținta minimă e 44px pe drumul profesorului; `size="sm"` pe un buton pe care cineva îl apasă stând
în picioare e prea mic, deci se scrie `class="min-h-11"`. Zona n-are poartă automată de
accesibilitate — S6 o amână deliberat până se rescrie portalul în S4/S5 — deci verificarea e
manuală, iar cifrele de referință sunt în E18 S7.

**Partea publică nu atinge backend-ul, cu două excepții declarate.** Cele șapte pagini publice
vechi, formularul de contact, `robots.txt`, `sitemap.xml`, `llms.txt` și datele structurate
funcționează fără `API_BASE` — de aceea site-ul stă în producție pe Vercel deși backend-ul de
producție nu e deployat. Prima excepție e `/proba`, formularul de programare la lecția de probă
(E20/S2): el chiar are nevoie de API, fiindcă scrie un rând. E scris să pice moale — orele se cer
doar din client, iar fără răspuns formularul tot se trimite și cititorul primește numărul de
telefon. A doua e `/dezabonare` (E17/S4), pagina la care duce linkul din subsolul unui mesaj
promoțional: acolo **pagina întreagă e scrierea**, deci nu poate pica moale la fel — ce face în loc
e să spună că n-a mers și să dea adresa biroului. Niciuna **nu se aduce pe `release/prod`** până nu
rulează un backend acolo; pe `release/stage` funcționează amândouă, pe
`api-stage.itbridgeschool.com`. Faptele despre școală stau în `apps/web/shared/`, nu în
pagini: `school.ts` (nume, telefon, adrese, program), `courses.ts` (nivelurile și prețurile),
`teachers.ts`, `seo.ts` (titlul și descrierea fiecărei pagini), `structured-data.ts` (constructorii
de JSON-LD). Aceleași constante alimentează pagina, graful JSON-LD, sitemap-ul și `llms.txt` —
**dacă schimbi un preț sau o adresă, schimbi acolo, într-un singur loc.** Un număr scris de mână
într-o pagină e un bug, nu o scurtătură: NAP inconsecvent e cea mai frecventă cauză de poziționare
locală slabă.

Fiecare pagină publică apelează `useSeo` o dată (titlu, descriere, canonical, OG, Twitter) și
`useJsonLd` o dată, cu un singur `@graph`. Nodurile se leagă între ele prin `@id`, deci **orice nod
referit trebuie să fie prezent în graful acelei pagini** — un `@id` care nu se rezolvă e ignorat
tăcut de parser. Layout-ul `default` nu setează niciun titlu, ca să nu concureze cu `useSeo`; cel
de `dashboard` pune `noindex, nofollow` pe tot ce e după autentificare.

## Convenții

**Totul în engleză, în afară de ce vede utilizatorul.** Regula acoperă: nume de branch-uri, mesaje
de commit, titluri și descrieri de PR, identificatori din cod (variabile, funcții, clase, tipuri,
fișiere), comentarii, descrieri de teste (`describe` / `it`), mesaje de log și de eroare din API,
chei de configurare și nume de job-uri din CI.

Excepțiile, tot ce ajunge la un părinte sau la un profesor: textele din interfața Nuxt, e-mailurile,
PDF-urile, conținutul de site. Alea rămân în română — e o școală din România.

Documentația din `docs/` și fișierele astea două sunt scrise în română și rămân așa; regula e
despre cod și despre git, nu despre proza de proiect.

- Backend: 4 spații, ghilimele simple, print width 120 (`.prettierrc`). Frontend: 2 spații,
  ghilimele duble. Nu amesteca.
- Backend importă cu path absolut de la rădăcină: `from 'src/entities/child.entity'`
  (rezolvat prin `baseUrl`). Frontend folosește alias-ul Nuxt `~/`.
- Sumele monetare: `decimal` în Postgres, expuse ca `number` în aplicație printr-un
  `transformer` pe coloană (vezi `apps/api/src/entities/invoice.entity.ts`).
- Lunile de facturare sunt string-uri `'YYYY-MM'` (`monthIssued`), cu constrângere
  `@Unique(['parent', 'monthIssued'])` pe `Invoice`.
- `Group.weekday` e zi ISO: 1 = luni, 7 = duminică.
- Unicitatea orarului e pe **sală**, nu pe școală: `@Unique(['room', 'weekday', 'startTime'])`.
- `Room.capacity` implicit e 10, dar e configurabil din `/admin/locations`; nu-l hardcoda nicăieri.
- `isActive` pe `Location` și `Room` blochează **grupe noi**, nu editarea celor existente.

## Capcane

Lucruri care te vor bloca dacă nu le știi dinainte.

**`pnpm test` verde nu înseamnă `pnpm typecheck` verde.** ts-jest e mai permisiv decât `tsc` pe
fișierele de test, deci o suită poate trece în timp ce `tsc --noEmit` raportează erori pe același
cod. Rulează amândouă înainte să deschizi un PR — CI le rulează separat.

**`lint:fix` poate schimba tipuri, deci `typecheck` se rulează _după_ el, nu înainte.** Regula
`@typescript-eslint/no-unnecessary-type-assertion` **șterge** o aserțiune pe care o consideră
inutilă, iar `--fix` o face fără să întrebe: un `app.get(S3Service) as unknown as { deleteObject:
jest.Mock }` din care rămâne `app.get(S3Service)` compilează perfect până în clipa în care cineva
cheamă `.mockClear()` pe el. Local trece dacă ai rulat typecheck-ul înaintea lui `lint:fix`, și
pică în CI. Când ai nevoie de forma asta, îngustează dintr-un `unknown` declarat — `const client:
unknown = ...; return client as X;` — fiindcă aia e o îngustare reală, pe care regula n-o poate
numi inutilă.

**Testele de integrare pornesc un server real, cu `app.listen(0)`, nu `getHttpServer()` direct.**
Nu schimba asta: supertest ridică altfel un server efemer la fiecare cerere, iar suita devine
intermitentă în chip înșelător — am văzut cereri neautentificate răspunzând 200, ceea ce arată ca o
breșă de autentificare, dar era rotație de porturi.

**Testele de integrare cer Postgres _și_ MinIO pornite.** `pnpm test:e2e` se conectează la baza
`itbridge_test`, pe care și-o creează singur prin `apps/api/test/global-setup.ts`, și creează tot
acolo bucket-ul S3 — deci amândouă containerele trebuie să ruleze: `docker compose up -d`. Schema
vine din migrări, aceeași cale ca în producție, deci o migrare lipsă sau stricată pică testele.

Rulează-le de la rădăcină, cu `pnpm test:e2e`, nu cu `pnpm --filter api test:e2e`: al doilea
pornește cu directorul de lucru în `apps/api`, unde nu există `.env`, deci nu vede portul MinIO din
configurația ta.

**Imaginea MinIO vine de pe `quay.io`, nu de pe Docker Hub.** `minio/minio` de pe Hub răspunde acum
unui `docker pull` anonim cu `pull access denied ... may require 'docker login'`, deci și
`docker compose up -d`, și job-ul de integrare din CI se opreau înainte să ruleze ceva. În CI arăta
cel mai prost cu putință: pasul „Start MinIO" pica într-o secundă, iar cei doi de după el —
`check:schema` și **toată** suita de integrare — erau _skipped_, deci checkul ieșea roșu cu numele
„Integration tests" și cu zero teste rulate. Dacă vezi vreodată roșu acolo, uită-te întâi dacă a
rulat vreun test: un pas de infrastructură care cade nu seamănă cu un test picat, dar checkul are
aceeași culoare.

**`scripts/` e exclus din `tsconfig.build.json`, intenționat.** Inclus, ar urca `rootDir` la
rădăcina pachetului, iar `nest build` ar scrie `dist/src/main.js` în loc de `dist/main.js` — deci
`start:prod` și deploy-ul s-ar rupe în tăcere. Scripturile rulează oricum prin ts-node.

**Un `''` dintr-un formular nu e `undefined`, iar `@IsOptional()` nu-l sare.** Orice input HTML
netastat se trimite ca string gol, deci `@IsOptional() @Length(1, 255)` respinge exact payload-ul pe
care formularul îl produce mereu. Pe câmpurile opționale de text pune `@EmptyToUndefined()`
(`apps/api/src/common/empty-to-undefined.ts`) înaintea validatorilor. Din cauza asta ecranul de
completare a profilului a devenit imposibil de trecut în clipa în care validarea a fost pornită.

**`@IsPhoneNumber()` fără regiune cere format internațional.** Numerele se scriu `0712345678` în
România, deci decoratorul e `@IsPhoneNumber('RO')`, care acceptă și `+40712345678`. Frontend-ul
normalizează la `+40…` înainte să trimită (`normalizePhone` din `composables/useUtils.ts`), ca
verificarea de duplicat să compare o singură formă.

**Coloanele `decimal` vin ca string din driver.** `@Column({ type: 'decimal' })` fără `transformer`
declară `number` și livrează `"11"`. `contract.ts` nu prinde asta — compară declarații, nu
comportament. Folosește `decimalAsNumber` din `apps/api/src/entities/decimal.transformer.ts`.

**Validarea rulează, ca `APP_PIPE` în `app.module.ts`.** Deci se aplică și aplicațiilor construite
în teste, nu doar celei din `main.ts`. `whitelist` plus `forbidNonWhitelisted`: un câmp pe care
niciun DTO nu-l declară respinge cererea, nu e ignorat tăcut.

`enableImplicitConversion` e **oprit** intenționat — ar converti înainte de validare, deci
`@IsString()` ar accepta un număr transformându-l în string. Un câmp numeric care vine din query
string are nevoie de `@Type(() => Number)` explicit.

**`undefined` într-un `where` TypeORM înseamnă „ignoră condiția”, nu „e null”.** A produs deja două
bug-uri: crearea de profiluri fără date de contact răspundea 409, iar logout-ul răspundea 200 fără
să revoce nimic. Folosește `IsNull()`.

**Configurația e validată la pornire**, în `apps/api/src/config/env.validation.ts`. Aplicația refuză
să pornească fără secrete JWT, cu secrete sub 16 caractere, cu valorile implicite vechi, sau cu
access și refresh identice. Uneltele de schemă trec pe lângă validare cu `SKIP_ENV_VALIDATION=true`,
fiindcă au nevoie doar de configurația de bază de date.

**Schema se schimbă doar prin migrări.** `synchronize` e `false`, iar configurația e într-un singur
loc, `apps/api/src/data-source.ts`, citit și de aplicație și de CLI-ul TypeORM. O entitate schimbată
fără migrare nu mai rupe la pornire — rupe la prima interogare care atinge coloana nouă. De asta CI
rulează `check:schema`, care construiește o bază de unică folosință din migrări și verifică dacă
entitățile au divergat.

Când schimbi o entitate: `pnpm --filter api migration:generate src/migrations/<Nume>`, apoi citește
SQL-ul generat înainte de commit. O redenumire de coloană îi apare ca `DROP` plus `ADD`.

**Nu te chinui însă să păstrezi date: nu există niciunele.** Nici pe stage — baza de acolo e tot
seed, refăcută dintr-o comandă —, n-a existat niciodată un utilizator real, iar în afara ei baza
rulează doar pe mașinile de dezvoltare și în teste. Deci o migrare generată se ia ca atare, se
rescriu liber migrările nepornite încă și nu se scrie cod de backfill pentru rânduri care nu există.
Ce **rămâne** obligatoriu e ca migrările să existe și să corespundă entităților, fiindcă de asta
depinde `check:schema` din CI — și fiindcă regula se schimbă în ziua în care există prima familie
reală, nu în ziua în care a existat un deploy.

Ce s-a schimbat de când există stage e **prețul greșelii, nu regula**: `deploy.sh` rulează
`migration:run` între build și `pm2 reload`, deci o migrare care pică oprește deploy-ul și lasă pe
`api-stage` versiunea dinainte. Costul nu mai e un `docker compose down -v` pe laptopul tău, e un
branch care nu mai ajunge nicăieri până e reparat.

**Migrările nu rulează la boot.** `migrationsRun` e `false` intenționat: în deploy se rulează
explicit, între build și `pm2 reload`, ca o migrare eșuată să oprească deploy-ul în loc să lase
procesul să se restarteze în buclă.

**`API_BASE`, nu `NUXT_PUBLIC_API_BASE`.** `apps/web/nuxt.config.ts` mapează
`runtimeConfig.public.apiBase` pe `process.env.API_BASE`. Fără el, `apiBase` e `undefined` și
cererile pleacă spre origin-ul Nuxt. E în `.env.example` de la rădăcină și trebuie setat și în
Vercel, inclusiv pe Preview.

**`SITE_URL` se lasă NESETATĂ în Vercel** — invers față de `API_BASE`, de deasupra. Din ea se
construiesc canonical, `og:url`, fiecare `<loc>` din sitemap, linia `Sitemap:` din `robots.txt` și
toate `@id`-urile din JSON-LD. Nesetată, `nuxt.config.ts` cade pe `https://itbridgeschool.com`,
care e domeniul real. O valoare de localhost copiată acolo scoate tot site-ul din index în primul
ciclu de crawl. Se setează doar dacă se schimbă domeniul.

**Payload-ul unei erori din Nitro e cu un nivel mai adânc decât pare.** `createError({ statusCode,
statusMessage, data })` pune în răspuns `{ statusCode, statusMessage, message, data }`, unde
`message` e `statusMessage`-ul **în engleză** pe care h3 îl copiază pe eroare, iar `data` e ce ai
trimis tu. `ofetch` pune tot corpul ăla pe `error.data` — deci mesajul tău în română e la
`error.data.data.message`, nu la `error.data.message`. Citind greșit, un părinte primea
„Contact form not configured" în loc de textul românesc, exact pe ramura care se declanșează când
`RESEND_API_KEY` lipsește la primul deploy. Vezi `apps/web/app/pages/contact.vue`.

**Formularul de contact trimite dintr-o rută Nitro, nu din browser.** `RESEND_API_KEY` stă în
`runtimeConfig`, în afara lui `public`, deci Nuxt nu îl scrie niciodată în bundle-ul clientului;
singurul lucru care îl vede e `apps/web/server/api/contact.post.ts`. Nu-l muta în `public` și nu
chema Resend din pagină: cheia poate trimite mail în numele domeniului școlii, nu are scope și nu
are restricție de origine, deci într-un bundle e a oricărui vizitator care deschide tab-ul de
network. Pe Vercel ruta se deployează ca funcție serverless lângă site, deci nu cere backend.

Schema e una singură, în `apps/web/shared/contact.ts`, validată în ambele părți: în pagină ca să
apară eroarea sub câmp, în rută fiindcă ruta e publică și oricine poate posta pe ea direct.
`CONTACT_FROM` trebuie să fie pe un domeniu verificat în Resend, altfel fiecare trimitere pică cu
403 — iar o cheie de trimitere restricționată nu poate interoga `/domains` ca să-ți spună asta
dinainte. Ambele variabile sunt în `turbo.json`, la `globalEnv`, și trebuie setate și în Vercel.

**S3-ul local e MinIO, prin `AWS_S3_ENDPOINT`.** Variabila scoate SDK-ul de pe AWS; în producție
se lasă nesetată. `invoice-pdf.e2e-spec.ts` e singura suită care nu mock-uiește S3 și PDFKit — restul
le înlocuiesc, fiindcă ies din proces.

**`pdf.service.ts` își citește fonturile relativ la `__dirname`, nu la `process.cwd()`.** Le lua din
`process.cwd()/src/assets`, ceea ce mergea doar fiindcă `src/` stă lângă `dist/` într-o clonă.
`nest-cli.json` copiază acum `src/assets` în `dist/assets`. Dacă muți fișierul, potrivește calea.

**`AWS_REGION` e obligatorie ca să pornească aplicația.** `S3Service.onModuleInit`
(`apps/api/src/modules/storage/s3.service.ts`) aruncă fără ea, deci backend-ul cade la
boot, chiar dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe
lanțul implicit de credențiale, adică IAM instance role în producție. Mesajul de eroare cere trei
variabile, dar verifică una singură.

**`archiver` rămâne pe `^7`, ultimul major CommonJS.** v8 e `"type": "module"` și cade în ts-jest cu
`SyntaxError: Unexpected token 'export'`, exact ca `@nestjs/schedule` v12. Aceeași capcană, al doilea
pachet — dacă adaugi o dependență și testele pică deodată cu un mesaj care nu spune de ce, verifică
întâi `type` din `package.json`-ul ei. Din același motiv verificarea tipului real de fișier e scrisă
de mână în `apps/api/src/modules/project/file-types.ts` în loc să folosească `file-type`, care e
ESM-only de la v19: sunt opt semnături, adică treizeci de linii.

**`sharp` are nevoie de scripturi de instalare**, deci e în `onlyBuiltDependencies` din
`pnpm-workspace.yaml`. Fără el nu se generează nicio miniatură — dar nici nu se rupe nimic: E14
tratează eșecul de miniaturizare ca pe un rezultat normal, iar proiectul se încarcă oricum.

**`projects.publicId` se generează în entitate, printr-un `@BeforeInsert`, nu prin `DEFAULT
gen_random_uuid()`.** Funcția e în core de la Postgres 13 și ar merge perfect, dar TypeORM nu știe să
compare un default de funcție cu ce raportează baza, deci `check:schema` ar declara drift la fiecare
rulare și ar emite un `DROP DEFAULT` urmat de un `SET DEFAULT` identic. O gardă care pică pe fiecare
PR nu mai e citită. Consecința: un proiect creat printr-un query builder n-ar primi identificator —
nimic nu face asta, iar `ON CONFLICT DO NOTHING` e necesar pe `project_files`, nu pe `projects`.

**Ordinea rutelor contează în două controllere.** În `ProjectController`, `link/:publicId`,
`child/:childId/archive`, `group/:groupId/missing` și `send` sunt declarate înaintea lui `:id/…`,
fiindcă Nest potrivește în ordinea declarării și `:id` are `ParseIntPipe`, care răspunde 400 la un
UUID. În `LeadController` (E20/S3) e aceeași capcană cu alt chip: `follow-up` și `undecided` stau
înaintea lui `:id`, altfel `ParseIntPipe` răspunde 400 la un cuvânt.

**Singurul lucru servit `inline` de pe domeniul școlii e miniatura.** Fișierele urcate se servesc
prin URL semnat cu `Content-Disposition: attachment`, fiindcă vin de pe o partajare pe care poate
scrie orice mașină din școală. Miniatura e altceva: octeții ei au fost produși de `sharp` pe server,
deci un poliglot valid și ca imagine și ca altceva n-a supraviețuit reîncodării. Are `nosniff`
oricum. Nu extinde excepția la altceva.

**`outbox.attachments` ține chei, nu octeți.** Obiectul se citește din bucket în secunda în care
mesajul e predat furnizorului. Base64 în coloană ar îngrășa fiecare interogare de revendicare pentru
date de care e nevoie o dată; iar un obiect care lipsește nu oprește mesajul — pleacă fără poză.

**Refresh tokenurile sunt urmăribile și revocabile.** Tabelul `sessions` ține un SHA-256 al
fiecăruia, niciodată tokenul. Refresh-ul rotește, iar refolosirea unuia consumat revocă tot lanțul —
semnalul de furt. `POST /auth/logout` nu cere access token, fiindcă acela e adesea deja expirat.

**Revocarea acționează doar pe refresh, nu și pe access.** `AuthGuard` verifică semnătura JWT și
atât — nu atinge tabelul `sessions`. Deci după `logout` sau `logout-all`, un access token deja emis
mai funcționează până la 15 minute. E compromisul acceptat: alternativa e o interogare în baza de
date la fiecare cerere. Dacă vine o cerință de revocare instantanee, ăsta e locul de schimbat.

**Clientul trebuie să salveze refresh tokenul întors de `/auth/refresh`.** Rotația îl consumă pe
cel prezentat; dacă păstrezi tokenul vechi, a doua reîmprospătare arată ca un replay, iar serverul
revocă tot lanțul. `useApi.ts` a avut exact bug-ul ăsta și deloga fiecare părinte la ~30 de minute.

**Un login ține șapte zile, cât refresh tokenul din spatele lui.** `useCookie("accessToken")` fără
opțiuni scrie un cookie **de sesiune** — `CookieDefaults` din Nuxt pune `path`, `watch`, `decode`,
`encode` și `refresh`, și nimic altceva, deci nici `maxAge` și nici `expires` —, așa că amândouă
tokenurile se aruncau la închiderea browserului. Tot ce e de partea cealaltă a sârmei fusese
construit pentru opusul: șapte zile de refresh token, tabelul `sessions` care îl urmărește, rotația
care revocă lanțul la refolosire. Un părinte își retasta parola la fiecare vizită, iar nimeni nu
alesese asta — era implicitul pe care nu-l recitise nimeni. Trei lucruri de ținut minte:

- **`maxAge` pe cookie-ul de refresh, singur, nu repară nimic.** Și pluginul de boot
  (`01.auth.client.ts`), și middleware-ul (`01.auth.global.ts`) citeau **access tokenul** ca „e
  cineva autentificat", deci părintele întors a doua zi era trimis la formularul de login cu un
  refresh token bun în borcan, neatins: nimic nu cheamă `/auth/refresh` până nu ia o cerere 401, și
  nu pleca nicio cerere. Jumătatea durabilă a unei sesiuni e refresh tokenul, iar amândouă îl citesc
  acum — `/auth/me` ia 401, `useApi` reîmprospătează, reluarea duce tokenul nou.
- **Access tokenul rămâne pe sesiune, dinadins.** E un drept de cincisprezece minute pe care
  `AuthGuard` îl onorează fără să atingă `sessions`, deci n-are ce căuta pe disc după ce s-a închis
  tab-ul.
- **`secure` se decide din protocolul paginii, nu din build.** `import.meta.dev` e testul evident și
  e greșit în două locuri deodată: `pnpm test:a11y:auth` servește un build **de producție** pe
  `http://127.0.0.1:3124` și așteaptă cookie-ul `accessToken`, iar zona autentificată se verifică pe
  telefon la 390px (E18 S7), adică tot pe HTTP simplu. Un cookie `secure` pe HTTP e aruncat de
  browser fără niciun mesaj, deci greșeala arată exact ca o parolă greșită. `sameSite: "lax"` e
  igienă de stocare, nu apărare CSRF: tokenurile circulă în antetul `Authorization`, iar API-ul nu
  citește niciun cookie.

Cele două numere — `REFRESH_TOKEN_MAX_AGE_SECONDS` din `apps/web/app/stores/tokenStore.ts` și
`JWT_REFRESH_TOKEN_EXPIRATION` — se mută împreună: browserul nu vede mediul API-ului, iar `useCookie`
fixează `maxAge` când se creează ref-ul, deci valoarea nu poate fi citită nici de pe token.

**Nimic din datele utilizatorului nu se ține în cookie.** Limita e ~4 KB per cookie, iar depășirea
nu produce nicio eroare: browserul aruncă tăcut, `useCookie` citește mai departe o valoare goală și
codul funcționează „corect" pe date care nu există. Prezența a stat acolo, iar o înregistrare cară
ședința întreagă, cu grupa, sala și locația ei — măsurat pe `GET /attendance/child/:id`, **7 ședințe
înseamnă 11,7 KB JSON și 18,6 KB URI-encoded**. Cookie-ul dispărea după vreo ședință, iar calendarul
părintelui se randa gol, ceea ce se citește ca „copilul n-a venit niciodată". `attendanceStore` și
`classSessionStore` sunt în memorie; în cookies rămân doar tokenurile și locația selectată, adică
zeci de octeți. Testul care ține linia (`apps/web/test/stores.spec.ts`) verifică mecanismul, nu
mărimea — unul pe dimensiune ar trece și cu bug-ul pus la loc.

**`@nestjs/schedule` rămâne pe `^6.0.1`, ultimul major CommonJS.** De la v12 pachetul e ESM și
moare în ts-jest cu `SyntaxError: Unexpected token 'export'` — nu doar în testul care îl importă, ci
în orice suită care ajunge la `app.module.ts`. Un `pnpm up` care îl urcă rupe toate testele deodată,
cu un mesaj care nu spune de ce. Ăsta e și motivul pentru care nu există `@nestjs/config`.

**O coloană nouă pe o entitate trebuie clasificată în inventarul de date** (E07 S1). Sursa e
`apps/api/src/privacy/data-inventory.ts`, iar `data-inventory.spec.ts` citește metadatele lui
TypeORM — nu o listă întreținută de cineva — deci o coloană adăugată fără intrare pică suita, cu
numele ei în mesaj. Sunt clasificate **toate** coloanele, nu doar cele personale: fiecare e ori dată
personală, cu scop, temei legal, regulă de păstrare și cine o poate citi, ori nu e, cu un motiv
dintr-o listă scurtă. Nu există a treia stare — aia e felul în care un număr de telefon ajunge
neclasificat. Trei lucruri care se ratează:

- **Un rând despre o familie face personale coloanele lui, orice ar conține.** Suma unei facturi nu
  e un număr în abstract, e ce datorează familia aia. „N-are niciun nume în el" nu e un motiv.
- **`linkedVia` e drumul de la rând la familie**, iar testul îl parcurge relație cu relație și cere
  să se termine la `Profile`. E coloana pe care o citește E07 S4: un export trebuie să găsească
  fiecare rând despre o familie, deci un drum inventat e o gaură pe care nimic n-o semnalează. Trei
  tabele n-au drum, dinadins, și scrie de ce la fiecare.
- **Documentul se randează, nu se editează**: `pnpm --filter api inventory:render` scrie
  `docs/inventar-date.md`, iar același spec pică dacă a rămas în urmă. Fișierul e în
  `.prettierignore` fiindcă prettier v3 își încarcă parserul de markdown prin `import()` dinamic, pe
  care ts-jest nu-l poate face — deci verificarea compară randarea brută, iar un hook care ar
  reformata fișierul ar face-o roșie pe alinierea barelor și pe nimic altceva.

**Urma unei schimbări se scrie în tranzacția care a produs-o** (E07 S3). `AuditService`
(`apps/api/src/modules/audit/audit.service.ts`) **cere** `EntityManager`-ul tău — nu îl acceptă
opțional, ca outbox-ul: o urmă care supraviețuiește unei tranzacții date înapoi spune că s-a
întâmplat ceva ce nu s-a întâmplat, iar una pierdută când schimbarea a reușit e o gaură. Asimetria
față de coadă e intenționată: un mesaj poate să n-aibă nicio tranzacție în jur — rularea de restanțe
și mementoul de prezență și-o compun dintr-o citire —, în timp ce o intrare în jurnal _e_ relatarea
unei schimbări, deci există mereu o tranzacție la care să se alăture. Opt scriitori derivaseră spre
apelul fără manager — toți cei de date personale, plus ambele jumătăți ale cererii de ștergere —, iar
unul dintre ei, editarea de profil, avea chiar atunci o tranzacție deschisă și pur și simplu n-o
dădea mai departe. Semnătura e ce oprește al nouălea; un tip ține linia mai bine decât un comentariu.
Patru lucruri de ținut minte dacă adaugi un scriitor nou lângă facturi, plăți și reduceri:

- **Nu există `update` și nu există `delete`** — nici metodă pe serviciu, nici rută pe
  `AuditController`, care are un singur verb. Singurul lucru care se poate face tabelului prin
  aplicație e să i se adauge, și ăsta e tot rostul lui.
- **`changes` ține doar ce s-a mișcat, și numai scalari.** `diffFields` din `audit.rules.ts` compară
  datele pe instant și zecimalele pe valoare — altfel două `Date` cu același moment, sau `350` față
  de `"350"` venit ca text din driver, ar raporta o schimbare pe care n-a făcut-o nimeni. O salvare
  care n-a schimbat nimic **nu scrie niciun rând**: `recordUpdate` iese devreme. Un „înainte și
  după" al rândului întreg ar face din jurnal a doua copie a datelor unei familii, adică invers
  decât cere epicul care l-a cerut.
- **Derivările nu se consemnează.** `recomputeInvoiceStatus` mută starea facturii fiindcă s-au
  adunat plăți; e o consecință, nu o decizie a nimănui. Un jurnal în care fiecare derivare stă lângă
  deciziile oamenilor e un jurnal în care deciziile nu se mai găsesc.
- **Actorul vine din token, prin `actorFrom(req)`**, și se stochează denormalizat — id plus numele
  copiat la scriere, fără relație către `User`. O urmă care arată către un rând ce poate fi șters
  pierde exact intrările care contează: cele despre un cont scos ulterior. Pentru munca programată
  există `SYSTEM_ACTOR`, cu ambele câmpuri `null`, fiindcă „n-a apăsat nimeni" e un fapt care merită
  citit, nu un gol de umplut cu un nume inventat.

**Datele personale lasă numele câmpului, nu valoarea** (E07 S3). Cealaltă jumătate a jurnalului —
`Profile` și `Child`, create, editate sau șterse — trece prin
`AuditService.recordPersonalDataChange`, care scrie `{ from: null, to: null }` pe fiecare câmp
atins. Nu e prudență: câmpurile alea au retenția `account` în inventarul din E07 S1 și pleacă odată
cu familia, în timp ce `audit_log` are retenția `audit` și îi supraviețuiește **prin construcție**,
fiindcă n-are relație către profil — de aia mai poate răspunde „cine a șters familia 412" după ce
familia 412 nu mai e. O valoare copiată acolo ar rămâne de partea la care ștergerea din S4 nu
ajunge. Două consecințe: ce s-a mișcat se calculează cu `changedFieldNames`
(`apps/api/src/modules/audit/personal-fields.ts`) **înainte** de `applyDefined`, altfel compari
rândul cu el însuși; iar o salvare care n-a mișcat nimic nu scrie niciun rând, ca la bani. Dacă
adaugi un al treilea drum prin care un om atinge datele unei familii, cheamă aceeași ușă — nu
`record` cu valori în ea.

**A treia categorie e accesul, și ea cade ușor între primele două** (E07 S3). Cine intră, cine e
refuzat, cine devine admin, al cui cont dispare: cele patru scrieri din `apps/api/src/modules/user/`
sunt deciziile prin care platforma spune cine o poate folosi, iar multă vreme n-au consemnat nimic —
niciuna nu primea nici măcar un actor, fiindcă `UserController` n-avea niciun `@Request()` în el.
`approvalDecidedAt` spune _când_ a hotărât școala, nu cine; `PUT /users/:id`, singura scriere care
dă cuiva datele tuturor familiilor, nu lăsa absolut nimic. Toate patru trec acum prin
`recordPersonalDataChange`, în tranzacția care face schimbarea, cu **numele câmpului, nu valoarea**:
`username`, `role` și `approvalStatus` sunt clasificate personale cu retenția `account`, deci
aceeași graniță care ține un număr de telefon în afara jurnalului ține și un rol. Nu se pierde
nimic: rolul curent e pe rând, iar ce rândul nu poate spune — cine l-a mutat — e exact ce adaugă
intrarea. Motivul respingerii nu e nici el trecut: e propoziția adminului, și rămâne pe rând pentru
cine are dreptul s-o citească. Intrarea de la ștergere își supraviețuiește subiectului, fiindcă
jurnalul n-are relație către `users`. Dacă adaugi o a cincea ușă prin care cineva capătă sau pierde
acces, treci-o pe acolo.

**Mailul din backend pleacă prin outbox, niciodată direct.** `MailService`
(`apps/api/src/modules/mail/mail.service.ts`) e implementarea; ce injectezi într-un modul e
`OutboxService`. `queue()` primește opțional `EntityManager`-ul tranzacției tale — dă-i-l, altfel
dispare cuvântul „tranzacțional": mesajul se scrie odată cu operațiunea care îl provoacă, sau
niciunul dintre ele. Un serviciu care cheamă `send()` dintr-un handler HTTP a readus exact
defecțiunea pentru care există coada: o factură care cade fiindcă furnizorul de email e picat.
Coada e una singură, și pentru orice canal care s-ar adăuga — nu scrie a doua. Adresa biroului se
citește prin `officeAddress()` din `apps/api/src/modules/mail/office-address.ts`, nu din job-ul care
o folosea prima: acum trimit acolo două lucruri diferite, iar al doilea n-avea de ce să importe din
`class-session` ca să scrie un email.

`MailService` e în `apps/api` fiindcă acolo trebuie să fie: ruta Nitro din
`apps/web/server/api/contact.post.ts` se deployează pe Vercel ca funcție serverless, care nu vede
Postgres, iar tot ce trimite backend-ul se compune din date din Postgres. Rămâne unde e, pentru
formularul public și numai pentru el; nu unifica cele două direcții, în niciun sens.

Cheia e `MAIL_RESEND_API_KEY`, **nu** `RESEND_API_KEY` — aia e a formularului public de contact, și
E17 a decis două chei și doi expeditori tocmai ca o rafală pe ruta publică să nu consume cota
mesajelor către părinți. Amândouă sunt opționale: fără ele aplicația pornește, iar mesajele rămân în
`outbox` cu motivul scris în `lastError`. **Și chiar rămân — un eșec de configurare nu consumă o
încercare.** `attempts` e, prin definiția de pe entitate, de câte ori a fost întrebat furnizorul, iar
un backend fără cheie nu întreabă pe nimeni: `send` aruncă înainte să atingă rețeaua. Cât timp
`exhausted` se citea doar din numărul de încercări, fără să întrebe și de ce a picat, un deploy
neterminat își îngropa singur coada — șapte treceri, cam două ore, și tot ce era scris ajungea
`failed`, stare pe care `claim` n-o mai atinge niciodată —, deci cheia pusă după aceea nu mai salva
nimic. Acum `recordFailure` dă încercarea înapoi, și odată cu ea și amânarea crescătoare: backoff-ul
temperează furnizorul, iar ăsta n-a fost atins, deci coada reîncearcă pe cadența de bază și pleacă
întreagă în clipa în care apare variabila. `MAIL_OUTBOX_ENABLED=false` oprește doar scheduler-ul;
testele de integrare îl setează, ca o trecere de fundal să nu miște rândurile sub aserțiuni.

**Rapoartele nu definesc nimic, doar adună** (E21). `apps/api/src/modules/dashboard/` cere fiecare
număr de la serviciul care deține întrebarea — restanțele de la `ArrearsService`, locurile de la
`EnrollmentService.occupancyOf` — și nu rederivă niciunul; a doua definiție e cea care divergează.
Raportul financiar ține **două calendare**, amândouă pe ecran: „încasat pentru lună" (plățile pe
facturile lunii, oricând au venit) și „încasat în lună" (plățile datate în lună, pentru orice
factură). Diferă exact când o familie plătește târziu, deci nu alege unul în locul celuilalt. Doar
plățile `succeeded` sunt bani, iar `waived` se numără, nu se adună. Pragul de ocupare (60%) și prețul
unui loc gol stau în `reports.rules.ts` și sunt propuneri afișate ca atare, nu decizii.

**Semnalele timpurii sunt patru liste și un email de luni, nu o acțiune** (E21 S7).
`EarlySignalsService` (`apps/api/src/modules/dashboard/early-signals.service.ts`) cere fiecare
listă de la cine deține definiția: restanțele repetate de la `ArrearsService.list`, grupele sub prag
din raportul de ocupare — aceleași rânduri, nu a doua numărare —, iar cele două tipare de prezență,
care sunt noi, din regula pură `signals.rules.ts`: un copil ale cărui ultime trei marcaje sunt
absențe (și seria e „vie": ultimul marcaj sub trei săptămâni, altfel copilul a plecat), o grupă a
cărei medii pe ultimele trei ședințe ținute a căzut cu 20 de puncte față de cele trei dinainte.
Toate pragurile sunt constante acolo și pleacă pe sârmă, ca ecranul să numească linia pe care o
trage. **`asOf` e verificarea retroactivă**: marcajele și facturile se citesc așa cum stăteau în
ziua cerută, ocuparea mereu azi — și răspunsul o spune. Digest-ul `EarlySignalsJob` pleacă luni la
08:00 pe ceasul școlii, prin outbox, cu `dedupeKey` `early-signals:<zi>`, și **doar când există ceva
de semnalat**, ca mementourile de prezență și de lead-uri. Un semnal nu declanșează nimic — nici
reducere, nici transfer, nici mesaj către familie; e un motiv de telefon, cu numărul lângă el.

**Restanța se derivă, iar `Invoice.status` e doar o memorie** (E16 S7). Termenul e 14 zile de la
`dateIssued` — `arrears.rules.ts`, fără coloană `dueDate` — iar `ArrearsService.list` numără plățile
**reușite**, nu se uită la coloana de stare: un ecran despre bani n-are voie să greșească o zi
fiindcă n-a rulat un job. `markOverdue` ține coloana onestă pentru restul ecranelor. Consecința pe
care se sprijină acceptanța: mementourile se opresc la încasare fiindcă factura plătită iese din
interogare, nu fiindcă anulează cineva ceva.

**Încasarea se începe de la factură, iar suma precompletată e restul, nu totalul** (E16 S5).
`/admin/restante` și `/admin/payments/new` deschid amândouă `AdminPaymentModal`, care se completează
din rândul de restanță — familia, factura și `outstanding`. Precompletarea cu totalul facturii, cum
era înainte, punea 350 în locul unei familii care mai avea 150 de plată. Și **lista facturilor care
mai au ceva de plată e lista de restanțe**, nu o interogare nouă peste toate facturile: „mai are
ceva de plată" înseamnă `pending` sau `overdue` cu rest pozitiv, adică fix ce răspunde
`GET /invoices/arrears`. Dacă adaugi un al doilea loc de unde se încasează, cere-i tot un rând de
acolo — o a doua scădere `amount - plăți` ar fi a doua definiție a aceluiași număr.

**Chitanța se datorează când o plată _devine_ `succeeded`, nu când se scrie un rând** (E16 S6).
Regula e în `apps/api/src/modules/payment/payment-receipt.rules.ts`, iar distincția e tot ce
contează: un transfer trecut ca `initiated` cât timp extrasul e provizoriu n-a ajuns încă, iar „am
primit plata" atunci e o promisiune despre banii altcuiva. Deci `createPayment` trimite dacă plata
intră direct reușită, `updatePayment` trimite dacă tocmai a devenit, iar o editare pe o plată deja
reușită nu retrimite — n-a devenit adevărat nimic. `PaymentStatus` are patru stări și **niciuna nu
se numește `PENDING`**: sunt `INITIATED`, `SUCCEEDED`, `FAILED` și `REVERSED`; un test scris cu
`PaymentStatus.PENDING` compară cu `undefined` și trece degeaba.

Restul de plată din chitanță vine din `recomputeInvoiceStatus`, care returnează
`{ paid, outstanding, status }` — suma plăților reușite se face acolo oricum, iar un
`amount - plăți` scris a doua oară în compozitor ar fi exact a doua definiție de mai sus.
**Și numără ținând lacătul rândului de factură**, ca locurile din E11: doi admini care înregistrează
bani pe aceeași factură în aceeași secundă — numerar la birou, un transfer de pe extras — numărau
fiecare pe fotografia lui, deci niciunul nu vedea rândul celuilalt. Pe o factură de 350, 100 și 250
deodată dădeau amândouă „mai are de plată": factura rămânea `pending`, iar fiecare chitanță spunea
familiei un rest pe care tocmai îl achitase. Ecranul de restanțe nu era atins, fiindcă el numără
plățile reușite în loc să citească coloana de stare — exact de aia numărul greșit ieșea doar acolo
unde îl citea o familie. Lacătul stă înăuntrul derivării, nu la cele trei apeluri, fiindcă aia e
singura ușă prin care trec toate. Cheia de
deduplicare e `receipt:<id-ul plății>`, **fără ziua în ea**, spre deosebire de mementourile de
restanță: alea se repetă prin design, o plată se confirmă o dată. Mesajul se pune în coadă în
tranzacția care înregistrează banii — dă-i `EntityManager`-ul —, iar dacă adaugi un al doilea loc de
unde se încasează, cheamă și de acolo aceeași ușă: o încasare tăcută arată pentru familie exact ca
una pierdută.

**Numai marketingul stă pe o bifă** (E17 S4). `Profile.marketingOptIn` e implicit `false` — un
consimțământ pe care nu l-a dat nimeni nu e consimțământ — și gatează exclusiv `queueMarketing`.
`queue` și `queueOrRecord` **nu primesc deloc preferința**, deci nu există argument prin care cineva
ar putea opri o factură, o chitanță, o oră anulată sau proiectul copilului: alea sunt executarea
contractului, nu reclamă. Un refuz **nu** lasă rând în evidență, spre deosebire de un mesaj fără
destinatar — acolo cineva trebuia contactat și n-a fost, aici nimeni nu trebuia.

**Marketingul își poartă propria cale de oprire, iar aceea se adaugă la ușă, nu în șablon**
(E17 S4). Legea 506/2004 art. 12 cere ca refuzul să fie posibil **din fiecare mesaj**, nu dintr-un
ecran, iar GDPR art. 7 alin. 3 ca retragerea să fie la fel de ușoară ca acordarea — un login e mai
greu decât bifa care a pornit mesajele. Footerul se compune în `queueMarketing`
(`unsubscribe-footer.ts`), adică exact acolo unde se verifică și consimțământul: un subsol pe care
fiecare expeditor trebuie să-l lipească e un subsol pe care cineva îl uită, iar aici un mesaj de
marketing fără cale de oprire e **imposibil de trimis**, nu doar descurajat. Patru lucruri:

- **`Profile.unsubscribeToken` e `select: false`**, ca `User.passwordHash`: `GET /profiles` citește
  entități întregi printr-un query builder, deci fără asta listarea de admin ar duce în browser
  jetonul fiecărei familii. Singurul cititor îl cere pe nume — interogarea de audiență a anunțului.
- **Îl scrie un `EventSubscriber`, nu un `@BeforeInsert`.** Un hook de entitate rulează doar când
  ce se salvează e o **instanță** a clasei, iar `register`, programarea la probă și `ProfileService`
  dau lui `save` un obiect simplu. Cu hook, înregistrarea moare pe `NOT NULL` — măsurat, nu
  presupus. De aceea `data-source.ts` are acum și un glob de `subscribers`.
- **Linkul deschide o pagină; scrierea e un `POST`.** Clienții de mail, scanerele de securitate și
  boții de previzualizare deschid linkuri fără om, deci un `GET` care dezabonează la atingere ar
  opri tăcut familii care n-au refuzat niciodată — iar urma ar arăta exact ca oameni care refuză.
  `unsubscribe-needs-a-click.spec.ts` ține linia.
- **Comută într-o singură direcție și nu spune dacă jetonul e real.** Oprește marketingul, niciodată
  nu-l pornește — de aia jetonul poate fi stabil și fără expirare, iar cel mai rău lucru pe care îl
  face unul scurs e să oprească un buletin. Un răspuns care ar distinge „oprit" de „nu există" ar fi
  un oracol pentru ghicit jetoane.

**Un mesaj care n-are unde să plece lasă un rând, nu o linie de log** (E17 S5). `queueOrRecord` din
`OutboxService` primește destinatarul oricare ar fi el și scrie `undeliverable` cu motiv tipizat
(`no_address` / `unconfirmed_address`) când n-are adresă — starea e terminală și dispecerul n-o
revendică niciodată, fiindcă niciun backoff nu face să apară o adresă. Nu te ramifica pe
`if (profile.email)` înainte de coadă: exact aia punea faptul într-un log pe care nu-l citește
nimeni, iar „părintele n-a fost anunțat" arăta ca o coadă blocată. Adresa rămâne goală pe rândul
nelivrabil — una inventată n-ar putea fi deosebită de una reală care a respins mesajul.

**Iar „n-a ajuns" are trei feluri, nu unul — și tabloul de bord le numără pe toate.**
`DeliveryLogService.health` (`apps/api/src/modules/mail/delivery-log.service.ts`) e proprietarul
întrebării, iar `OverviewService` o cere, nu o recalculează — regula E21. Cele trei:

- `failed` — furnizorul a refuzat definitiv, sau s-au consumat cele șapte încercări.
- `undeliverable` — n-a avut unde să plece, de mai sus.
- **`stuck` — și ăsta nu e o stare, e un ceas.** Un mesaj pe care dispecerul nu l-a revendicat
  rămâne `pending`, adică arată exact ca unul care își așteaptă backoff-ul; singura diferență e
  `nextAttemptAt`, care a trecut. Pragul e `STUCK_AFTER_MINUTES` din `outbox-health.rules.ts`:
  cincisprezece minute, adică **treizeci de ticuri ratate** la `POLL_INTERVAL_MS` de 30 de secunde,
  și pleacă pe sârmă ca să numească ecranul linia, nu s-o deseneze a doua oară.

Tile-ul scria „Mesaje nelivrate" și număra doar al doilea fel, deci un mesaj refuzat de furnizor
arăta zero, iar o coadă **oprită de tot** arăta tot zero — exact defecțiunea pe care epicul o
descrie: „un mesaj care nu ajunge nu seamănă cu o eroare, seamănă cu liniște."

**Interogarea restrânge pe `status`, și nu din eleganță.** Rândurile `sent` nu se șterg niciodată —
scrie la `IDX_outbox_claim` pe entitate — deci ele _sunt_ tabela, iar tot ce vrea întrebarea asta e
în cele câteva rânduri care nu sunt trimise. Măsurat pe 200.000 de rânduri: fără `WHERE`, scanare
secvențială paralelă la **16,9 ms**; cu el, index-only scan la **0,1 ms**, pe un ecran pe care un
admin îl deschide toată ziua. Dacă adaugi un al patrulea număr aici, ține-l în aceeași listă de
stări.

**Anunțul e singurul mesaj care pleacă la mai multe familii, deci singurul cu reguli proprii**
(E17 S7). `apps/api/src/modules/announcement/` trimite către o grupă, o locație sau toată școala, iar
audiența se citește din `Child.group` — familiile cu un copil într-o grupă din perimetru, probele
incluse, deduplicate **per părinte**. Patru lucruri care se ratează ușor:

- **Un anunț n-are voie să numească un copil.** Verificarea caută prenumele fiecărui copil din
  școală în subiect și corp, fără diacritice și pe cuvinte întregi, iar rezultatul e **avertisment cu
  confirmare** (`ANNOUNCEMENT_NAMES_A_CHILD` plus `acknowledgeWarnings`), aceeași formă ca vârsta de
  la E11 S6. Blocajul ar fi greșit: Maria e și sală, și stradă, iar o verificare care se declanșează
  mereu devine o bifă apăsată reflex.
- **`kind` decide dacă se consultă `marketingOptIn`.** `transactional` (implicit) ajunge la toți,
  `marketing` trece prin `queueMarketing`. Fără el, ecranul ăsta ar fi fost portița prin care orice
  mesaj ajunge la orice familie, indiferent de comutatorul din E17 S4.
- **A doua apăsare identică e refuzată de un index unic**, nu de un `if`: `Announcement.dedupeKey` e
  audiență + subiect + corp + **ziua școlii** (`schoolDay` din `apps/api/src/common/school-clock.ts`),
  hash-uite. O corectură cu alt text trece — e alt mesaj.
- **`OutboxService` nu știe nimic despre anunțuri.** Serviciul își leagă singur rândurile prin
  `outbox.announcement_id`, după ce le pune în coadă și în aceeași tranzacție, deci coada partajată
  se poartă identic pentru ceilalți expeditori. `declinedCount` se stochează pe anunț fiindcă un
  refuz de marketing nu lasă rând — numărat din coadă ar fi mereu zero.

**Pâlnia începe în afara contului, și se termină la un om** (E20). `apps/api/src/modules/lead/` ține
tot ce e între „cineva a întrebat" și „s-a înscris". Două lucruri o fac diferită de restul codului:

- **`GET /trial/slots` și `POST /trial/bookings` sunt singurele rute publice în afară de
  autentificare și health**, și sunt trecute pe nume în lista albă din `authorization.spec.ts`. Sunt
  publice prin decizie: o programare la probă e un lead, nu o obligație, iar dacă ar cere cont,
  bariera pe care epicul o coboară ar fi exact bariera pusă la loc.
- **Nu se creează niciun cont, dar locul e real.** Programarea scrie `Profile` (coajă, fără cont și
  **fără email și telefon** — coloanele alea sunt unice, iar un formular public n-are voie să scrie
  în rândul altei familii), `Child` și o înscriere `TRIAL`, toate într-o tranzacție, iar înscrierea
  trece prin `EnrollmentService.enrol` ca oricare alta. De aici două schimbări în E11: `enrol`
  acceptă acum un `EntityManager`, ca să intre în tranzacția apelantului, și **blochează rândul
  grupei** (`FOR UPDATE`) cât ține verificarea de capacitate — numărarea urmată de inserare o pot
  face două tranzacții deodată, iar doi părinți pe formular la 20:00 nu e un caz rar ca doi admini.

Patru reguli pe care le încalci ușor:

- **Patru din cele șase stări nu se scriu de la niciun ecran.** `trial_scheduled` vine din
  programare, `trial_held` din catalog (`LeadProgressService`, chemat din
  `AttendanceService.settleLead` — singurul lucru pe care marcarea îl mai decontează), iar
  `enrolled` / `lost` din `resolveTrial` în E11. `UpdateLeadDto` **nu are câmp
  `status`**, iar cele două stări pe care le declară un om au endpoint-uri proprii. Un câmp de stare
  pe un PATCH ar lăsa un ecran să scrie `înscris` pe o familie pe care n-a înscris-o nimeni — și aia
  e cifra pe care se sprijină tot raportul de pâlnie.
- **Orele se filtrează pe dată, nu pe grupă.** Ce alege părintele e o zi, iar o grupă cu un loc
  liber n-are niciunul în ziua în care biroul a mutat deja un copil acolo — și are din nou săptămâna
  următoare. Lista cere `freeSeatsAtSessions` pentru toate orele pe care e pe cale să le ofere,
  într-o singură interogare, iar la trimitere se reverifică ora aleasă, în tranzacție: între
  fotografie și buton se poate strecura o mutare.
- **Formularul nu se termină niciodată într-o eroare.** Fără loc liber, cu ultimul loc luat între
  timp, sau fără nicio oră potrivită — toate trei scriu un lead marcat `noSeats` și răspund „te
  contactăm noi". Cel mai prost rezultat nu e o pagină de eroare, e o familie care pleacă fără ca
  școala să știe că a trecut pe acolo. Numărul ăla e și singura măsură a cererii pe care școala nu o
  poate servi: cine nu găsește oră nu intră în nicio rată de conversie.
- **`lastActivityAt` e o coloană proprie, nu `updatedAt`.** Job-ul de memento nu scrie în ea, deci un
  lead nu poate deveni „proaspăt" fiindcă a fost amintit.
- **Un catalog nemarcat nu e o absență.** Recontactarea după neprezentare cere ca ședința să fi fost
  marcată de cineva; altfel i-am spune unei familii că a lipsit de la o oră la care poate a fost.

**Pagina `/proba` e una dintre cele două pagini publice care ating backend-ul** — cealaltă e
`/dezabonare` din E17/S4 —, ceea ce contrazice regula de mai sus doar în aparență: orele se încarcă
exclusiv în client, iar când nu se pot încărca, formularul tot se trimite și cititorul primește
numărul de telefon. Consecința pentru cele două branch-uri: **nu se aduce pe `release/prod`** până
nu rulează un backend (E01 S4) — acolo ar fi o pagină de conversie care nu poate afișa nicio oră.

**Restanța de documente se măsoară cu vârstă, nu doar cu număr** (E17 S8). `pendingSummary` din
`apps/api/src/modules/project/project.service.ts` e proprietarul întrebării „cât așteaptă și de cât
timp" — `OverviewService` o cere, nu o recalculează, iar ecranul grupelor nu mai numără în browser.
Trei lucruri:

- **Vârsta e în zile calendaristice**, prin `daysWaiting` din `project/pending.rules.ts`: un
  document urcat ieri la 18:00 și citit azi la 09:00 are **o zi**, nu zero. Cine citește „de 3 zile"
  numără dimineți în care nu s-a uitat, nu blocuri de 72 de ore.
- **`staleAfterDays` pleacă pe sârmă**, ca pragul de ocupare din E21: e o propunere, iar ecranul
  spune ce linie desenează în loc s-o hardcodeze.
- **Cifra stă în meniu**, prin `pendingProjectsStore` încărcat din layout-ul `dashboard`, fiindcă
  riscul pe care îl acoperă e că nimeni nu apasă butonul — iar un număr la care trebuie să navighezi
  nu acoperă asta. `null` la `oldestDays` înseamnă „nimic nu așteaptă"; zero înseamnă „a venit azi".

**Job-urile cu cron sunt oprite sub `NODE_ENV=test`, prin `disabled` pe decorator.** Jest setează
variabila singur, iar ambele suite construiesc `AppModule`-ul real: o rulare care prinde exact
secunda de declanșare ar scrie un rând în `outbox` în mijlocul aserțiunilor altcuiva, o dată pe an
și niciodată reproductibil. Consecința pentru tine: **un `@Cron` nu se declanșează în teste**, deci
logica de selecție se scrie ca metodă publică, iar cron-ul doar o cheamă — vezi
`apps/api/src/modules/class-session/unmarked-attendance.job.ts`, care își face treaba în
`reportFor(date)`. Testele cheamă metoda; ce testează cron-ul e ora, și aia nu se testează.
**`@Interval` n-are obiect de opțiuni**, deci acolo garda se scrie ca prima linie a metodei —
`if (process.env.NODE_ENV === 'test') return;` — vezi `OutboxDispatcher` și `LateRegisterJob`.

**Mementoul zilnic de prezență pleacă la 10:00 pe fusul școlii, nu al serverului.** `@Cron` primește
`timeZone: 'Europe/Bucharest'`, iar ziua raportată se calculează prin `Intl` pe același fus — altfel
un server în alt fus ar întreba de altă zi decât cea care tocmai s-a încheiat la școală, și ar
raporta liniște. Adresa e `MAIL_OFFICE_ADDRESS`, opțională, cu `office@itbridgeschool.com` ca
implicit; e prinsă deja de wildcard-ul `MAIL_*` din `turbo.json`, deci nu-i trebuie linie proprie.
Mesajul pleacă doar dacă există ședințe nemarcate, și e unul singur pe zi: `dedupeKey`-ul e
`unmarked-attendance:<zi>`, deci o repornire la 10:05 nu trimite a doua oară.

**Al doilea memento de prezență pleacă în timpul orei, și fereastra lui are două capete.**
`late-register.job.ts` (E12 S7) verifică din 5 în 5 minute și alertează biroul pentru o ședință care
a început acum cel puțin 15 minute și n-are nicio prezență marcată. Capătul de sus e cel care se
uită ușor: fereastra **se închide când se termină ora**, fiindcă singurul motiv pentru care mesajul
există e că un telefon mai poate schimba răspunsul. Fără el, un proces picat toată după-amiaza s-ar
trezi trimițând o duzină de alerte despre ore terminate demult — iar ce ratează fereastra apare
oricum a doua zi la 10:00. `dedupeKey`-ul e `late-register:<id>:<YYYY-MM-DDTHH:mm>` — ședința și ora ei
de început: ședința rămâne în fereastră tot restul orei, deci fără cheie biroul ar primi același mesaj
la fiecare tick, iar ora e în cheie fiindcă `moveSession` păstrează rândul — o ședință mutată în altă
zi e o nouă ocazie și primește o alertă proprie. Ambele mementouri pun
aceeași întrebare, `ClassSessionService.findUnmarkedSessions` — „nemarcat" n-are voie să însemne
două lucruri în funcție de care email îl citești.

**Orele se compară ca text, în ceasul școlii, niciodată ca instante.** `schoolLocalStamp(now)` și
`schoolDay(now)` stau în `apps/api/src/common/school-clock.ts` — au ieșit din
`absence-notice.rules.ts` când al treilea apelant a fost în afara prezenței, iar fișierul ăla le
reexportă, deci importurile vechi merg mai departe. Împreună cu `sessionStartStamp(session)`, rămas
lângă regula lui, dau `YYYY-MM-DDTHH:mm` pe `Europe/Bucharest`, iar comparația e pe string-uri
(`<` pentru un anunț „înainte de oră", `<=` la deschiderea ferestrei de 15 minute). Ședința ține
o dată locală și un `HH:mm:ss` local, deci orice comparație cu un instant UTC e capcana de o zi de
mai jos, cu altă față. Când ai nevoie de „acum minus 15 minute", **mută instantul și apoi
formatează** — nu scădea din text.

**Scheduler-ul trebuie să ruleze într-o singură instanță.** `FOR UPDATE SKIP LOCKED` face două
treceri simultane inofensive una față de alta, dar doi worker-i PM2 s-ar trezi amândoi la fiecare
tick. Fixarea e în `/srv/itbridge/ecosystem.config.js`, pe instanță: `instances: 1` și
`exec_mode: 'fork'`. Fișierul **nu e în repo** — vezi „Infrastructură — stare reală". Dacă cineva
trece vreodată aplicația pe `cluster`, asta e linia care se rupe prima, tăcut.

**Orizontul de opt săptămâni se rulează acum singur, iar până de curând nu se rula.** Ședințele se
scriu prin `POST /class-sessions/generate` (admin) **și** prin `TimetableHorizonJob`
(`apps/api/src/modules/class-session/timetable-horizon.job.ts`), la 04:30 pe ceasul școlii, pentru
toate grupele active. Butonul rămâne: jobul nu e altă cale, e aceeași cale chemată de un ceas —
`topUp` deleagă lui `generateSessions`, fiindcă acolo stau deja calendarul școlar, idempotența și
refuzul pe grupă inactivă, iar a doua implementare a lui „ce zile are grupa asta" e exact felul în
care două răspunsuri încep să difere.

**De ce e zilnic și nu săptămânal**: orizontul se măsoară din _ziua de azi_, deci o trecere
săptămânală l-ar lăsa să respire între șapte și opt săptămâni. Zilnic ține promisiunea pe care o face
constanta, și nu costă nimic — generarea e idempotentă pe `(group, date)` și lasă neatins ce există,
indiferent de stare, deci o dimineață obișnuită nu scrie niciun rând și nu spune nimic în log.

Ce se strica înainte merită ținut minte, fiindcă e forma pe care o iau lipsurile astea: orizontul nu
se termina, se retrăgea. Prezența se marchează pe `POST /attendance/session/:classSessionId`, deci o
oră fără rând nu se poate marca deloc — 404, și un ecran gol. Primul defect apărea la opt săptămâni
după ultima apăsare și arăta ca un bug în catalog, nu ca un orar pe care nu-l scrisese nimeni; cine
afla era profesorul din sală.

Restul a ce e programat în backend — dispecerul de outbox și verificarea de la minutul 15
(`@Interval`), mementoul de la 10:00, cele două notificări către părinte din E12 S4, mementourile de
restanță din E16 S7 și măturarea ofertelor de pe lista de așteptare din E11 S3 (`@Cron`), plus
purjarea sesiunilor, care stă în continuare pe un `setInterval` propriu în
`apps/api/src/modules/auth/session.service.ts` — **nu generează orar**, niciunul.

**Datele calendaristice se construiesc din componente locale, niciodată printr-un ocol prin UTC.**
TypeORM scrie o coloană `date` citind componentele locale ale valorii, iar `new Date('2026-08-29')`
e miezul nopții **UTC** — deci la vest de Greenwich se salvează ziua dinainte. În sens invers,
`toISOString().slice(0, 10)` pe o dată construită local dă ziua dinainte la est de Greenwich, adică
exact în România. Amândouă capetele au deja unelte: `parseIsoDate`, `toIsoDate` și `addDays` din
`apps/api/src/modules/class-session/class-session.dates.ts`, iar în frontend `toDateKey` și
`todayKey` din `apps/web/app/composables/useAttendanceCalendar.ts`, care compară string-uri
`YYYY-MM-DD` și nu ating deloc `Date`. Greșeala e de exact o zi, apare doar în unele fusuri și nu se
vede la review.

**Testele de pe `api` rulează pe ceasul școlii, `TZ=Europe/Bucharest`, iar asta e portanță, nu
preferință.** CI rulează în UTC, care e exact singurul fus în care greșeala de mai sus **nu se
vede**: o coloană `date` citită înapoi ca `Date` stă la miezul nopții local, iar `toISOString()` pe
ea dă ziua dinainte doar la est de Greenwich. Adică suita ar fi verde pe o mașină care nu e a
școlii, pentru o școală care își citește toate datele la București. Nu e ipotetic — `sameValue` din
`personal-fields.ts` compara data nașterii prin `toISOString()` și raporta drept schimbată una pe
care n-o atinsese nimeni, scriind în jurnal că cineva a editat data nașterii unui copil. Testul
pentru asta trece în UTC și pică în Europe/Bucharest.

`TZ` trebuie pus **înainte să pornească Node** — o atribuire pe `process.env.TZ` într-un spec e
prea târziu, fiindcă fusul e deja memorat —, deci stă pe scripturile din `apps/api/package.json`.
`tests-run-on-the-school-clock.spec.ts` verifică și declarația, și efectul; dacă adaugi un script
care pornește jest, treci-l acolo.

Într-un formular de admin, o dată se alege prin `AdminDateField`, al cărui model e chiar string-ul
`YYYY-MM-DD`: trecerea la `CalendarDate` stă în `apps/web/app/composables/useDateField.ts` și nu
atinge nici ea `Date`. Nu ancora un popover la `inputsRef` al lui `UInputDate` — e un index de
segment care depinde de locale, iar exemplul din documentația Nuxt UI exact asta face.

**Familia `no-unsafe-*` e pe `error` în codul de producție și oprită în teste.** Excepția pentru
teste e îngustă și justificată: supertest tipează `res.body` ca `any`, iar valorile întoarse de
mock-urile jest sunt netipate prin construcție — exact lucrurile pe care testul le verifică. În
`src/` nu mai există niciun `any` care să circule, deci regula chiar ține linia.

**Prefixul `_` marchează ce e nefolosit intenționat.** Parametri ceruți de un decorator Nest, sau
aserțiunile de tip din `apps/api/src/contract.ts`. Fără prefix, `no-unused-vars` le raportează.

**`@Request()` se tipează cu `AuthenticatedRequest`, importat ca `import type`.** Tipul e în
`apps/api/src/types/authenticated-request.ts` și descrie payload-ul JWT pe care îl atașează
`AuthGuard`. `import type` e obligatoriu: cu `emitDecoratorMetadata` pornit, un import normal
într-o semnătură decorată dă TS1272.

**`Profile.user` și `Child.group` sunt nullable în tipuri, nu doar în schemă.** Un profil creat de
admin nu are cont atașat, iar un copil nerepartizat nu are grupă. Verificările de proprietate
folosesc `child.parent.user?.id !== userId` — fără `?.`, un copil al unui profil fără cont arunca
TypeError în loc să răspundă 403.

**Nu rula `npm` în `apps/*`.** Nu mai există `package-lock.json` și nici `node_modules` propriu;
totul trece prin `pnpm` de la rădăcină. Pentru un singur workspace, `pnpm --filter api <script>`.

**Un conflict care merită explicat își pune propriul cod de eroare.** `AllExceptionsFilter` derivă
codul din statusul HTTP, deci orice 409 ieșea ca `CONFLICT`, iar frontend-ul avea o singură
propoziție pentru toate. Un serviciu poate acum să-și numească cazul:
`new ConflictException({ message, error: 'GROUP_SLOT_TAKEN' })`. Dacă adaugi un cod, adaugă-i și
propoziția în `MESSAGES` din `apps/web/app/composables/useApiError.ts` — altfel utilizatorul
primește mesajul în engleză de la server.

**`@itbridge/types` nu mai primește valori de rulare — nici `enum`-uri, nici hărți de etichete.**
Doar tipuri, și uniuni de literali unde altfel ai pune un `enum`. Pachetul e CommonJS, Vite îl
prebundle-uiește, iar o valoare exportată de acolo a ajuns în browser ca `undefined` de **două ori**:
o dată un `enum` căruia prebundler-ul i-a aruncat corpul păstrându-i linia de export, o dată o hartă
de etichete. De fiecare dată eșecul a fost tăcut — comparația aruncă **înăuntrul unui `computed`**,
Vue abandonează subarborele, iar o componentă pur și simplu nu se randează. Build verde, teste verzi,
ecran gol.

Etichetele în română stau lângă ecranele care le afișează (`apps/web/app/types/*.types.ts`), și e
oricum locul lor: contractul descrie ce trece pe sârmă, iar pe sârmă trece `'TRIAL'`, nu `'Probă'`.
`Weekday`, `Role` și `WEEKDAY_LABELS` sunt mai vechi și rămân; nimic nou nu li se alătură.
`ClassSessionStatus` a fost convertit la o uniune de literali la E12 S2, iar etichetele lui au
plecat în `apps/web/app/types/class-session.types.ts`, lângă `SessionStatus` — obiectul
`as const satisfies` cu care se compară un ecran.

În `contract.ts`, o uniune de literali se compară cu enum-ul din API prin `` `${Enum}` ``: enum-ul e
nominal, deci niciun sens al lui `extends` nu ține între cele două, oricât de identice ar fi
valorile. Template literal-ul îl reduce exact la string-urile care pleacă pe sârmă.

**`@itbridge/types` e CommonJS, iar Vite nu prebundle-uiește pachetele din workspace.** Le servește
browserului ca sursă, deci `exports.Weekday = ...` ajunge într-un `<script type="module">` și pică
cu „does not provide an export named 'Weekday'". Toată zona de admin importă o valoare din contract
(`WEEKDAY_LABELS`), deci răspundea 500 în `pnpm dev`, în timp ce paginile publice — care importă doar
tipuri, șterse la compilare — mergeau. Pachetul e listat acum în `vite.optimizeDeps.include`, în
`nuxt.config.ts`. Dacă apar valori exportate dintr-un alt pachet local, are nevoie de aceeași linie.

**`pnpm dev` face `^build` înainte; `pnpm --filter web dev` nu.** Task-ul `dev` din `turbo.json`
depinde de `^build`, deci pornirea prin rădăcină construiește întâi `packages/types`. Pornit direct
în workspace, Nuxt vede un `dist/` vechi sau inexistent și cade cu aceeași eroare de mai sus, care
arată ca o problemă de cod și nu e.

**Prețul e pe ședință, nu pe lună: `apps/api/src/modules/invoice/pricing.ts`.** 87,50 lei/ședință
primul copil, 62,50 fiecare frate. Pe o lună de patru ședințe iese exact 350 și 600 — numerele pe
care le știe toată lumea — dar o lună cu vacanță costă mai puțin, automat. Asta a făcut școala
dintotdeauna cu calculatorul; codul factura 350 fix și supra-factura fiecare lună scurtă.

**Tariful întreg merge la copilul cu cele mai multe ședințe**, restul iau tariful de frate. Sortarea
e toată regula: fără ea, suma ar depinde de ordinea rândurilor dintr-o interogare. Un copil cu zero
ședințe nu consumă tariful întreg.

**Emiterea se face din `/admin/invoices/emitere`, și numai de acolo**: un ecran cu familiile ca
arbore, o valoare per copil, total jos, un buton. **Valoarea e citită, nu tastată** (E15/S9):
serverul numără ședințele lunii din cataloage — `billable-sessions.rules.ts` e regula,
`BillableSessionsService` singura interogare — iar ecranul le arată, cu desfacerea lor și cu
ședințele fără catalog deasupra. `POST /invoices/issue` primește luna și data, nimic altceva; cine
apasă s-a uitat la ce s-a întâmplat, nu la ce a tastat cineva. Singurul număr care mai intră de mână
e **corectura pe copil** (`SessionCountOverride`, `PUT|DELETE /invoices/overrides`): o decizie
consemnată — cât, de ce, cine, când —, un rând per copil și lună, aplicată în fișă ca factura să
poarte același număr pe care l-a arătat ecranul, și înghețată odată ce familia are factura lunii.
Factura poartă o singură linie de produs, deci corectura nu contrazice niciodată catalogul; ce
apără rândul e evidența școlii.

Al doilea drum a fost **șters** (E18/S5b): `/admin/invoices/new` și `/admin/invoices/preview/:month`
emiteau aceeași lună prin `POST /invoices/preview` plus `POST /invoices`, adică pe numere calculate
de server, nu văzute de om. Ecranul lui arăta „Număr Copii" numărând toți copiii familiei, deși
factura numără de la E11/S4 doar înscrierile `ACTIVE` — două răspunsuri la aceeași întrebare, iar
cel de pe ecran era greșit. `POST /invoices` și `POST /invoices/preview` **există în continuare pe
server** și sunt testate; nimic din interfață nu le mai cheamă. Dacă adaugi un al doilea loc de unde
se emite, e aproape sigur o greșeală: locul e unul.

**O reducere știe dacă e în lei sau în procente, iar procentul se aplică pe prețul de listă.**
`Discount.type` (E15 S5) e `fixed` sau `percent` — un `50` stocat e cincizeci de lei sau jumătate de
factură, iar numărul singur nu poate spune care. `discountTotal` din `pricing.ts` calculează fiecare
procent din **prețul de listă**, niciodată dintr-un total curent, deci ordinea în care vin reducerile
din bază nu poate schimba factura; două reduceri de 50% duc totalul la zero, nu la un sfert.
Reducerea se rotunjește ea însăși la bani, ca linia tipărită și totalul să se adune pe hârtie.
Plafonul de 100% e în `DiscountService`, nu în DTO: o actualizare poate schimba tipul într-o cerere
și valoarea în alta, iar doar starea de după îmbinare spune ce ajunge stocat.

**Recomandarea se dă la apăsare, iar o apăsare în plus e o lună în plus** (E20 S5). Controlul din
profilul familiei e un `−  n luni  +`: `POST /discounts/referral` adaugă o lună la 50%,
`DELETE /discounts/referral/:parentId` o ia pe ultima înapoi, iar `GET` pe aceeași cale întoarce
starea. Toate trei răspund cu **lunile acoperite**, nu cu rândul atins — un ecran care și-ar aduna
singur apăsarea ar diverge de server în clipa în care altcineva șterge o lună din `/admin/reduceri`.

Trei reguli care par detalii și nu sunt:

- **A doua apăsare dă a doua lună, nu o reducere mai mare pe aceeași lună.** Procentele se adună pe
  prețul de listă (`discountTotal`), deci 50% peste 50% e o lună gratuită, iar una apărută dintr-un
  dublu-clic nu se deosebește de una hotărâtă. `nextUncoveredMonth` caută prima lună neacoperită,
  deci umple întâi golul lăsat de un `−`.
- **Luna o alege serverul**, prin `nextBillingMonthAt` și `monthAfter` din
  `apps/api/src/modules/discount/discount.rules.ts`, pe ceasul școlii și din componentele
  string-ului — prin `Date`, un întâi de lună la 01:00 ar cădea pe luna tocmai facturată, iar 31
  decembrie ar sări o lună.
- **Nimic nu se întinde în trecut**: `+` pleacă de la luna viitoare, `−` ia doar de acolo încolo, și
  scoate numai rândurile recompensei. Un procent tastat din formular nu e al butonului să-l
  retragă, iar peste el `DISCOUNT_ALREADY_GRANTED` refuză să se adune. Refuzul e în serviciu, fără
  index unic în spate — spre deosebire de locurile din E11, un rând duplicat aici se vede pe ecran
  și se șterge din două clicuri.

**Ultimul pas al oricărei facturi e tabelul `discounts`, și nu depinde de cum s-a calculat suma.**
Indiferent ce dă totalul — ședințe numărate pe un ecran, prezențe, orice vine după —, rândurile
familiei pe **luna care se emite** (`monthIssued`) se scad la final, prin `discountTotal` din
`apps/api/src/modules/invoice/pricing.ts`. Calea de azi o face în `issueFromSessions`; **o cale nouă
de emitere trebuie s-o facă și ea.** Fără pasul ăsta, familia căreia școala i-a promis jumătate
primește factura întreagă, iar promisiunea rămâne în tabel, nevăzută de nimeni: nu apare ca eroare
nicăieri, fiindcă suma calculată e perfect validă. Cazul obișnuit e −50% din E20/S5, dat dintr-un
buton, deci nu mai e rar.

**Zero e un răspuns, nu un câmp gol.** O lună fără plată se scrie ca factură `waived`, de 0 lei,
fără PDF. Rândul există fiindcă n-are bani în el: fără el, o familie fără factură pe octombrie arată
la fel cu una a cărei lună a uitat-o cineva. `GET /invoices/:id/pdf` răspunde 404 pe ele, explicit.

`apps/web/shared/courses.ts` ține cifrele pentru site și **încă spune „350 lei pe lună"** — adică
prețul unei luni pline, nu regula. Dacă atingi prețul, potrivește-le pe amândouă.

## Infrastructură — stare reală

**Stage rulează întreg. Din producție, doar site-ul.**

|                 | web                                 | API                                  |
| --------------- | ----------------------------------- | ------------------------------------ |
| `release/stage` | `stage.itbridgeschool.com` (Vercel) | `api-stage.itbridgeschool.com` (EC2) |
| `release/prod`  | `itbridgeschool.com` (Vercel)       | — nedeployat                         |

Frontend-ul e pe **Vercel** pe amândouă branch-urile, configurat din dashboard — nu există
`vercel.json`. Backend-ul e pe o singură instanță **EC2** în `eu-north-1`, cu Postgres 17 pe aceeași
mașină, PM2 pentru proces și **Caddy** pentru TLS și proxy invers către `127.0.0.1` (nu `localhost`:
`main.ts` ascultă pe IPv4, iar numele se rezolvă întâi la `::1`). `api.itbridgeschool.com` n-are
nimic în spate, deliberat: `release/prod` poartă API-ul de dinainte de E08 — zece module față de
nouăsprezece — deci un deploy de acolo n-ar fi o lansare timpurie a platformei ăsteia, ci a alteia,
mult mai vechi. `deploy.yml` refuză branch-ul pe nume.

**Un push pe `release/stage` e un deploy.** `.github/workflows/deploy.yml` cheamă `ci.yml` prin
`workflow_call` — verificările și deploy-ul sunt o singură rulare în Actions, deci deploy-ul nu poate
porni pe un commit roșu — și apoi:

1. schimbă un token OIDC pe un rol AWS de o oră. **Nicio cheie AWS nu e stocată în GitHub**; ce e
   acolo e ARN-ul rolului și id-ul instanței. Trust policy-ul e limitat la `refs/heads/release/*`.
2. trimite comanda prin **SSM**, deci nu se deschide niciun port pentru deploy și nu există cheie SSH
   care să se scurgă.
3. pe instanță rulează întâi `fetch-env.sh` **ca root** — regenerează `/etc/itbridge/stage.env` din
   Parameter Store, iar `/etc/itbridge` e 750 —, apoi `deploy.sh` **ca `deploy`**: SSM rulează ca
   root, iar un `node_modules` al lui root sau un al doilea daemon PM2 ar strica fiecare deploy de
   după ăsta, în timp ce ăsta ar raporta succes.
4. `deploy.sh` face `install`, `build`, **se oprește dacă n-a ieșit `apps/api/dist/main.js`** —
   `deleteOutDir` golește `dist/` la început, deci un build întrerupt lasă procesul viu servind din
   memorie și rupe abia la următoarea repornire —, rulează `migration:run`, apoi `pm2 reload`, și
   așteaptă ca procesul să răspundă pe `/health`.
5. workflow-ul verifică la final `/ready`, nu `/health`: `/ready` atinge Postgres și S3, deci prinde
   un proces pornit lângă o bază la care migrarea n-a ajuns.

**Configurația nu e în repo și nu e în GitHub.** Stă în **SSM Parameter Store** și ajunge pe instanță
ca `/etc/itbridge/<env>.env` (640, `root:deploy`), regenerat la fiecare deploy. O variabilă nouă se
scrie acolo — dacă aplicația n-o vede după un deploy, ori n-a fost pusă în Parameter Store, ori
lipsește din lista lui `fetch-env.sh`.

**`ecosystem.config.js`, `deploy.sh`, `fetch-env.sh` și `backup.sh` nu sunt în repo.** Stau în
`/srv/itbridge/` pe instanță. Dacă le cauți aici și nu le găsești, acolo sunt. Backup-ul e un
`pg_dump` zilnic la 03:15 către S3, cu ținte separate pentru cele două medii.

`docker-compose.yml` conține Postgres și MinIO — infrastructura, și numai ea. Aplicația rulează
direct pe Node, local și în producție. Nu adăuga servicii de aplicație acolo.

**Cheie Let's Encrypt compromisă, în istoric.** Un `privkey.pem` real, valid până în ianuarie
2027, a fost comitat la `58e2634` și a rămas în repo până la curățenia din E01. Fișierele au fost
șterse din branch, dar istoricul nu a fost rescris, deci cheia e în continuare recuperabilă din
commit-urile vechi ale unui repo public. **Tratează-o ca fiind compromisă**: nu o refolosi, nu
reconstitui certificatul din ea. Certificatul acoperea un host de DNS dinamic care nu mai e
folosit, iar TLS-ul viitor se face cu certificate noi, obținute de Caddy. `certs/`, `*.pem`,
`*.key` și `*.crt` sunt acum în `.gitignore`.

## Testare

Trei niveluri, cu roluri diferite:

- **Unitare**, lângă cod în `apps/api/src/**/*.spec.ts`. Serviciile primesc repository-uri
  mock-uite din `src/testing/repository.mock.ts`. Aici se verifică logica de business și _forma_
  interogărilor de autorizare — `isScopedToUser` se uită la ce `andWhere` s-au adăugat, fără SQL.
- **Matricea de autorizare**, `apps/api/src/authorization.spec.ts`. Enumerează singură toate
  handler-ele din toate controllerele și verifică guard-ele și rolurile. Un endpoint nou fără
  `@UseGuards` apare aici fără să scrie nimeni un test. Dacă adaugi unul public sau o scriere
  permisă părinților, treci-l explicit prin listele din fișier.
- **Integrare**, `apps/api/test/*.e2e-spec.ts`. Aplicația reală pe Postgres, doar S3 și PDF
  înlocuite. Aici se verifică _efectul_ autorizării: doi părinți reali, iar unul nu vede datele
  celuilalt.

Frontend-ul are vitest în `apps/web/test/`. Rulează sursa direct, fără să pornească Nuxt;
auto-importurile (`ref`, `useCookie`, `$fetch`) sunt puse la loc în `test/setup.ts`.

**Accesibilitatea paginilor publice se verifică în CI, cu un browser adevărat.** `pnpm test:a11y`
construiește `apps/web`, servește `.output` pe un port local și trece axe-core peste fiecare pagină
pe care o publică `sitemap.xml`, în temă deschisă și în temă închisă, pe WCAG 2.0 și 2.1 nivel A și
AA — `apps/web/scripts/check-a11y.mjs`, rulat în CI în același job cu lint, typecheck și build.
Patru lucruri de știut înainte să-l atingi:

- **jsdom n-ar folosi la nimic.** Fără cascadă și fără layout, contrastul nu se poate calcula, deci
  axe îl sare — și exact ăla e motivul pentru care verificarea există.
- **Rulează cu `prefers-reduced-motion: reduce`, și nu din politețe.** Blocurile intră prin
  `classical-rise`, iar axe citește culoarea din clipa în care se uită: prinsă la jumătate, aceeași
  clasă `.lede` raportează 1,47:1 pe două pagini și 1,18:1 pe a treia. Cu preferința pornită,
  `useReveal` iese devreme, nimic nu se ascunde și rezultatul e același de două ori.
- **Serverul de probă se pornește fără shell.** Cu `shell: true`, `kill` lua shell-ul și lăsa Nitro
  pe port; rularea următoare își pierdea serverul cu `EADDRINUSE` și verifica vesel build-ul vechi
  rămas acolo, raportând verde pe fiecare pagină. Scriptul se uită acum dacă procesul lui moare și
  cade cu mesaj.
- **Într-un container, Chromium are nevoie de două portițe**, amândouă oprite implicit fiindcă CI
  n-are nevoie de niciuna: `A11Y_CHROMIUM_PATH` pentru un browser deja instalat pe mașină, și
  `A11Y_NO_SANDBOX=1` fiindcă sandbox-ul propriu al lui Chromium nu pornește ca root — și nu pică,
  ci **atârnă**, ceea ce costă o jumătate de oră prima dată.

**Zona autentificată e sub aceeași poartă, dar într-un job propriu.** `pnpm test:a11y:auth`
(`apps/web/scripts/check-a11y-auth.mjs`, E18 S6) se autentifică și trece axe peste cele 51 de
ecrane de admin și de portal, în ambele teme, pe aceleași etichete. Patru lucruri îl deosebesc de
cel public:

- **Are nevoie de bază de date, seed și un API care răspunde**, fiindcă un ecran fără date pe el nu e
  ecranul pe care îl folosește cineva. De asta e job separat în CI, cu Postgres al lui — MinIO nu,
  `seedInvoicePdfs` întreabă dacă S3 e accesibil și sare când nu e.
- **Originea trebuie trecută în `CORS_ORIGINS`.** Scriptul servește build-ul pe `127.0.0.1:3124`, iar
  fără linia aia browserul refuză fiecare cerere înainte ca API-ul s-o audă: nu apare nimic în logul
  lui, iar simptomul arată exact ca o parolă greșită. Scriptul întreabă întâi, cu un singur OPTIONS,
  și pică imediat cu linia de adăugat — înainte să pornească un browser degeaba.
- **Rutele vin din `app/pages/`**, cum vin cele publice din sitemap: un ecran nou e verificat fără
  să-l adauge nimeni a doua oară. Cele cu `[param]` în cale nu se pot vizita fără un id care există,
  deci sunt tipărite la final cu număr — golul e o cifră, nu o tăcere.
- **Două verificări de nume rulează lângă axe, fiindcă axe nu le are.** axe întreabă dacă un control
  **are** nume și se oprește acolo; amândouă cazurile de mai jos treceau pe fiecare ecran. Primul e
  **același nume de mai multe ori**: douăzeci de rânduri cu „Acțiuni", trei alegătoare de dată cu
  „Alege data din calendar", paisprezece butoane cu „Luna anterioară" — citite ca listă de controale,
  sunt paisprezece intrări identice și nicio cale de a alege una. Al doilea e **un nume în engleză**:
  „Show popup" e implicitul lui reka-ui pe declanșatorul de combobox și a ajuns pe **44 de ecrane**
  dintr-un singur `USelectMenu` neetichetat din navbar-ul de admin. Niciunul nu se putea găsi citind:
  primul apare doar când componenta e desenată în buclă, iar al doilea nu e scris nicăieri în repo.
  De aici și regula: dacă un ecran desenează **mai mult de un** `AdminDateField`, dă-i `label` —
  butonul lui arată o iconiță și nimic altceva, deci numele e tot ce primește cititorul.

**A doua gardă rulează în același browser: nicio pagină publică nu iese din origine și nu pune
niciun cookie.** `pnpm test:privacy` (`apps/web/scripts/check-third-party.mjs`, E07 S5) încarcă
fiecare pagină din sitemap, **o derulează până jos** și pică la prima cerere către alt domeniu sau
la primul cookie. Serverul de probă, citirea sitemap-ului și pornirea lui Chromium sunt împărțite cu
verificarea de accesibilitate, în `scripts/preview-site.mjs` — de asta variabilele de mediu îi spun
tot `A11Y_*`: sunt scrise mai sus și setate în shell-urile oamenilor, iar una necitită nu dă eroare,
ci atârnă. Trei lucruri de știut:

- **Derularea e tot rostul rulării.** Bug-ul pentru care există garda era `loading="lazy"` pe
  `<iframe>`-ul hărții: se citește ca reținere și se declanșează când cititorul derulează până la
  el. Fără derulare, iframe-ul de sub linia de plutire nu intră niciodată în vizor și verificarea
  raportează verde pe o pagină care ar chema Google la prima mișcare a cititorului.
- **Cookie-urile se numără de la zero, nu „doar cele neesențiale".** Pe site-ul public numărul
  onest e zero — cele patru cookie-uri pe care le are platforma sunt toate după autentificare —,
  iar politica de cookie-uri promite exact asta cititorului. O linie mai strictă și mult mai ușor
  de verificat.
- **Nu apasă butonul.** Cine cere harta primește Google, cu consecințele scrise lângă buton; garda
  e despre cine nu cere. Dacă adaugi ceva care iese din domeniu, poarta e `consentStore` plus un
  `v-if` — `v-show` sau un `src` schimbat sunt cereri care au plecat deja.

**A treia gardă, pe aceeași listă de pagini: fiecare link intern răspunde 200.** `pnpm test:links`
(`apps/web/scripts/check-links.mjs`, E19 S9) citește linkurile **din pagina randată**, nu din sursă,
deci intră și cele construite la rulare. Trei lucruri:

- **Țintele n-au de ce să fie în sitemap.** Paginile de pe care pleacă vin de acolo, dar
  `/auth/login` e legat din navigație și e dinadins în afara lui — dacă se rupe, e la fel de rupt.
- **Fragmentele se verifică pe id-urile paginii-țintă**, fiindcă sunt jumătatea pe care un cod de
  stare n-o vede: `#o-secțiune` se rupe când cineva reformulează un titlu, iar pagina răspunde în
  continuare 200.
- **Linkurile externe nu sunt verificate**, prin decizia story-ului: un site terț picat o oră nu e
  un motiv ca CI-ul nostru să fie roșu. Sunt citirea lunară din E19 S8 — și, la fel ca vecinele ei,
  verificarea asta nu face nicio cerere în afara originii.

`apps/agent` folosește `node --test`, fără jest și fără nicio unealtă proprie — n-are motiv să
capete una. `pnpm --filter agent test` compilează întâi și rulează din `dist`: un `.ts` cu `import`
e interpretat de Node ca modul ES, iar acolo importurile fără extensie nu se rezolvă.

**Bug-urile cunoscute se scriu ca `it.failing`**, nu ca teste care cimentează comportamentul
greșit. Un astfel de test trece cât timp bug-ul există și devine roșu în clipa în care e reparat —
moment în care se șterge `.failing`. Convenția și-a făcut treaba de trei ori și **în momentul ăsta
nu mai e niciun `it.failing` viu în repo**: prețul la doi copii, prețul la trei sau mai mulți și
crearea de profiluri fără date de contact au devenit toate teste de regresie, iar unul care cimenta
comportamentul greșit — „charges 250 per child for two children" — a fost șters. Dacă vrei un
exemplu, citește-le în `pricing.spec.ts` ca teste normale; convenția rămâne pentru bug-ul următor.

## Planul de lucru

Epic-urile sunt în [docs/epics/](docs/epics/). Citește
[docs/epics/README.md](docs/epics/README.md) pentru harta dependențelor înainte să începi ceva
mai mare decât un bugfix. Lista de lansare a site-ului public — cele douăzeci de întrebări
obișnuite, fiecare cu starea verificată în cod și cu cine o ține — e în
[docs/lansare.md](docs/lansare.md).
