# CLAUDE.md

Ghid pentru agenți care lucrează în acest repo. Vezi și [README.md](README.md) pentru quick start.

## Ce este

ITBridge School — platformă de management pentru o școală de IT pentru copii (interfață în română).
Părinții își fac cont, înregistrează copiii, copiii intră în grupe, se marchează prezența, iar
lunar se emit facturi (PDF în S3) și se înregistrează plățile.

Monorepo pnpm, orchestrat cu Turborepo, plus Postgres ca infrastructură locală:

| Workspace            | Stack                                               | Port |
| -------------------- | --------------------------------------------------- | ---- |
| `apps/api/`          | NestJS 11, TypeORM, JWT, PDFKit, AWS S3             | 3000 |
| `apps/web/`          | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind                 | 3001 |
| `packages/types/`    | contractul API partajat, `@itbridge/types`          | —    |
| `docker-compose.yml` | Postgres 17 — singurul lucru care rulează în Docker | 5432 |

## Comenzi

Toate de la rădăcină. Nu intra în `apps/*` să rulezi `npm` — nu există `package-lock.json` și nu
mai există `node_modules` propriu.

```bash
cp .env.example .env    # un singur .env, la rădăcină
pnpm install
docker compose up -d    # doar Postgres; aplicația rulează pe Node
pnpm dev                # api + web, hot reload, fără variabile pe linia de comandă

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
mai probabilă cauză când ceva „nu vede" o variabilă pe care tocmai ai pus-o în `.env`.

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

**Backend** — nouă module feature în `apps/api/src/modules/`, toate după același tipar
`controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `group`,
`attendance`, `invoice`, `payment`, `discount`. Entitățile stau centralizat în `apps/api/src/entities/`
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

**Auth** — două roluri, `ADMIN` și `PARENT` (`apps/api/src/enum/role.enum.ts`). `register` creează
întotdeauna `PARENT`; adminul se promovează manual prin DB sau `PUT /users/:id`. JWT în pereche
access (15 min) / refresh (7 zile), cu secrete distincte în `apps/api/src/constants/jwtConstants.ts`.

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

Vezi `apps/api/src/modules/invoice/invoice.service.ts:50`. Același tipar în `payment`, `child`, `profile` — respectă-l.

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

## Capcane

Lucruri care te vor bloca dacă nu le știi dinainte.

**`pnpm test` verde nu înseamnă `pnpm typecheck` verde.** ts-jest e mai permisiv decât `tsc` pe
fișierele de test, deci o suită poate trece în timp ce `tsc --noEmit` raportează erori pe același
cod. Rulează amândouă înainte să deschizi un PR — CI le rulează separat.

**Testele de integrare pornesc un server real, cu `app.listen(0)`, nu `getHttpServer()` direct.**
Nu schimba asta: supertest ridică altfel un server efemer la fiecare cerere, iar suita devine
intermitentă în chip înșelător — am văzut cereri neautentificate răspunzând 200, ceea ce arată ca o
breșă de autentificare, dar era rotație de porturi.

**Testele de integrare cer Postgres pornit.** `pnpm test:e2e` se conectează la baza
`itbridge_test`, pe care și-o creează singur prin `apps/api/test/global-setup.ts`, dar serverul
trebuie să ruleze: `docker compose up -d`. Schema o face TypeORM cu `synchronize: true`.

**Validarea nu rulează.** 22 de fișiere DTO au decoratori `class-validator`, dar niciun
`ValidationPipe` nu e înregistrat în `apps/api/src/main.ts` și nu există `APP_PIPE`. Body-uri brute ajung
direct în servicii. Dacă adaugi un DTO, decoratorii lui nu fac nimic până nu se înregistrează
pipe-ul global.

**Nu există migrări.** `apps/api/src/app.module.ts` rulează cu `synchronize: true`, deci TypeORM alterează
schema singur la fiecare boot. Orice schimbare de entitate se aplică direct pe baza de date.

**`API_BASE`, nu `NUXT_PUBLIC_API_BASE`.** `apps/web/nuxt.config.ts` mapează
`runtimeConfig.public.apiBase` pe `process.env.API_BASE`. Fără el, `apiBase` e `undefined` și
cererile pleacă spre origin-ul Nuxt. E în `.env.example` de la rădăcină și trebuie setat și în
Vercel, inclusiv pe Preview.

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

**`AWS_REGION` e obligatorie ca să pornească aplicația.** `S3Service.onModuleInit`
(`apps/api/src/modules/invoice/s3.service.ts:13`) aruncă fără ea, deci backend-ul cade la
boot, chiar dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe
lanțul implicit de credențiale, adică IAM instance role în producție. Mesajul de eroare cere trei
variabile, dar verifică una singură.

**Secrete JWT cu fallback.** `apps/api/src/constants/jwtConstants.ts` cade pe `'defaultAccessSecret'` /
`'defaultRefreshSecret'` dacă variabilele lipsesc — fără avertisment.

**Refresh tokens nu pot fi revocate.** Sunt stateless, nu există logout server-side și nici
listă de revocare.

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

**Prețuri hardcodate, cu gaură la 3+ copii.** `apps/api/src/modules/invoice/invoice.service.ts:107` — 350 pentru un copil,
250×2 pentru doi, nicio ramură pentru trei sau mai mulți, deci `totalAmount` rămâne 0 și
reducerile îl duc pe negativ. Regula convenită e 350 pentru primul copil și 250 pentru fiecare
frate — deci 600 pentru doi, nu 500; vezi [E15](docs/epics/E15-pricing-facturare.md).

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
moment în care se șterge `.failing`. Vezi calculul de preț la trei copii și crearea de profiluri
fără date de contact.

## Planul de lucru

Epic-urile sunt în [docs/epics/](docs/epics/). Citește
[docs/epics/README.md](docs/epics/README.md) pentru harta dependențelor înainte să începi ceva
mai mare decât un bugfix.
