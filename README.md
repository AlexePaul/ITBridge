# ITBridge School

Platformă de management pentru o școală de IT pentru copii: părinții își fac cont, înregistrează
copiii, copiii intră în grupe, se marchează prezența, iar lunar se emit facturi și se înregistrează
plățile. Interfața e în română.

Pentru context de arhitectură și capcane, vezi [CLAUDE.md](CLAUDE.md). Pentru planul de lucru,
[docs/epics/](docs/epics/).

## Structură

Monorepo pnpm, orchestrat cu Turborepo.

| Workspace                        | Ce e                                 | Port local | Producție                                                                |
| -------------------------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------ |
| [apps/api](apps/api)             | NestJS 11, TypeORM, JWT, PDFKit, S3  | 3000       | nedeployat încă — vezi [E01](docs/epics/E01-infrastructura-medii.md), S4 |
| [apps/web](apps/web)             | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind  | 3001       | Vercel                                                                   |
| [packages/types](packages/types) | Contractul API partajat de cele două | —          | —                                                                        |
| Postgres 17                      | `docker-compose.yml`                 | 5432       | pe instanța de backend                                                   |

**Aplicația nu rulează în Docker.** Nici local, nici în producție. Docker e folosit exclusiv
pentru infrastructura locală, adică Postgres.

## Cerințe

- Node.js 22 sau mai nou — versiunea fixată e în [.nvmrc](.nvmrc), `nvm use` o alege
- pnpm 10 sau mai nou: `corepack enable && corepack prepare pnpm@10.33.2 --activate`
- Docker, doar pentru Postgres

## Pornire

```bash
cp .env.example .env    # completează secretele JWT
pnpm install
docker compose up -d
pnpm dev
```

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

| Setare             | Valoare                                                      |
| ------------------ | ------------------------------------------------------------ |
| Root Directory     | `apps/web`                                                   |
| Framework Preset   | Nuxt.js                                                      |
| Install Command    | `pnpm install --frozen-lockfile`                             |
| Build Command      | implicit (`nuxt build`)                                      |
| Variabile de mediu | `API_BASE` = URL-ul public al backend-ului, pe toate mediile |

> **La merge-ul acestui monorepo, Root Directory trebuie schimbat din `it-bridge-frontend` în
> `apps/web`, în același timp.** Altfel deploy-ul de producție cade. Vercel detectează singur pnpm
> din `packages.json` plus `pnpm-lock.yaml` de la rădăcină.

`API_BASE` trebuie setată explicit și pentru Preview — altfel deploy-urile de preview lovesc
propriul origin.

**Backend.** Nu e deployat nicăieri în acest moment. Ținta e AWS EC2 cu PM2, Postgres pe aceeași
instanță și Caddy pentru TLS; se face în [E01](docs/epics/E01-infrastructura-medii.md), S4.

## Testare

| Nivel                  | Unde                                 | Ce verifică                                                                          |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Unitare                | `apps/api/src/**/*.spec.ts`          | logica de business și forma interogărilor de autorizare, cu repository-uri mock-uite |
| Matricea de autorizare | `apps/api/src/authorization.spec.ts` | guard-ele și rolurile fiecărui handler, enumerate automat din metadate               |
| Integrare              | `apps/api/test/*.e2e-spec.ts`        | aplicația reală pe Postgres: doi părinți, iar unul nu vede datele celuilalt          |
| Frontend               | `apps/web/test/*.spec.ts`            | `useApi` (refresh pe 401, de-duplicare) și store-urile                               |

Testele de integrare au nevoie de Postgres pornit. Își creează singure baza `itbridge_test`.

```bash
docker compose up -d
pnpm test:e2e
```

CI rulează pe fiecare PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)): lint, typecheck,
teste unitare și build într-un job, integrarea într-altul, cu Postgres ca serviciu. Sunt exact
comenzile de mai sus — dacă CI-ul și localul diverg, CI devine un al doilea sistem de verificat,
nu o plasă de siguranță.

> Ca un test roșu să chiar blocheze un merge, `main` are nevoie de **branch protection** cu
> verificările `verify` și `e2e` obligatorii. Se activează din Settings → Branches; nu se poate
> configura din repo.

## Stare cunoscută

Două bug-uri sunt documentate ca teste `it.failing` — trec cât timp bug-ul există, devin roșii când
e reparat. Reparațiile țin de [E05](docs/epics/E05-robustete-backend.md) și
[E15](docs/epics/E15-pricing-facturare.md):

- **Calculul de preț nu are ramură pentru trei sau mai mulți copii**, deci suma iese 0, iar
  reducerile o duc pe negativ.
- **Un al doilea profil fără email și telefon primește 409.** Verificarea de unicitate face
  `findOne({ where: { email: undefined } })`, iar TypeORM elimină condiția nedefinită — interogarea
  devine „găsește orice profil". Blochează fluxul în care adminul creează profiluri fără date de
  contact.

Familia `no-unsafe-*` din eslint e pe `warn`: ~270 de avertismente pe `api`, `any` care circulă
prin servicii. La `error` ar face `pnpm lint` roșu din prima zi și inutil ca poartă de CI.
