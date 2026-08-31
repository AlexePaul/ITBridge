# E02 · Monorepo: pnpm, Turborepo și fluxul de dezvoltare

**Status:** livrat · **Pistă:** Fundație · **Depinde de:** E01 · **Blochează:** E03, E04

## Problemă

Repo-ul e un monorepo doar prin faptul că are două directoare unul lângă altul. Nu există
workspace, nu există rădăcină, nu există unealtă de orchestrare.

Căile de mai jos sunt cele de dinaintea acestui epic: `it-bridge-backend/` și
`it-bridge-frontend/` au devenit `apps/api/` și `apps/web/` la mutare, iar directoarele vechi nu
mai există în repo.

Consecințele concrete:

- **Două instalări separate.** `it-bridge-backend/package-lock.json` are 479KB,
  `it-bridge-frontend/package-lock.json` are 516KB. Două arbori `node_modules` complet
  independenți, cu duplicate masive între ei.
- **Nu există comandă de pornire a aplicației.** Ca să lucrezi, deschizi două terminale, intri în
  două directoare și rulezi două comenzi diferite, dintre care una are nevoie de o variabilă de
  mediu pe care nimic nu ți-o spune: `API_BASE=http://localhost:3000 npm run dev -- --host 0.0.0.0 --port 3001`.
- **Două gestionare de pachete implicit diferite.** Backend-ul folosește `npm ci` în Dockerfile,
  frontend-ul `npm install`. Nimic nu impune consistență.
- **Nimic nu e cache-uit.** Fiecare build reface tot, chiar dacă nu s-a schimbat nimic în acel
  proiect.
- **Husky configurat de două ori, diferit.** Backend-ul are `pretty-quick` într-un câmp `husky`
  vechi din `it-bridge-backend/package.json`, care nu mai e citit de Husky 9. Frontend-ul are `.husky/` cu
  `lint-staged`. Deci hook-ul de pe backend nu rulează.

## Rezultat

O singură comandă instalează tot. O singură comandă pornește tot. Dependențele au un singur
lockfile și un singur loc de stocare. Task-urile cunosc graful de dependențe între proiecte și
se sar când nu s-a schimbat nimic.

## În scop

- Migrare la pnpm workspaces, cu lockfile unic la rădăcină.
- Turborepo pentru graful de task-uri și cache.
- Scripturi la rădăcină: `dev`, `dev:api`, `dev:web`, `build`, `lint`, `test`, `typecheck`.
- Un pachet partajat de tipuri între backend și frontend.
- Husky și lint-staged o singură dată, la rădăcină.
- Versiune de Node fixată.

## În afara scopului

- Conținutul testelor — vezi [E03](E03-testare-ci.md).
- Deploy — vezi [E01](E01-infrastructura-medii.md).

## Story-uri

### S1 · pnpm workspaces

`pnpm-workspace.yaml` la rădăcină. Cele două aplicații se mută în `apps/api` și `apps/web`, sau
își păstrează numele actuale dacă preferi să nu miști fișiere în același commit — dar structura
`apps/` plus `packages/` merită de la început, pentru că S4 adaugă oricum un pachet partajat.

Ambele `package-lock.json` dispar, înlocuite de un singur `pnpm-lock.yaml`. `.npmrc` fixează
`engine-strict` și versiunea de Node.

**Acceptanță:** `pnpm install` de la rădăcină, pe o clonă curată, instalează tot. Nu mai există
niciun `package-lock.json` în repo.

**Livrat.** Directoarele s-au mutat în `apps/api` și `apps/web`, plus `packages/types`. Ambele
lockfile-uri au dispărut, înlocuite de un `pnpm-lock.yaml` unic. `.npmrc` fixează `engine-strict`,
`.nvmrc` fixează Node 24, iar `packageManager` din `package.json` fixează pnpm pentru corepack.

Un lucru neprevăzut de epic: **pnpm 10 nu rulează scripturi de instalare** decât pentru pachetele
listate explicit în `onlyBuiltDependencies`. Fără asta, `bcrypt` rămâne fără binding nativ și
`esbuild` fără binar — backend-ul cade la primul hash de parolă, iar Nuxt nu pornește. Lista e în
`pnpm-workspace.yaml`, cu motivul fiecărei intrări.

### S2 · Decizia de node_linker

pnpm folosește implicit un `node_modules` strict, cu symlink-uri către un store adresabil prin
conținut. Nu e "un singur node_modules" în sensul clasic — fiecare pachet vede doar ce a declarat.

Dacă vrei explicit un arbore aplatizat, se setează `node-linker=hoisted` în `.npmrc`. Recomand
**să nu** o faci: modul strict prinde dependențe nedeclarate, exact genul de bug care apare abia
în producție. Economia de spațiu o ai oricum, prin store-ul partajat.

**Acceptanță:** decizia e luată conștient și consemnată în `.npmrc` cu un comentariu care explică
de ce.

**Livrat, cu recomandarea respectată:** `node-linker` rămâne pe `isolated`, implicit. Comentariul
din `.npmrc` explică de ce și ce să faci când o instalare eșuează cu „cannot find module".

Stricteția și-a arătat valoarea imediat, de două ori:

- `@internationalized/date` era importat în două pagini fără să fie declarat nicăieri. Mergea doar
  fiindcă npm îl aplatiza din dependențele `@nuxt/ui`. Acum e declarat explicit în `apps/web`.
- `filterProfile.dto.ts` importa din `@nestjs/swagger/dist/decorators/api-property.decorator`, o
  cale internă pe care `exports` din pachet n-o expune. Rescris pe rădăcina pachetului.

Ambele ar fi căzut la prima instalare curată sau la prima actualizare de dependențe.

### S3 · Scripturi de dezvoltare

La rădăcină:

```jsonc
"dev":       "turbo run dev --parallel",   // pornește api + web
"dev:api":   "turbo run dev --filter=api",
"dev:web":   "turbo run dev --filter=web",
"build":     "turbo run build",
"lint":      "turbo run lint",
"test":      "turbo run test",
"typecheck": "turbo run typecheck"
```

`API_BASE` vine dintr-un `.env` la rădăcină, cu `.env.example` versionat, deci nu se mai transmite
manual pe linia de comandă. Porturile rămân 3000 pentru API și 3001 pentru web.

**Acceptanță:** `pnpm dev` pe o clonă curată, cu Postgres pornit din Docker, ridică ambele
aplicații cu hot reload și cu frontend-ul vorbind cu backend-ul. Fără variabile pe linia de comandă.

**Livrat și verificat.** `.env` de la rădăcină e încărcat cu `dotenv-cli` și transmis tuturor
task-urilor. Cele trei `.env.example` separate (rădăcină, api, web) s-au topit într-unul singur,
comentat variabilă cu variabilă; un `apps/api/.env` rămâne citit dacă există, pentru secrete pe
care nu le vrei la rădăcină.

**Capcana care a costat cel mai mult timp:** Turbo 2 rulează implicit cu `envMode: "strict"`, deci
un task vede **doar** variabilele declarate în `turbo.json`. `.env` era încărcat corect, dar
`AWS_REGION` nu ajungea la proces, iar backend-ul cădea la boot fără niciun indiciu că problema e
Turbo. Rezolvat cu `globalEnv`, care acceptă wildcard-uri. E consemnat în README și în CLAUDE.md,
fiindcă e prima explicație de căutat când o variabilă „nu se vede".

Verificat: `pnpm dev` ridică ambele în ~30s, `apiBase` ajunge corect în payload-ul SSR, CORS-ul
citește originea din `.env`, iar o modificare în `apps/api/src` declanșează repornirea Nest.

### S4 · Pachet partajat de tipuri

`packages/types` conține contractele împărtășite. Astăzi backend-ul are entitățile și DTO-urile,
iar frontend-ul redeclară aceleași forme în `app/types/*.ts`, în nouă fișiere. Cele două seturi
diverg tăcut: nimic nu semnalează când un câmp se schimbă într-o parte.

Alternativa mai puternică, dacă vrei să mergi până la capăt: generare de client din Swagger, care
deja se exportă la fiecare boot. Atunci tipurile nu se mai scriu de mână deloc.

**Acceptanță:** o schimbare de câmp în contractul API face să eșueze `typecheck` pe frontend.

**Livrat, cu tipuri scrise de mână.** Generarea din `swagger.json` a fost respinsă: fișierul e în
`.gitignore` și se scrie abia la boot, deci genererea ar fi cerut ori comiterea schemei, ori
backend-ul pornit în timpul build-ului. Prea fragil pentru câștigul obținut.

`packages/types` descrie **formatul de pe sârmă**, nu entitățile — `Date` devine string, fiindcă
asta face `JSON.stringify`. Cele nouă fișiere din `apps/web/app/types/` au devenit punți de câte o
linie către pachet, deci cele ~25 de importuri `~/types/...` existente nu s-au schimbat.

Verificarea merge în **ambele** direcții, nu doar cea cerută: `apps/api/src/contract.ts` conține
aserțiuni la nivel de tip între entitățile TypeORM serializate și contract. Fără ele, backend-ul ar
fi putut redenumi un câmp iar contractul ar fi rămas să descrie o realitate dispărută.

**Probă:** redenumit `firstName` în `givenName` în contract → 14 erori pe `web`, 1 pe `api`.

**Ce a scos la iveală adoptarea contractului**, în ordinea gravității:

1. **Coloana „Tip Sesiune" din prezență era goală la fiecare rând.** Backend-ul trimite `'normal'`
   și `'catch-up'`; frontend-ul își cheia etichetele pe `'regular'` și `'make-up'`, valori pe care
   backend-ul nu le-a trimis niciodată. Bug vizibil, în producție, de necunoscut fără contract.
2. **Toate id-urile erau tipate `string` pe frontend, dar sunt `number`.** Comparațiile foloseau
   `==` slab, deci mergeau; cele care foloseau `===` comparau un număr cu un string de rută și
   erau permanent false.
3. `markGroupAttendance` declara `childId: string`, deși DTO-ul din backend cere `@IsNumber()`.
4. `Invoice.parent` e opțional — apare doar când interogarea face join — iar pagina de plăți îl
   dereferenția necondiționat.

Toate corectate, în cel mai mic diff care le rezolvă.

### S5 · Turborepo

`turbo.json` cu graful: `build` depinde de `^build`, `test` depinde de `build`, `dev` e persistent
și fără cache. Ieșirile declarate corect, ca să funcționeze cache-ul local.

**Acceptanță:** un al doilea `pnpm build` fără modificări se termină din cache, în sub o secundă.

**Livrat și verificat: 346ms, `>>> FULL TURBO`.** Graful e cel cerut. În plus, `.env` de la
rădăcină intră în `globalDependencies`, deci o schimbare de configurație invalidează build-urile în
loc să servească un artefact construit cu alte valori.

### S6 · Husky o singură dată

Configurația veche din câmpul `husky` al backend-ului dispare — nu mai e citită de Husky 9,
deci hook-ul nu rulează astăzi. Un singur `.husky/` la rădăcină, cu `lint-staged` care aplică
regulile potrivite pe fiecare workspace: patru spații și ghilimele simple pe backend, două spații
și ghilimele duble pe frontend.

**Acceptanță:** un commit cu formatare greșită e corectat automat, în ambele proiecte.

**Livrat.** Câmpul mort `husky` din `package.json`-ul backend-ului a dispărut, la fel și
`apps/web/.husky/`. Un singur `.husky/pre-commit` la rădăcină rulează `lint-staged`, configurat
per workspace. Prettier își rezolvă oricum configurația per fișier, deci `apps/api/.prettierrc`
(4 spații, ghilimele simple) și `apps/web/.prettierrc` (2 spații, ghilimele duble) rămân în vigoare
fiecare pe teritoriul lui; `packages/types` a primit una nouă, aliniată cu backend-ul.

## Dependențe

[E01](E01-infrastructura-medii.md), pentru că scripturile de dezvoltare presupun că Docker
pornește doar Postgres, iar aplicația rulează pe Node local.

## Riscuri

**Mutarea directoarelor rupe orice cale hardcodată.** Vercel are configurat un director rădăcină
în dashboard; trebuie actualizat în același timp cu merge-ul, altfel deploy-ul de producție cade.

**pnpm e mai strict decât npm.** Migrarea va scoate la iveală dependențe folosite dar nedeclarate.
E un beneficiu, dar prima instalare va eșua de câteva ori până se declară tot.

**Turborepo e opțional până la un punct.** Cu două aplicații, câștigul e modest. Merită pentru
cache-ul din CI și pentru că a treia aplicație — un uploader pentru [E14](E14-proiecte-elevi.md),
de pildă — devine trivial de adăugat.

## Definition of done

`pnpm install && pnpm dev` de la zero pornește tot. Un singur lockfile. Un singur `.husky/`.
CI folosește aceleași comenzi ca dezvoltatorul, nu variante paralele.

## Întrebări deschise

Ambele au primit răspuns.

**Mutăm în `apps/api` și `apps/web`?** Da. Consecința de urmărit: Root Directory din Vercel trebuie
schimbat din `it-bridge-frontend` în `apps/web` **în același timp** cu merge-ul, iar Install Command
devine `pnpm install --frozen-lockfile`.

**Tipuri de mână sau client generat?** De mână. Vezi motivul în S4.

## Ce rămâne roșu, și de ce

`pnpm build` și `pnpm typecheck` trec pe toate workspace-urile. Două nu:

- **`pnpm test`** — jest nu rezolvă importurile absolute `src/...`. Neschimbat de mutare, fix-ul de
  o linie e documentat în CLAUDE.md, iar suitele sunt oricum doar schelet.
  [E03](E03-testare-ci.md) le ia pe amândouă.
- **`pnpm lint`** pe `api` — 238 de erori preexistente, dintre care 192 din familia `no-unsafe-*`,
  adică `any` care circulă prin servicii, plus 44 de variabile nefolosite. Cele 139 care erau pură
  formatare au fost reparate cu `--fix`. Restul e datorie de tipuri, nu de tooling, și ține de
  [E05](E05-robustete-backend.md). O alternativă în două linii, dacă blochează CI-ul din E03: în
  `apps/api/eslint.config.mjs`, familia `no-unsafe-*` trecută pe `warn`, ca gate-ul să prindă
  regresii noi cât timp datoria veche rămâne vizibilă.
