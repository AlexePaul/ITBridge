# CLAUDE.md

Ghid pentru agenți care lucrează în acest repo. Vezi și [README.md](README.md) pentru quick start.

## Ce este

ITBridge School — platformă de management pentru o școală de IT pentru copii (interfață în română).
Părinții își fac cont, înregistrează copiii, copiii intră în grupe, se marchează prezența, iar
lunar se emit facturi (PDF în S3) și se înregistrează plățile.

Monorepo cu două piese, plus Postgres ca infrastructură locală:

| Director | Stack | Port |
|---|---|---|
| `it-bridge-backend/` | NestJS 11, TypeORM, JWT, PDFKit, AWS S3 | 3000 |
| `it-bridge-frontend/` | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind | 3001 |
| `docker-compose.yml` | Postgres 17 — singurul lucru care rulează în Docker | 5432 |

## Comenzi

```bash
# Postgres — atât rulează în Docker, aplicația nu
docker compose up -d

# backend
cd it-bridge-backend && cp .env.example .env && npm ci
npm run start:dev     # nest build && nest start --watch
npm run lint          # eslint --fix
npm test              # jest — vezi "Capcane" mai jos

# frontend
cd it-bridge-frontend && cp .env.example .env && npm install
npm run dev -- --port 3001
```

Aplicația **nu** rulează în Docker, nici local nici în producție. Backend-ul își citește `.env`
prin `it-bridge-backend/src/load-env.ts`, importat înaintea oricărui modul care atinge
`process.env` la încărcare — dacă adaugi un import nou în `main.ts`, lasă-l pe ăsta primul.

Swagger UI: `http://localhost:3000/api`. La fiecare boot, `it-bridge-backend/src/main.ts` scrie
schema în `./swagger.json`, relativ la directorul din care rulează procesul. Fișierul e în
`.gitignore`, deci nu există într-o clonă proaspătă — apare doar după prima pornire.

## Arhitectură

**Backend** — nouă module feature în `it-bridge-backend/src/modules/`, toate după același tipar
`controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `group`,
`attendance`, `invoice`, `payment`, `discount`. Entitățile stau centralizat în `it-bridge-backend/src/entities/`
și sunt expuse tuturor modulelor prin `EntitiesModule` (un singur `TypeOrmModule.forFeature`
reexportat), deci un modul nou importă `EntitiesModule`, nu entitățile individual.

**Model de date** — `User` (credențiale) și `Profile` (date de contact) sunt separate
intenționat: un admin poate crea un `Profile` fără cont, iar `GET /users/without-profile`
servește fluxul de legare ulterioară. `Profile` e "părintele" în tot restul modelului.

```
User ─1:1─ Profile ─1:N─ Child ─N:1─ Group
                    │      └─1:N─ Attendance
                    ├─1:N─ Invoice ─1:1─ Payment
                    └─1:N─ Discount
```

**Auth** — două roluri, `ADMIN` și `PARENT` (`it-bridge-backend/src/enum/role.enum.ts`). `register` creează
întotdeauna `PARENT`; adminul se promovează manual prin DB sau `PUT /users/:id`. JWT în pereche
access (15 min) / refresh (7 zile), cu secrete distincte în `it-bridge-backend/src/constants/jwtConstants.ts`.

Protecția se compune per-handler, nu global:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
```

**Autorizarea pe date se face în service, nu în guard.** Tiparul de urmat, când adaugi un
endpoint pe care un părinte îl poate accesa doar pentru propriile date:

```ts
const qb = this.invoiceRepository.createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.parent', 'parent');
if (role !== Role.ADMIN) {
    qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
}
```

Vezi `it-bridge-backend/src/modules/invoice/invoice.service.ts:50`. Același tipar în `payment`, `child`, `profile` — respectă-l.

**Frontend** — lanțul de autentificare are o ordine care contează:
`it-bridge-frontend/app/plugins/01.auth.client.ts` setează `authInitialized` → middleware-urile globale
`01.auth.global.ts` și `02.profile-setup.global.ts` **ies devreme** dacă flag-ul e fals →
`it-bridge-frontend/app/middleware/admin-check.ts` e opt-in, pus explicit pe paginile `/admin/*`. Prefixele numerice
din numele fișierelor dictează ordinea de execuție; nu le redenumi.

Tokenurile trăiesc în cookies (`it-bridge-frontend/app/stores/tokenStore.ts`). Toate apelurile trec prin
`it-bridge-frontend/app/composables/api/useApi.ts`, care face refresh automat pe 401 și de-duplică refresh-urile
concurente printr-un `refreshPromise` partajat. Nu apela `$fetch` direct — folosește
composable-urile din `it-bridge-frontend/app/composables/api/`.

State-ul e în Pinia stores (`stores/`), tipurile în `types/`, câte un fișier per domeniu.

## Convenții

- Backend: 4 spații, ghilimele simple, print width 120 (`.prettierrc`). Frontend: 2 spații,
  ghilimele duble. Nu amesteca.
- Backend importă cu path absolut de la rădăcină: `from 'src/entities/child.entity'`
  (rezolvat prin `baseUrl`). Frontend folosește alias-ul Nuxt `~/`.
- Sumele monetare: `decimal` în Postgres, expuse ca `number` în aplicație printr-un
  `transformer` pe coloană (vezi `it-bridge-backend/src/entities/invoice.entity.ts`).
- Lunile de facturare sunt string-uri `'YYYY-MM'` (`monthIssued`), cu constrângere
  `@Unique(['parent', 'monthIssued'])` pe `Invoice`.
- `Group.weekday` e zi ISO: 1 = luni, 7 = duminică.

## Capcane

Lucruri care te vor bloca dacă nu le știi dinainte.

**`npm test` nu rulează.** Toate cele 18 suite eșuează la încărcare cu
`Cannot find module 'src/entities/...'`. `baseUrl` din tsconfig rezolvă importurile la
`nest build`, dar ts-jest nu îl folosește. Fix, o singură linie în config-ul jest din
`it-bridge-backend/package.json`:

```json
"moduleDirectories": ["node_modules", "<rootDir>/.."]
```

Testele existente sunt oricum doar schelet `should be defined`.

**Validarea nu rulează.** 22 de fișiere DTO au decoratori `class-validator`, dar niciun
`ValidationPipe` nu e înregistrat în `it-bridge-backend/src/main.ts` și nu există `APP_PIPE`. Body-uri brute ajung
direct în servicii. Dacă adaugi un DTO, decoratorii lui nu fac nimic până nu se înregistrează
pipe-ul global.

**Nu există migrări.** `it-bridge-backend/src/app.module.ts` rulează cu `synchronize: true`, deci TypeORM alterează
schema singur la fiecare boot. Orice schimbare de entitate se aplică direct pe baza de date.

**`API_BASE`, nu `NUXT_PUBLIC_API_BASE`.** `it-bridge-frontend/nuxt.config.ts` mapează
`runtimeConfig.public.apiBase` pe `process.env.API_BASE`. Fără el, `apiBase` e `undefined` și
cererile pleacă spre origin-ul Nuxt. E în `it-bridge-frontend/.env.example` și trebuie setat și în
Vercel, inclusiv pe Preview.

**`AWS_REGION` e obligatorie ca să pornească aplicația.** `S3Service.onModuleInit`
(`it-bridge-backend/src/modules/invoice/s3.service.ts:13`) aruncă fără ea, deci backend-ul cade la
boot, chiar dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe
lanțul implicit de credențiale, adică IAM instance role în producție. Mesajul de eroare cere trei
variabile, dar verifică una singură.

**Secrete JWT cu fallback.** `it-bridge-backend/src/constants/jwtConstants.ts` cade pe `'defaultAccessSecret'` /
`'defaultRefreshSecret'` dacă variabilele lipsesc — fără avertisment.

**Refresh tokens nu pot fi revocate.** Sunt stateless, nu există logout server-side și nici
listă de revocare.

**Prețuri hardcodate, cu gaură la 3+ copii.** `it-bridge-backend/src/modules/invoice/invoice.service.ts:107` — 350 pentru un copil,
250×2 pentru doi, nicio ramură pentru trei sau mai mulți, deci `totalAmount` rămâne 0 și
reducerile îl duc pe negativ.

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

## Planul de lucru

Epic-urile sunt în [docs/epics/](docs/epics/). Citește
[docs/epics/README.md](docs/epics/README.md) pentru harta dependențelor înainte să începi ceva
mai mare decât un bugfix.
