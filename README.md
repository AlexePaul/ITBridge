# ITBridge School

Platformă de management pentru o școală de IT pentru copii: părinții își fac cont, înregistrează
copiii, copiii intră în grupe, se marchează prezența, iar lunar se emit facturi și se înregistrează
plățile. Interfața e în română.

Pentru context de arhitectură și capcane, vezi [CLAUDE.md](CLAUDE.md). Pentru planul de lucru,
[docs/epics/](docs/epics/).

## Structură

Monorepo pnpm, orchestrat cu Turborepo.

| Workspace                        | Ce e                                           | Port local | Producție                                                                |
| -------------------------------- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| [apps/api](apps/api)             | NestJS 11, TypeORM, JWT, PDFKit, S3, sharp     | 3000       | nedeployat încă — vezi [E01](docs/epics/E01-infrastructura-medii.md), S4 |
| [apps/web](apps/web)             | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind            | 3001       | Vercel                                                                   |
| [apps/agent](apps/agent)         | Agentul de încărcare: Node 22, fără dependențe | —          | un calculator Windows din biroul școlii                                  |
| [packages/types](packages/types) | Contractul API partajat de cele trei           | —          | —                                                                        |
| Postgres 17                      | `docker-compose.yml`                           | 5432       | pe instanța de backend                                                   |

**Aplicația nu rulează în Docker.** Nici local, nici în producție. Docker e folosit exclusiv
pentru infrastructura locală, adică Postgres.

## Cerințe

- Node.js 22 sau mai nou — versiunea fixată e în [.nvmrc](.nvmrc), `nvm use` o alege
- pnpm 10 sau mai nou: `corepack enable && corepack prepare pnpm@10.33.2 --activate`
- Docker, doar pentru Postgres

## Pornire

```bash
cp .env.example .env                  # completează secretele JWT
pnpm install
docker compose up -d                  # Postgres + MinIO
pnpm --filter api migration:run       # creează schema
pnpm seed                             # date de dezvoltare (opțional, dar recomandat)
pnpm dev
```

După seed, intri cu utilizatorul `admin` și parola `parola123`.

Atât. `pnpm dev` pornește ambele aplicații cu hot reload, încarcă `.env` de la rădăcină și le
transmite variabilele — nu mai e nevoie de nimic pe linia de comandă. API pe
`http://localhost:3000`, web pe `http://localhost:3001`, Swagger UI la `http://localhost:3000/api`.

## Comenzi

Toate se rulează de la rădăcină și trec prin Turborepo, care sare task-urile pentru care nu s-a
schimbat nimic.

| Comandă                         | Ce face                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                      | pornește api + web, cu hot reload                                     |
| `pnpm dev:api` / `pnpm dev:web` | doar una dintre ele                                                   |
| `pnpm build`                    | construiește tot, în ordinea dependențelor                            |
| `pnpm typecheck`                | verifică tipurile în toate workspace-urile                            |
| `pnpm lint`                     | verifică, nu modifică; pentru corectare, `pnpm --filter api lint:fix` |
| `pnpm test`                     | jest pe api                                                           |
| `pnpm format`                   | prettier peste tot repo-ul                                            |

Pentru o comandă dintr-un singur workspace: `pnpm --filter api <script>`.

## Configurare

Un singur `.env`, la rădăcină, copiat din [.env.example](.env.example) — comentat variabilă cu
variabilă. Un `apps/api/.env` continuă să fie citit dacă există, pentru secrete pe care nu le vrei
la rădăcină.

Două lucruri care surprind:

- **`AWS_REGION` e obligatorie ca api să pornească.** `S3Service.onModuleInit` aruncă fără ea, chiar
  dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe lanțul
  implicit de credențiale, adică IAM instance role în producție.
- **`API_BASE`, nu `NUXT_PUBLIC_API_BASE`.** `apps/web/nuxt.config.ts` mapează
  `runtimeConfig.public.apiBase` pe `process.env.API_BASE`.

**O variabilă nouă trebuie declarată în [turbo.json](turbo.json), la `globalEnv`.** Turbo rulează
în mod `strict` pentru mediu: un task vede doar ce e declarat acolo. E o alegere bună — face
cache-ul corect — dar o variabilă nedeclarată pur și simplu lipsește, fără niciun mesaj.

## Contractul API

[packages/types](packages/types) descrie formatul de pe sârmă — JSON-ul care traversează rețeaua,
nu entitățile TypeORM. E consumat de ambele părți:

- `apps/web` importă din el, prin punțile din `app/types/`
- `apps/api` îl verifică la nivel de tip în [src/contract.ts](apps/api/src/contract.ts)

Deci o schimbare de câmp rupe `pnpm typecheck` în ambele direcții: dacă modifici contractul fără
frontend-ul, cade `web`; dacă modifici entitatea fără contractul, cade `api`.

## Deploy

**Frontend, pe Vercel.** Configurat din dashboard, nu din repo.

| Setare           | Valoare                          |
| ---------------- | -------------------------------- |
| Root Directory   | `apps/web`                       |
| Framework Preset | Nuxt.js                          |
| Install Command  | `pnpm install --frozen-lockfile` |
| Build Command    | implicit (`nuxt build`)          |

> **La merge-ul acestui monorepo, Root Directory trebuie schimbat din `it-bridge-frontend` în
> `apps/web`, în același timp.** Altfel deploy-ul de producție cade. Vercel detectează singur pnpm
> din `packages.json` plus `pnpm-lock.yaml` de la rădăcină.

Variabilele de mediu, toate în `turbo.json` la `globalEnv`:

| Variabilă        | Unde                 | De ce                                                                                                                                                                                                                                                               |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_BASE`       | Production + Preview | URL-ul public al backend-ului. Explicit și pe Preview, altfel deploy-urile de preview lovesc propriul origin.                                                                                                                                                       |
| `RESEND_API_KEY` | Production + Preview | Cheia de trimitere a formularului de contact. Variabilă de server, nu de build. Fără ea, formularul răspunde 503 și trimite cititorul către adresa de email.                                                                                                        |
| `CONTACT_FROM`   | opțional             | Expeditorul. Domeniul lui trebuie verificat în Resend, altfel fiecare trimitere pică cu 403. Nesetată, se folosește `contact@itbridgeschool.com`.                                                                                                                   |
| `SITE_URL`       | **nesetată**         | Domeniul din care se construiesc canonical, `og:url`, `sitemap.xml`, `robots.txt` și `@id`-urile din JSON-LD. Nesetată, `nuxt.config.ts` cade pe domeniul real. O valoare de localhost aici scoate tot site-ul din index. Se setează doar dacă se schimbă domeniul. |

**Backend.** Nu e deployat nicăieri în acest moment. Ținta e AWS EC2 cu PM2, Postgres pe aceeași
instanță și Caddy pentru TLS; se face în [E01](docs/epics/E01-infrastructura-medii.md), S4.

Consecința pentru site: **partea publică funcționează întreagă și fără backend.** Cele șapte pagini
publice, formularul de contact (care merge prin Resend, dintr-o rută Nitro de pe Vercel), `robots.txt`,
`sitemap.xml`, `llms.txt` și datele structurate nu ating `API_BASE`. Ce depinde de backend e tot ce
vine după autentificare — portalul părintelui și zona de admin — și acelea rămân neconectate până
la S4 din E01. Vezi „Stare cunoscută” mai jos.

## Schema bazei de date

Schema evoluează **exclusiv prin migrări**, în `apps/api/src/migrations/`. `synchronize` e oprit:
TypeORM nu mai alterează nimic singur la pornire.

Fluxul când schimbi o entitate:

```bash
pnpm --filter api migration:generate src/migrations/AddSomething
pnpm --filter api migration:run
```

Migrarea generată se citește înainte de commit — `migration:generate` produce SQL, nu intenții, iar
o redenumire de coloană îi apare ca `DROP` plus `ADD`. Dacă asta ar pierde date, se rescrie de mână.

> **O entitate schimbată fără migrare nu mai rupe nimic la pornire — rupe la prima interogare, în
> producție.** De aceea CI rulează `check:schema`: construiește o bază de unică folosință din
> migrări și întreabă TypeORM dacă ar mai avea ceva de schimbat. Dacă da, PR-ul cade și îți spune
> exact ce comandă să rulezi.

`pnpm seed` reconstruiește o bază locală plauzibilă: un admin, șase grupe pe tot programul
săptămânal, unsprezece părinți (unii fără cont, ca fluxul de legare ulterioară să fie vizibil),
paisprezece copii (inclusiv o familie cu trei, ca bug-ul de preț să fie reproductibil de mână),
prezențe pe două luni în urmă și facturi în toate stările. Șterge tot înainte, deci e idempotent.

### Seed pe staging

Aceeași comandă poate popula și baza de staging, ca ecranele să aibă ce arăta la testare:

```bash
cp .env.stage.example .env.stage   # completează-l; e gitignorat
pnpm seed:stage
```

Nu e aceeași treabă ca seed-ul local, și seed-ul refuză să se poarte ca și cum ar fi. Două
condiții, amândouă refuzuri, nu avertismente:

- **`SEED_ALLOW_NON_LOCAL` numește baza de date**, nu spune „da". Un `=1` ar rămâne în fișierul de
  mediu al staging-ului pentru totdeauna, iar de acolo încolo autorizează orice scrie `DB_NAME` luna
  viitoare — inclusiv o bază de producție nimerită dintr-o greșeală de tastare.
- **`SEED_PASSWORD` e obligatorie.** Local, parola e `parola123`, scrisă în repo și în README-ul
  ăsta; pe un host la care ajunge oricine știe numele, aia e un cont de admin publicat. Nu există
  implicit, iar seed-ul **nu o afișează înapoi** — ar ajunge în logul care a capturat rularea.

Și o a treia, care te apără de tine: `pnpm seed:stage` **refuză o bază locală**. `dotenv -e
.env.stage` nu dă eroare când fișierul lipsește — încarcă nimic —, iar aplicația cade atunci pe
`localhost`, deci comanda ți-ar șterge baza de dezvoltare în timp ce te uiți la staging să se umple.
Dacă vezi refuzul ăsta, `.env.stage` lipsește sau e pe jumătate completat.

Restul e la fel: șterge tot înainte, deci nu e aditiv și nu se poate anula — ce a tastat cineva în
staging dispare. Fără S3 configurat, facturile rămân fără PDF și atât; seed-ul spune ce a sărit.

## Testare

| Nivel                  | Unde                                 | Ce verifică                                                                          |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Unitare                | `apps/api/src/**/*.spec.ts`          | logica de business și forma interogărilor de autorizare, cu repository-uri mock-uite |
| Matricea de autorizare | `apps/api/src/authorization.spec.ts` | guard-ele și rolurile fiecărui handler, enumerate automat din metadate               |
| Integrare              | `apps/api/test/*.e2e-spec.ts`        | aplicația reală pe Postgres: doi părinți, iar unul nu vede datele celuilalt          |
| Frontend               | `apps/web/test/*.spec.ts`            | `useApi` (refresh pe 401, de-duplicare) și store-urile                               |
| Agent                  | `apps/agent/src/*.test.ts`           | regulile de nume de folder și citirea unui link dintr-un fișier, cu `node --test`    |

Testele de integrare au nevoie de Postgres pornit. Își creează singure baza `itbridge_test`.

```bash
docker compose up -d
pnpm test:e2e
```

CI rulează pe fiecare PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)): lint, typecheck,
teste unitare și build într-un job, integrarea într-altul, cu Postgres ca serviciu. Sunt exact
comenzile de mai sus — dacă CI-ul și localul diverg, CI devine un al doilea sistem de verificat,
nu o plasă de siguranță.

> Ca un test roșu să chiar blocheze un merge, `release/prod` are nevoie de **branch protection** cu
> verificările `verify` și `e2e` obligatorii. Se activează din Settings → Branches; nu se poate
> configura din repo.

## Stare cunoscută

**Frontend-ul e livrat pe jumătate, și jumătatea contează.** Partea publică — design, cele șapte
pagini, fotografiile, SEO și datele structurate — e făcută și poate sta în producție așa cum e
([E18](docs/epics/E18-frontend-portal.md) S1 și S3, [E19](docs/epics/E19-seo-geo.md) S1, S2, S3 și
S7). Ce **nu** e făcut, și e explicit muncă viitoare:

- **Cablarea la backend.** Nimic din ce e după login nu vorbește cu un API care rulează, fiindcă
  backend-ul nu e deployat. Paginile există și compilează; datele nu vin de nicăieri.
- **Zona de admin.** Ecranele n-au fost rescrise pe noul sistem de design; jumătatea de componente
  a lui E18 S5 e făcută, iar din migrarea propriu-zisă (S5b) e făcută prima felie — meniul grupat și
  trei ecrane. Restul rămâne.
- **Verificarea de accesibilitate a zonei autentificate** — E18 S6. CI-ul rulează axe-core pe
  paginile publice, în ambele teme; ce e după login a fost verificat doar manual.

**Portalul părintelui a fost rescris** pe sistemul de design (E18 S4): cinci ecrane plus cele trei de
intrare în cont, pe un layout propriu, cu comutatorul de copil care se păstrează între pagini. Dar
n-a fost văzut niciodată pe date reale, din același motiv ca mai sus — deci ordinea firească rămâne
[E01](docs/epics/E01-infrastructura-medii.md) S4 (instanța și deploy-ul) înainte de orice altceva din
zona autentificată.

Niciun `it.failing` nu mai e viu în repo: bug-urile de preț pe care le documentau sunt reparate și
testele au devenit teste de regresie. Regula, și sursa de adevăr pentru orice discuție despre
prețuri: **350 de lei pentru primul copil și 250 pentru fiecare frate** — deci 600 la doi copii,
cât scrie și pe site. Unitatea reală e **ședința**, 87,50 și 62,50, deci o lună de patru ședințe
dă exact cifrele pe care le știe toată lumea, iar una cu vacanță costă mai puțin. Într-un singur
loc: `apps/api/src/modules/invoice/pricing.ts`.

Bug-ul de 409 la al doilea profil fără date de contact a fost reparat în
[E04](docs/epics/E04-migrari-date.md), iar testul lui e acum unul obișnuit, de regresie.

**Ce nu acoperă revocarea de sesiuni:** `logout` și `logout-all` invalidează refresh tokenul
imediat, dar un access token deja emis rămâne valid până la 15 minute, fiindcă `AuthGuard` verifică
doar semnătura. E un compromis deliberat — vezi „Capcane” în [CLAUDE.md](CLAUDE.md).

`pnpm lint` e curat: zero erori, zero avertismente. Familia `no-unsafe-*` e pe `error` în codul de
producție și oprită doar în fișierele de test, unde `res.body` din supertest și valorile mock-urilor
jest sunt `any` prin construcție.
