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

**`main` e site-ul public. `develop` e restul.**

Vercel servește `main`, iar paginile publice nu ating backend-ul — de asta site-ul stă în producție
deși API-ul nu e deployat nicăieri. Tot ce e după autentificare — portalul, zona de admin, întreg
`apps/api` de după E08 — trăiește pe `develop` și rămâne acolo până există instanța de care are
nevoie ([E01](docs/epics/E01-infrastructura-medii.md), S4).

În `main` intră doar ce afectează site-ul public și poate fi verificat fără backend: conținut, SEO,
performanță, corecturi de interfață publică. Se aduc prin cherry-pick, nu prin merge din `develop` —
un merge ar trage în producție jumătate de platformă care n-are unde să ruleze.

**Documentația din `docs/` și fișierul ăsta sunt identice pe ambele branch-uri**, fiindcă descriu
proiectul, nu ramura. Deci pe `main` vei citi despre module care nu există în arborele de sub tine —
`enrollment`, `project`, `storage` — și e în regulă: sunt pe `develop`. Ce **nu** e în regulă e ca
cele două copii ale documentației să divergă; dacă atingi una, adu-o și pe cealaltă.

## Comenzi

Toate de la rădăcină. Nu intra în `apps/*` să rulezi `npm` — nu există `package-lock.json` și nu
mai există `node_modules` propriu.

```bash
cp .env.example .env              # un singur .env, la rădăcină
pnpm install
docker compose up -d              # Postgres + MinIO; aplicația rulează pe Node
pnpm --filter api migration:run   # schema; synchronize e oprit
pnpm seed                         # date de dezvoltare; admin / parola123
pnpm dev                          # api + web, hot reload

pnpm build          # turbo, în ordinea dependențelor
pnpm typecheck      # toate workspace-urile
pnpm lint           # verifică, nu modifică; corectare: pnpm --filter api lint:fix
pnpm test           # jest pe api, vitest pe web
pnpm test:e2e       # integrare prin HTTP; cere Postgres pornit

pnpm --filter api <script>   # o comandă într-un singur workspace
```

Aplicația **nu** rulează în Docker, nici local nici în producție. Backend-ul își citește `.env`
prin `apps/api/src/load-env.ts`, importat înaintea oricărui modul care atinge `process.env` la
încărcare — dacă adaugi un import nou în `main.ts`, lasă-l pe ăsta primul.

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

**Backend** — șaptesprezece module în `apps/api/src/modules/`, treisprezece după același tipar
`controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `enrollment`, `location`,
`room`, `group`, `class-session`, `attendance`, `invoice`, `payment`, `discount`. Patru ies din
tipar: `storage` n-are controller, fiindcă nimic din el nu e expus pe HTTP, `mail` are unul singur
și îngust — editorul de șabloane din E17 S2; trimiterea în sine rămâne neexpusă —, `health` n-are
decât atât, iar `project` are **două** controllere și patru servicii — audiențele sunt diferite
(agentul de pe Windows și ecranele), iar treburile la fel: ce e un document, ce pleacă din clădire,
ce ia părintele acasă, ce cere agentul. Entitățile stau centralizat în `apps/api/src/entities/` și
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

**O absență anunțată nu marchează pe nimeni absent** (E12 S3). `AbsenceNotice` leagă copilul de o
**ședință**, ca tot ce vorbește despre o oră de curs. Catalogul rămâne al profesorului: un copil al
cărui părinte a anunțat poate veni totuși. Trei lucruri de ținut minte: `inTime` se **îngheață la
scriere** — eligibilitatea e un fapt despre momentul anunțului, iar o valoare derivată la citire
și-ar schimba răspunsul pe măsură ce ora intră în trecut; un al doilea anunț **modifică** rândul, nu
adaugă unul (`UQ_absence_notice_child_session`), și rejudecă `inTime`; iar termenul se compară pe
**ceasul școlii**, prin `Intl` pe `Europe/Bucharest` — prin UTC, un anunț de la 01:00 ora Bucureștiului
ar fi judecat ca fiind ziua dinainte. Regula însăși („înainte să înceapă ora") e o linie în
`apps/api/src/modules/attendance/absence-notice.rules.ts`.

**Recuperarea e un drept câștigat, nu un marcaj observat** (E12 S4). `MakeUpCredit` apare acolo unde
un anunț **în termen** se întâlnește cu un catalog care spune că nu a fost acolo — niciuna dintre
jumătăți nu ajunge singură. Nu e un endpoint: se câștigă, se retrage și se consumă ca efect al
marcării, în `AttendanceService.settleMakeUp`. **Nu are coloană de stare**: trei stări se citesc din
rând, iar „expirată" e calendarul care s-a mișcat — o coloană ar fi greșită exact cât timp n-a rulat
nimic s-o corecteze. `expiresOn` se îngheață la scriere, ca `inTime`. Iar **locul liber se numără pe
ședință**: un copil în recuperare ocupă un scaun ca o probă (D7), deci înscrieri în vigoare plus
recuperări deja programate pe acea ședință — nu `occupancyOf`, care e despre grupă.

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

**Auth** — două roluri, `ADMIN` și `PARENT` (`apps/api/src/enum/role.enum.ts`). `register` creează
întotdeauna `PARENT`; adminul se promovează manual prin DB sau `PUT /users/:id`. JWT în pereche
access (15 min) / refresh (7 zile), cu secrete distincte în `apps/api/src/constants/jwtConstants.ts`.

**Un cont de părinte trece prin două porți înainte să fie folosibil** (E11 S2). Sunt două coloane
independente pe `User`, nu un singur status: `emailConfirmedAt` — părintele a deschis linkul trimis
la înregistrare — și `approvalStatus` — un admin a recunoscut familia. „Activ" nu e stocat, e derivat
prin `isAccountActive` din `apps/api/src/entities/user.entity.ts`, fiindcă o a treia coloană ar fi
liberă să contrazică primele două. Adminii sunt exceptați: nimeni nu-i confirmă și nu-i aprobă.
Porțile se pot deschide în orice ordine, iar singurul lucru pe care îl blochează efectiv e
repartizarea unui copil într-o grupă (`PARENT_ACCOUNT_NOT_ACTIVE`). **Un cont neactiv se poate
autentifica** — portalul îi arată ce mai lipsește și butonul de retrimitere a linkului; un login care
refuză fără să explice ar lăsa familia să nu distingă „încă nu" de „stricat".

**`register` scrie și `Profile`-ul, în aceeași tranzacție.** Nu mai există fereastra în care un cont
există fără date de contact, deci `/user/profile-setup` nu mai are ce cere unui părinte nou. Celălalt
drum către un `Profile` — adminul care introduce o familie de la telefon, prin `POST /profiles` —
rămâne exact cum era, cu toate câmpurile opționale. Sunt două uși cu reguli diferite, fiindcă au
surse de adevăr diferite. Un test ține fluxul adminului viu, ca să nu fie strâns din greșeală odată
cu `register`.

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

Vezi `apps/api/src/modules/invoice/invoice.service.ts:92`. Același tipar în `payment`, `child`, `profile` — respectă-l.

**Numai `andWhere`, niciodată `where`, după ce ai început să compui.** `qb.where()` _înlocuiește_
toată clauza, deci un `where` pus după restrângerea pe utilizator o șterge fără niciun semn. Exact
așa a scăpat `PaymentService.findOne`: orice părinte putea citi plata oricărei alte familii, cu
profilul complet atașat. Dacă ai nevoie de o primă condiție, pune-o tot cu `andWhere`.

**Frontend** — lanțul de autentificare are o ordine care contează:
`apps/web/app/plugins/01.auth.client.ts` setează `authInitialized` → middleware-urile globale
`01.auth.global.ts` și `02.profile-setup.global.ts` **ies devreme** dacă flag-ul e fals →
`apps/web/app/middleware/admin-check.ts` e opt-in, pus explicit pe paginile `/admin/*`. Prefixele numerice
din numele fișierelor dictează ordinea de execuție; nu le redenumi.

Tokenurile trăiesc în cookies (`apps/web/app/stores/tokenStore.ts`). Toate apelurile trec prin
`apps/web/app/composables/api/useApi.ts`, care face refresh automat pe 401 și de-duplică refresh-urile
concurente printr-un `refreshPromise` partajat. Nu apela `$fetch` direct — folosește
composable-urile din `apps/web/app/composables/api/`.

State-ul e în Pinia stores (`stores/`), tipurile în `types/`, câte un fișier per domeniu.

**Partea publică nu atinge backend-ul.** Cele șapte pagini publice, formularul de contact,
`robots.txt`, `sitemap.xml`, `llms.txt` și datele structurate funcționează fără `API_BASE` — de
aceea site-ul stă în producție pe Vercel deși backend-ul nu e deployat. Faptele despre școală stau
în `apps/web/shared/`, nu în pagini: `school.ts` (nume, telefon, adrese, program), `courses.ts`
(nivelurile și prețurile), `teachers.ts`, `seo.ts` (titlul și descrierea fiecărei pagini),
`structured-data.ts` (constructorii de JSON-LD). Aceleași constante alimentează pagina, graful
JSON-LD, sitemap-ul și `llms.txt` — **dacă schimbi un preț sau o adresă, schimbi acolo, într-un
singur loc.** Un număr scris de mână într-o pagină e un bug, nu o scurtătură: NAP inconsecvent e
cea mai frecventă cauză de poziționare locală slabă.

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
SQL-ul generat înainte de commit. O redenumire de coloană îi apare ca `DROP` plus `ADD` — dacă asta
ar pierde date, rescrie migrarea de mână.

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

**Ordinea rutelor contează în `ProjectController`, și nicăieri altundeva în repo.**
`link/:publicId`, `child/:childId/archive`, `group/:groupId/missing` și `send` sunt declarate
înaintea lui `:id/…`, fiindcă Nest potrivește în ordinea declarării și `:id` are `ParseIntPipe`, care
răspunde 400 la un UUID.

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
`outbox` cu motivul scris în `lastError`. `MAIL_OUTBOX_ENABLED=false` oprește doar scheduler-ul;
testele de integrare îl setează, ca o trecere de fundal să nu miște rândurile sub aserțiuni.

**Restanța se derivă, iar `Invoice.status` e doar o memorie** (E16 S7). Termenul e 14 zile de la
`dateIssued` — `arrears.rules.ts`, fără coloană `dueDate` — iar `ArrearsService.list` numără plățile
**reușite**, nu se uită la coloana de stare: un ecran despre bani n-are voie să greșească o zi
fiindcă n-a rulat un job. `markOverdue` ține coloana onestă pentru restul ecranelor. Consecința pe
care se sprijină acceptanța: mementourile se opresc la încasare fiindcă factura plătită iese din
interogare, nu fiindcă anulează cineva ceva.

**Numai marketingul stă pe o bifă** (E17 S4). `Profile.marketingOptIn` e implicit `false` — un
consimțământ pe care nu l-a dat nimeni nu e consimțământ — și gatează exclusiv `queueMarketing`.
`queue` și `queueOrRecord` **nu primesc deloc preferința**, deci nu există argument prin care cineva
ar putea opri o factură, o chitanță, o oră anulată sau proiectul copilului: alea sunt executarea
contractului, nu reclamă. Un refuz **nu** lasă rând în evidență, spre deosebire de un mesaj fără
destinatar — acolo cineva trebuia contactat și n-a fost, aici nimeni nu trebuia.

**Un mesaj care n-are unde să plece lasă un rând, nu o linie de log** (E17 S5). `queueOrRecord` din
`OutboxService` primește destinatarul oricare ar fi el și scrie `undeliverable` cu motiv tipizat
(`no_address` / `unconfirmed_address`) când n-are adresă — starea e terminală și dispecerul n-o
revendică niciodată, fiindcă niciun backoff nu face să apară o adresă. Nu te ramifica pe
`if (profile.email)` înainte de coadă: exact aia punea faptul într-un log pe care nu-l citește
nimeni, iar „părintele n-a fost anunțat" arăta ca o coadă blocată. Adresa rămâne goală pe rândul
nelivrabil — una inventată n-ar putea fi deosebită de una reală care a respins mesajul.

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
`sessionStartStamp(session)` din `apps/api/src/modules/attendance/absence-notice.rules.ts` dau
amândouă `YYYY-MM-DDTHH:mm` pe `Europe/Bucharest`, iar comparația e pe string-uri (`<` pentru un
anunț „înainte de oră", `<=` la deschiderea ferestrei de 15 minute). Ședința ține
o dată locală și un `HH:mm:ss` local, deci orice comparație cu un instant UTC e capcana de o zi de
mai jos, cu altă față. Când ai nevoie de „acum minus 15 minute", **mută instantul și apoi
formatează** — nu scădea din text.

**Scheduler-ul trebuie să ruleze într-o singură instanță.** `FOR UPDATE SKIP LOCKED` face două
treceri simultane inofensive una față de alta, dar doi worker-i PM2 s-ar trezi amândoi la fiecare
tick. Fixarea se face în fișierul de ecosistem din E01 S4, care nu există încă.

**Orizontul de opt săptămâni nu se rulează singur.** Ședințele se scriu doar la cerere, prin
`POST /class-sessions/generate` (admin); nu există niciun job care să le scrie. Ce e programat în
backend — dispecerul de outbox și verificarea de la minutul 15 (`@Interval`), mementoul de la 10:00,
cele două notificări către părinte din E12 S4 și mementourile de restanță din E16 S7 (`@Cron`), plus
purjarea sesiunilor, care stă în continuare pe
un `setInterval` propriu în `apps/api/src/modules/auth/session.service.ts` — **nu generează orar**,
niciunul. Iar prezența se marchează pe
`POST /attendance/session/:classSessionId`, deci fără ședință generată marcarea răspunde 404 și
ecranul n-are ce afișa. Generarea e idempotentă pe `(group, date)` și lasă neatins ce există deja,
indiferent de stare — se poate chema oricând și de oricâte ori, iar o a doua rulare nu învie o
ședință anulată. Până când E01 S4 aduce procesul care poate purta un cron, o cheamă cineva.

**Datele calendaristice se construiesc din componente locale, niciodată printr-un ocol prin UTC.**
TypeORM scrie o coloană `date` citind componentele locale ale valorii, iar `new Date('2026-08-29')`
e miezul nopții **UTC** — deci la vest de Greenwich se salvează ziua dinainte. În sens invers,
`toISOString().slice(0, 10)` pe o dată construită local dă ziua dinainte la est de Greenwich, adică
exact în România. Amândouă capetele au deja unelte: `parseIsoDate`, `toIsoDate` și `addDays` din
`apps/api/src/modules/class-session/class-session.dates.ts`, iar în frontend `toDateKey` și
`todayKey` din `apps/web/app/composables/useAttendanceCalendar.ts`, care compară string-uri
`YYYY-MM-DD` și nu ating deloc `Date`. Greșeala e de exact o zi, apare doar în unele fusuri și nu se
vede la review.

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

**Emiterea se face din `/admin/invoices/emitere`**, nu prin `POST /invoices`: un ecran cu familiile
ca arbore, o valoare per copil, total jos, un buton. Serverul facturează numerele de pe ecran, nu
și le recalculează — cine apasă s-a uitat la fiecare. Ruta veche există în continuare pentru
`calculateAmount`, care numără înscrieri active și e folosită de previzualizare.

**O reducere știe dacă e în lei sau în procente, iar procentul se aplică pe prețul de listă.**
`Discount.type` (E15 S5) e `fixed` sau `percent` — un `50` stocat e cincizeci de lei sau jumătate de
factură, iar numărul singur nu poate spune care. `discountTotal` din `pricing.ts` calculează fiecare
procent din **prețul de listă**, niciodată dintr-un total curent, deci ordinea în care vin reducerile
din bază nu poate schimba factura; două reduceri de 50% duc totalul la zero, nu la un sfert.
Reducerea se rotunjește ea însăși la bani, ca linia tipărită și totalul să se adune pe hârtie.
Plafonul de 100% e în `DiscountService`, nu în DTO: o actualizare poate schimba tipul într-o cerere
și valoarea în alta, iar doar starea de după îmbinare spune ce ajunge stocat.

**Zero e un răspuns, nu un câmp gol.** O lună fără plată se scrie ca factură `waived`, de 0 lei,
fără PDF. Rândul există fiindcă n-are bani în el: fără el, o familie fără factură pe octombrie arată
la fel cu una a cărei lună a uitat-o cineva. `GET /invoices/:id/pdf` răspunde 404 pe ele, explicit.

`apps/web/shared/courses.ts` ține cifrele pentru site și **încă spune „350 lei pe lună"** — adică
prețul unei luni pline, nu regula. Dacă atingi prețul, potrivește-le pe amândouă.

## Infrastructură — stare reală

Frontend-ul e pe **Vercel**, configurat din dashboard — nu există `vercel.json`. Backend-ul **nu e
deployat nicăieri** în acest moment, deci site-ul funcționează efectiv ca prezentare statică.
Ținta stabilită e AWS EC2 cu PM2, Postgres pe aceeași instanță și Caddy pentru TLS; fluxul de
deploy se scrie în [E01](docs/epics/E01-infrastructura-medii.md), S4. Până atunci repo-ul nu
conține niciun workflow de deploy — dacă nu găsești unul, nu s-a pierdut, nu există încă.

`docker-compose.yml` conține exclusiv Postgres. Aplicația rulează direct pe Node, local și în
producție. Nu adăuga servicii de aplicație acolo.

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

`apps/agent` folosește `node --test`, fără jest și fără nicio unealtă proprie — n-are motiv să
capete una. `pnpm --filter agent test` compilează întâi și rulează din `dist`: un `.ts` cu `import`
e interpretat de Node ca modul ES, iar acolo importurile fără extensie nu se rezolvă.

**Bug-urile cunoscute sunt scrise ca `it.failing`**, nu ca teste care cimentează comportamentul
greșit. Un astfel de test trece cât timp bug-ul există și devine roșu în clipa în care e reparat —
moment în care se șterge `.failing`. Convenția și-a făcut deja treaba de două ori: testele de preț
la doi și la trei copii au devenit teste de regresie când bug-ul a fost reparat, iar unul care
cimenta comportamentul greșit — „charges 250 per child for two children" — a fost șters. Vezi
crearea de profiluri fără date de contact pentru un exemplu încă viu.

## Planul de lucru

Epic-urile sunt în [docs/epics/](docs/epics/). Citește
[docs/epics/README.md](docs/epics/README.md) pentru harta dependențelor înainte să începi ceva
mai mare decât un bugfix.
