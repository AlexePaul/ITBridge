# ITBridge School

Platformă de management pentru o școală de IT pentru copii: părinții își fac cont, înregistrează
copiii, copiii intră în grupe, se marchează prezența, iar lunar se emit facturi și se înregistrează
plățile. Interfața e în română.

Pentru context de arhitectură și capcane, vezi [CLAUDE.md](CLAUDE.md). Pentru planul de lucru,
[docs/epics/](docs/epics/).

## Ce rulează unde

| Componentă | Stack | Port local | Producție |
|---|---|---|---|
| [it-bridge-backend](it-bridge-backend) | NestJS 11, TypeORM, JWT, PDFKit, S3 | 3000 | nedeployat încă — vezi [E01](docs/epics/E01-infrastructura-medii.md), S4 |
| [it-bridge-frontend](it-bridge-frontend) | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind | 3001 | Vercel |
| Postgres 17 | `docker-compose.yml` | 5432 | pe instanța de backend |

**Aplicația nu rulează în Docker.** Nici local, nici în producție. Docker e folosit exclusiv
pentru infrastructura locală, adică Postgres. Backend-ul și frontend-ul se pornesc direct pe Node,
ca să existe hot reload real, debugger atașabil și `node_modules` pe disc, nu într-un volum anonim.

## Cerințe

- Node.js 22 sau mai nou (backend-ul folosește `process.loadEnvFile`, disponibil din 20.12)
- Docker, doar pentru Postgres

## Pornire

```bash
# 1. Postgres
docker compose up -d

# 2. Backend
cd it-bridge-backend
cp .env.example .env      # completează secretele JWT
npm ci
npm run start:dev         # http://localhost:3000, Swagger UI la /api

# 3. Frontend, în alt terminal
cd it-bridge-frontend
cp .env.example .env
npm install
npm run dev -- --port 3001   # http://localhost:3001
```

Postgres are healthcheck; `docker compose ps` arată `healthy` când e gata de conexiuni. Volumul
`postgres_data` persistă între reporniri — `docker compose down -v` îl șterge.

## Configurare

Fiecare componentă are propriul `.env.example`, versionat și comentat. `.env` nu se comite.

**Backend** — [it-bridge-backend/.env.example](it-bridge-backend/.env.example). De reținut:

- `AWS_REGION` e **obligatorie**: fără ea aplicația nu pornește deloc, fiindcă `S3Service` o cere
  la `onModuleInit`. Cheile `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` sunt opționale — dacă
  lipsesc, SDK-ul cade pe lanțul implicit de credențiale, ceea ce în producție înseamnă IAM
  instance role (vezi [E07](docs/epics/E07-securitate-gdpr.md), S6).
- `CORS_ORIGINS` e o listă separată prin virgulă. Fără ea, backend-ul acceptă
  `https://itbridgeschool.com` și `http://localhost:3001`.
- `JWT_ACCESS_TOKEN_SECRET` și `JWT_REFRESH_TOKEN_SECRET` au valori implicite previzibile dacă
  lipsesc, fără avertisment. Setează-le local, nu doar în producție.
- Backend-ul citește `.env` din directorul din care e pornit, prin
  [src/load-env.ts](it-bridge-backend/src/load-env.ts). În producție variabilele vin din mediu.

**Frontend** — [it-bridge-frontend/.env.example](it-bridge-frontend/.env.example). O singură
variabilă contează:

- `API_BASE` — URL-ul complet al backend-ului. Numele e `API_BASE`, **nu** `NUXT_PUBLIC_API_BASE`;
  [nuxt.config.ts](it-bridge-frontend/nuxt.config.ts) mapează `runtimeConfig.public.apiBase` pe
  `process.env.API_BASE`. Fără ea, `apiBase` e `undefined` și cererile pleacă spre origin-ul Nuxt.

## Deploy

**Frontend, pe Vercel.** Configurat din dashboard, nu din repo — nu există `vercel.json`.

| Setare | Valoare |
|---|---|
| Root Directory | `it-bridge-frontend` |
| Framework Preset | Nuxt.js |
| Build Command | implicit (`nuxt build`) |
| Install Command | implicit (`npm install`) |
| Output Directory | implicit (`.output/public`) |
| Variabile de mediu | `API_BASE` = URL-ul public al backend-ului, pe toate mediile |

`API_BASE` trebuie setată explicit în Vercel, inclusiv pentru Preview — altfel deploy-urile de
preview lovesc propriul origin. Dacă backend-ul are un domeniu diferit de cel de producție pentru
preview, adaugă-l în `CORS_ORIGINS` pe backend.

**Backend.** Nu e deployat nicăieri în acest moment, deci site-ul funcționează ca prezentare
statică. Ținta stabilită este AWS EC2 cu PM2, Postgres pe aceeași instanță și Caddy pentru TLS.
Fluxul de deploy și fișierul de ecosistem PM2 se fac în [E01](docs/epics/E01-infrastructura-medii.md),
S4; până atunci repo-ul nu conține niciun workflow de deploy.

## Documentația API

Swagger UI la `http://localhost:3000/api`. La fiecare boot, `it-bridge-backend/src/main.ts` scrie
schema în `swagger.json`, relativ la directorul din care rulează procesul — deci în rădăcina
backend-ului, nu în `src/`. Fișierul e în `.gitignore`, deci nu există într-o clonă proaspătă;
apare după prima pornire.

## Teste

`npm test` în backend nu rulează încă — toate suitele eșuează la încărcare. Cauza și fix-ul de o
linie sunt în [CLAUDE.md](CLAUDE.md), secțiunea „Capcane"; se rezolvă în
[E03](docs/epics/E03-testare-ci.md).
