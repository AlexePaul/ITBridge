# CLAUDE.md

Ghid pentru agenți care lucrează în acest repo. Vezi și [README.md](README.md) pentru quick start.

## Ce este

ITBridge School — platformă de management pentru o școală de IT pentru copii (interfață în română).
Părinții își fac cont, înregistrează copiii, copiii intră în grupe, se marchează prezența, iar
lunar se emit facturi (PDF în S3) și se înregistrează plățile.

Monorepo pnpm, orchestrat cu Turborepo, plus Postgres ca infrastructură locală:

| Workspace            | Stack                                                          | Port       |
| -------------------- | -------------------------------------------------------------- | ---------- |
| `apps/api/`          | NestJS 11, TypeORM, JWT, PDFKit, AWS S3                        | 3000       |
| `apps/web/`          | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind                            | 3001       |
| `packages/types/`    | contractul API partajat, `@itbridge/types`                     | —          |
| `docker-compose.yml` | Postgres 17 + MinIO — singurele lucruri care rulează în Docker | 5432, 9000 |

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

**Backend** — cincisprezece module în `apps/api/src/modules/`, treisprezece după același tipar
`controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `location`, `room`,
`group`, `enrollment`, `class-session`, `attendance`, `invoice`, `payment`, `discount`. Celelalte două ies din
tipar: `mail` n-are controller, fiindcă nimic din el nu e expus pe HTTP, iar `health` n-are decât
atât. Entitățile stau centralizat în `apps/api/src/entities/` și sunt expuse tuturor modulelor prin
`EntitiesModule` (un singur `TypeOrmModule.forFeature` reexportat), deci un modul nou importă
`EntitiesModule`, nu entitățile individual.

**Model de date** — `User` (credențiale) și `Profile` (date de contact) sunt separate
intenționat: un admin poate crea un `Profile` fără cont, iar `GET /users/without-profile`
servește fluxul de legare ulterioară. `Profile` e "părintele" în tot restul modelului.

```
User ─1:1─ Profile ─1:N─ Child ─N:1─ Group ─N:1─ Room ─N:1─ Location
                    │      ├─1:N─ Enrollment ─N:1─ Group
                    │      ├─1:N─ WaitlistEntry ─N:1─ Group
                    │      └─1:N─ Attendance ─N:1─ ClassSession ─N:1─ Group
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
pe `(group, date)`. Nu există calendar de vacanțe — E12 S2 nu e construit — deci se generează
ședințe și în vacanță, iar cele căzute acolo se anulează manual. Numele are prefix fiindcă
`Session` e deja luat de tabelul de refresh tokenuri.

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
(`apps/api/src/modules/invoice/s3.service.ts:28`) aruncă fără ea, deci backend-ul cade la
boot, chiar dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe
lanțul implicit de credențiale, adică IAM instance role în producție. Mesajul de eroare cere trei
variabile, dar verifică una singură.

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

**Job-urile cu cron sunt oprite sub `NODE_ENV=test`, prin `disabled` pe decorator.** Jest setează
variabila singur, iar ambele suite construiesc `AppModule`-ul real: o rulare care prinde exact
secunda de declanșare ar scrie un rând în `outbox` în mijlocul aserțiunilor altcuiva, o dată pe an
și niciodată reproductibil. Consecința pentru tine: **un `@Cron` nu se declanșează în teste**, deci
logica de selecție se scrie ca metodă publică, iar cron-ul doar o cheamă — vezi
`apps/api/src/modules/class-session/unmarked-attendance.job.ts`, care își face treaba în
`reportFor(date)`. Testele cheamă metoda; ce testează cron-ul e ora, și aia nu se testează.

**Mementoul zilnic de prezență pleacă la 10:00 pe fusul școlii, nu al serverului.** `@Cron` primește
`timeZone: 'Europe/Bucharest'`, iar ziua raportată se calculează prin `Intl` pe același fus — altfel
un server în alt fus ar întreba de altă zi decât cea care tocmai s-a încheiat la școală, și ar
raporta liniște. Adresa e `MAIL_OFFICE_ADDRESS`, opțională, cu `office@itbridgeschool.com` ca
implicit; e prinsă deja de wildcard-ul `MAIL_*` din `turbo.json`, deci nu-i trebuie linie proprie.
Mesajul pleacă doar dacă există ședințe nemarcate, și e unul singur pe zi: `dedupeKey`-ul e
`unmarked-attendance:<zi>`, deci o repornire la 10:05 nu trimite a doua oară.

**Scheduler-ul trebuie să ruleze într-o singură instanță.** `FOR UPDATE SKIP LOCKED` face două
treceri simultane inofensive una față de alta, dar doi worker-i PM2 s-ar trezi amândoi la fiecare
tick. Fixarea se face în fișierul de ecosistem din E01 S4, care nu există încă.

**Orizontul de opt săptămâni nu se rulează singur.** Ședințele se scriu doar la cerere, prin
`POST /class-sessions/generate` (admin); nu există niciun job care să le scrie. Tot ce e programat
în backend sunt trei lucruri, și niciunul nu generează orar: dispecerul de outbox (`@Interval`),
mementoul de la 10:00 (`@Cron`) și purjarea sesiunilor, care stă în continuare pe un `setInterval`
propriu în `apps/api/src/modules/auth/session.service.ts`. Iar prezența se marchează pe
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

**Regula de preț stă într-un singur loc: `apps/api/src/modules/invoice/pricing.ts`.** 350 pentru
primul copil, 250 pentru fiecare frate — deci 600 la doi, 850 la trei. Era scrisă de două ori, în
serviciu și în seed, iar ambele copii aveau aceleași două bug-uri: doi copii se facturau cu 500, iar
la trei sau mai mulți `totalAmount` rămânea 0 și reducerile îl duceau pe negativ. Dacă se schimbă
prețul, se schimbă acolo; `apps/web/shared/courses.ts` ține aceleași cifre pentru site și trebuie
potrivit odată cu el. Modelul pe module — 700, −25% de la al doilea copil — e altceva și e tot în
[E15](docs/epics/E15-pricing-facturare.md).

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
