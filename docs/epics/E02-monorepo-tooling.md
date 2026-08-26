# E02 · Monorepo: pnpm, Turborepo și fluxul de dezvoltare

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E01 · **Blochează:** E03, E04

## Problemă

Repo-ul e un monorepo doar prin faptul că are două directoare unul lângă altul. Nu există
workspace, nu există rădăcină, nu există unealtă de orchestrare.

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

### S2 · Decizia de node_linker

pnpm folosește implicit un `node_modules` strict, cu symlink-uri către un store adresabil prin
conținut. Nu e "un singur node_modules" în sensul clasic — fiecare pachet vede doar ce a declarat.

Dacă vrei explicit un arbore aplatizat, se setează `node-linker=hoisted` în `.npmrc`. Recomand
**să nu** o faci: modul strict prinde dependențe nedeclarate, exact genul de bug care apare abia
în producție. Economia de spațiu o ai oricum, prin store-ul partajat.

**Acceptanță:** decizia e luată conștient și consemnată în `.npmrc` cu un comentariu care explică
de ce.

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

### S4 · Pachet partajat de tipuri

`packages/types` conține contractele împărtășite. Astăzi backend-ul are entitățile și DTO-urile,
iar frontend-ul redeclară aceleași forme în `app/types/*.ts`, în nouă fișiere. Cele două seturi
diverg tăcut: nimic nu semnalează când un câmp se schimbă într-o parte.

Alternativa mai puternică, dacă vrei să mergi până la capăt: generare de client din Swagger, care
deja se exportă la fiecare boot. Atunci tipurile nu se mai scriu de mână deloc.

**Acceptanță:** o schimbare de câmp în contractul API face să eșueze `typecheck` pe frontend.

### S5 · Turborepo

`turbo.json` cu graful: `build` depinde de `^build`, `test` depinde de `build`, `dev` e persistent
și fără cache. Ieșirile declarate corect, ca să funcționeze cache-ul local.

**Acceptanță:** un al doilea `pnpm build` fără modificări se termină din cache, în sub o secundă.

### S6 · Husky o singură dată

Configurația veche din câmpul `husky` al backend-ului dispare — nu mai e citită de Husky 9,
deci hook-ul nu rulează astăzi. Un singur `.husky/` la rădăcină, cu `lint-staged` care aplică
regulile potrivite pe fiecare workspace: patru spații și ghilimele simple pe backend, două spații
și ghilimele duble pe frontend.

**Acceptanță:** un commit cu formatare greșită e corectat automat, în ambele proiecte.

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

- Mutăm în `apps/api` și `apps/web`, sau păstrăm `it-bridge-backend` și `it-bridge-frontend`?
  Recomand mutarea, acum cât e ieftin.
- Tipuri scrise de mână în `packages/types`, sau client generat din `swagger.json`? Al doilea e
  mai multă unealtă și mai puțină întreținere pe termen lung.
