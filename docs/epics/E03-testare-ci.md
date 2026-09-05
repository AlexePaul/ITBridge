# E03 · Testare și CI

**Status:** livrat · **Pistă:** Fundație · **Depinde de:** E02 · **Blochează:** E05, E15, E18

## Problemă

`pnpm test` pe backend raportează `Test Suites: 18 failed, 18 total, Tests: 0 total`. Toate cele
18 suite eșuează la **încărcare**, nu la aserțiune, cu `Cannot find module 'src/entities/...'`.

Cauza e una singură: 30 din 85 de fișiere importă cu path absolut de la rădăcină
(`from 'src/entities/child.entity'`), care se rezolvă prin `baseUrl` la `nest build`, dar ts-jest
nu folosește `baseUrl`.

Testele care nu pornesc sunt oricum schelet generat: 324 de linii, toate `it('should be defined')`,
cu `Test.createTestingModule({ providers: [InvoiceService] })` fără repository-uri mock-uite — deci
ar eșua și dacă s-ar încărca.

Frontend-ul nu are niciun test și niciun typecheck. Singurul workflow din repo face deploy, nu
verifică nimic.

Consecința: **nu există nicio plasă de siguranță**, în momentul în care
[E15](E15-pricing-facturare.md) urmează să rescrie logica de facturare — adică exact partea din
sistem unde o greșeală se traduce direct în bani ceruți greșit de la părinți.

## Rezultat

Orice PR rulează lint, typecheck și teste, iar un test roșu blochează merge-ul. Logica de business —
calcul de preț, autorizare pe date, generare de facturi — e acoperită de teste care chiar rulează.

## În scop

- Repararea rezolvării de module în jest.
- Teste unitare reale pe servicii, cu repository-uri mock-uite.
- Teste de integrare pe endpoint-uri, cu bază de date efemeră.
- Vitest și typecheck pe frontend.
- Workflow CI care rulează tot pe fiecare PR, cu cache Turborepo.

## În afara scopului

- Teste end-to-end de browser. Merită după [E18](E18-frontend-portal.md), când UI-ul se stabilizează.
- Teste de încărcare — vezi [E06](E06-observabilitate-operare.md).

## Story-uri

### S1 · Fix-ul de rezolvare a modulelor

O linie în configul jest:

```json
"moduleDirectories": ["node_modules", "<rootDir>/.."]
```

**Acceptanță:** toate cele 18 suite se încarcă. Câte trec e altă discuție, dar niciuna nu mai
eșuează la `import`.

**Livrat.** Exact linia din epic. După ea, cele 18 suite se încărcau și eșuau la aserțiune —
`Nest can't resolve dependencies of the InvoiceService (?, ...)` — adică fix ce prezicea S2.

### S2 · Curățarea scheletelor

Testele generate care verifică doar `toBeDefined` fără dependențe mock-uite sunt completate sau
șterse. Un test care nu poate trece nu are ce căuta în repo.

**Acceptanță:** `pnpm test` e verde.

**Livrat.** Toate cele 18 schelete au fost înlocuite cu teste reale, nu completate: serviciile
primesc repository-uri mock-uite dintr-un helper comun (`src/testing/repository.mock.ts`),
controllerele primesc service-ul mock-uit.

288 de teste unitare, verzi.

### S3 · Teste unitare pe logica de business

În ordinea priorității:

1. `invoice.service.calculateAmount` — fiecare ramură, inclusiv cazul cu trei sau mai mulți copii,
   care astăzi întoarce `0` și, după scăderea reducerilor, devine negativ.
2. Tiparul de autorizare pe date din `invoice`, `payment`, `child`, `profile`: un părinte nu vede
   datele altui părinte.
3. `auth.service` — hash, login, refresh, expirare.

**Acceptanță:** peste 80% acoperire pe `invoice`, `payment`, `auth`.

**Livrat, peste prag:**

| Serviciu                | Instrucțiuni | Linii |
| ----------------------- | ------------ | ----- |
| `auth.service.ts`       | 100%         | 100%  |
| `payment.service.ts`    | 93%          | 100%  |
| `invoice.service.ts`    | 91%          | 97%   |
| `attendance.service.ts` | 98%          | 98%   |

Pragurile sunt în `coverageThreshold` din `apps/api/package.json`, **doar pe cele trei module
critice** — nu global, ca să nu împingă la teste inutile pe DTO-uri. `pdf.service` și `s3.service`
sunt excluse din măsurare: sunt adaptoare de I/O către PDFKit și AWS, unde un test unitar ar
verifica mock-ul, nu codul.

Autorizarea pe date e acoperită în toate cele patru locuri cu tiparul din CLAUDE.md — `invoice`,
`payment`, `child`, `profile` — prin `isScopedToUser`, care verifică _ce condiții_ a primit query
builder-ul, fără să execute SQL.

**Bug-uri găsite și documentate, nu cimentate**, conform secțiunii „Riscuri":

- **Calculul de preț la trei sau mai mulți copii** întorcea 0, iar cu reduceri devenea negativ.
  Două teste `it.failing` descriau comportamentul dorit; E15 a reparat regula, iar testele sunt
  acum teste de regresie — exact tranziția pentru care există convenția.
- **`findPayments` adaugă restrângerea pe utilizator de două ori**, deci același
  `leftJoin('parent.user', 'user')` apare dublu. TypeORM refuză un alias duplicat la execuție.

### S4 · Teste de integrare pe API

Aplicația pornește cu o bază Postgres efemeră și se verifică prin HTTP: coduri de status, forma
răspunsului, și mai ales autorizarea — un `PARENT` care cere factura altcuiva primește 403 sau 404,
niciodată date.

Testul de autorizare merită scris ca tabel parametrizat peste toate combinațiile rol-endpoint, ca
să nu fie nevoie de disciplină umană la fiecare endpoint nou.

**Acceptanță:** fiecare controller are cel puțin un test fericit și un test de autorizare.

**Livrat, pe două niveluri.**

**Matricea, la nivel de metadate** (`src/authorization.spec.ts`): enumerează singură toate
handler-ele din toate cele nouă controllere, prin reflecție peste metadatele Nest, și verifică
guard-ele și rolurile. 150 de teste generate. Un endpoint adăugat mâine fără `@UseGuards` apare
aici fără să scrie nimeni un test pentru el — exact ce cerea epicul prin „să nu fie nevoie de
disciplină umană la fiecare endpoint nou". Endpoint-urile publice și scrierile permise părinților
sunt în două liste explicite, deci deschiderea unui endpoint devine o decizie, nu o scăpare.

**Efectul, prin HTTP** (`test/*.e2e-spec.ts`): aplicația reală pe Postgres, cu S3 și PDF
înlocuite. Doi părinți reali, cu facturi și copii reali, iar unul nu vede nimic de-al celuilalt —
nici în listă, nici cerând direct după id, nici cu un filtru explicit pe celălalt părinte.
39 de teste.

Distincția dintre cele două niveluri contează: restrângerea trăiește în service, nu în guard, deci
guard-e corecte nu garantează nimic despre date.

**Postgres ca serviciu, nu Testcontainers** — vezi „Întrebări deschise".

**O capcană care aproape a trecut drept bug de securitate.** Prima versiune a suitei eșua în ~1
rulare din 6, iar simptomul arăta alarmant: `GET /invoices` **fără niciun header de autorizare**
răspundea 200 în loc de 401. Un sondaj separat, cu 300 de cereri neautentificate pe o aplicație
curată, a dat 401 de 300 de ori — deci `AuthGuard` era în regulă.

Cauza era harness-ul: `request(app.getHttpServer())` pe o aplicație Nest care nu ascultă face
supertest să ridice un server efemer **la fiecare apel**. Sub suficientă rotație de porturi, o
cerere ajungea ocazional pe un socket rămas de la un server anterior, care servise o cerere
autentificată. Reparat prin `app.listen(0)` o singură dată per suită, plus `--runInBand`: 12 rulări
consecutive, toate verzi.

Merită reținut, fiindcă un test intermitent care arată ca o breșă de autentificare e exact genul de
lucru care fie declanșează o vânătoare inutilă, fie — mai rău — e catalogat drept „flaky" și
ignorat.

**Bug găsit:** crearea unui al doilea profil fără email și telefon întoarce 409. Verificarea de
unicitate face `findOne({ where: { email: createProfileDto.email } })`, iar când câmpul lipsește
TypeORM elimină condiția nedefinită și interogarea devine „găsește orice profil". Blochează exact
fluxul documentat în CLAUDE.md, în care adminul creează profiluri fără cont și fără date de
contact. Documentat în `test/profile-creation.e2e-spec.ts`, cu reparația lăsată lui E05.

### S5 · Frontend: typecheck și vitest

`nuxt typecheck` trece curat. Vitest cu teste pe `useApi` — logica de refresh pe 401 și
de-duplicarea prin `refreshPromise` sunt subtile și merită acoperite — și pe store-uri.

**Acceptanță:** `pnpm test` și `pnpm typecheck` există și trec în ambele workspace-uri.

**Livrat.** `nuxt typecheck` trece curat — a fost adăugat în E02, odată cu pachetul de tipuri.
Vitest rulează sursa direct, fără să pornească Nuxt: auto-importurile (`ref`, `useCookie`,
`$fetch`, `useRuntimeConfig`) sunt puse la loc în `test/setup.ts`. E un compromis conștient —
`@nuxt/test-utils` ar fi mai fidel, dar mult mai lent, iar ce se testează aici nu are nevoie de un
runtime complet. Când vor fi testate componente, îl va cere.

18 teste. Cel mai valoros e cel de de-duplicare: zece cereri concurente care primesc 401 declanșează
**un singur** refresh. Fără `refreshPromise`, ultimele nouă ar folosi un refresh token deja rotit.
Store-urile sunt testate cu id-uri și numerice, și string — o trecere de la `==` la `===` ar rupe
navigarea pe rută fără niciun alt semnal.

### S6 · Workflow CI

`.github/workflows/ci.yml` rulează pe fiecare pull request: install, lint, typecheck, test, build,
prin Turborepo, cu cache. Branch protection pe `main` cere CI verde.

**Acceptanță:** un PR cu un test stricat nu poate fi merge-uit. CI pe o schimbare doar de frontend
nu reface build-ul de backend.

**Livrat parțial.** `.github/workflows/ci.yml` are două joburi: `verify` — install, lint,
typecheck, test, build, cu cache Turborepo restaurat din `actions/cache` — și `e2e`, cu Postgres ca
serviciu. Sunt exact comenzile pe care le rulează un dezvoltator local.

**Ce lipsește:** branch protection pe `main`, cu `verify` și `e2e` ca verificări obligatorii. Se
activează din Settings → Branches, nu din repo. Până atunci CI raportează, dar nu blochează.

## Dependențe

[E02](E02-monorepo-tooling.md), pentru ca CI să folosească aceleași comenzi ca dezvoltatorul.

## Riscuri

**Testele scrise peste logica actuală de facturare o cimentează.** `calculateAmount` are un bug
cunoscut la trei copii. Testul trebuie să descrie comportamentul _dorit_, marcat explicit ca
eșuând, nu pe cel actual.

## Definition of done

CI verde obligatoriu pe `main`. Peste 80% acoperire pe modulele de bani și autorizare. Niciun test
dezactivat fără comentariu care explică de ce și până când.

## Întrebări deschise

Ambele au primit răspuns.

**Testcontainers sau serviciu Postgres?** Serviciu. Argumentul de fidelitate nu se susține aici:
e aceeași imagine `postgres:17-alpine` ca în `docker-compose.yml`, doar pornită de runner în loc
de o bibliotecă. Testcontainers ar fi adăugat un strat de orchestrare fără să schimbe ce se
testează. Local, testele merg pe Postgres din `docker compose`.

**Prag global sau pe module critice?** Pe module critice, cum recomanda epicul. Pragurile sunt
în `coverageThreshold`, pe `invoice.service.ts`, `payment.service.ts` și `auth.service.ts`.

## Datoria de tipuri, plătită în loc de amânată

Prima formă a acestui epic trecea familia eslint `no-unsafe-*` de la `error` la `warn`, ca `pnpm
lint` să nu fie roșu din prima zi. Compromisul a picat: s-a dovedit că datoria era concentrată, nu
răspândită, deci se putea plăti direct.

| Sursă                 | Avertismente | Cauză                                                                |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| `pdf.service.ts`      | 129          | `pdfkit` fără tipuri, plus `invoice: any` și metode private netipate |
| controllere           | ~59          | `@Request() req` netipat, deci `req.user.role` era acces pe `any`    |
| `discount.service.ts` | 22           | repository-ul injectat n-avea deloc tip                              |
| restul                | ~59          | cast-uri `as any` izolate, plus teste                                |

Reparațiile: `@types/pdfkit`, un tip `AuthenticatedRequest` cu payload-ul JWT, tipuri pe
repository-uri și DTO-uri, și eliminarea cast-urilor `as any` din servicii.

Regulile sunt acum pe **`error` în codul de producție**, oprite doar în fișierele de test — unde
`res.body` din supertest și valorile mock-urilor jest sunt `any` prin construcție, iar verificarea
lor e chiar scopul testului.

**Două bug-uri au ieșit la iveală din tipare**, nu din teste: `Profile.user` și `Child.group` erau
tipate ca nenule deși schema le are nullable, iar verificările de proprietate făceau
`child.parent.user.id`. Pentru un copil al unui profil fără cont atașat — fluxul de admin din
CLAUDE.md — asta arunca TypeError în loc să răspundă 403. Corectat cu `?.`.

Separat, cele 44 de variabile nefolosite erau importuri moarte și au fost șterse. Ce rămâne
nefolosit intenționat poartă prefixul `_`.
