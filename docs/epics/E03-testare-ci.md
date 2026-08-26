# E03 · Testare și CI

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E02 · **Blochează:** E05, E15, E18

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

### S2 · Curățarea scheletelor

Testele generate care verifică doar `toBeDefined` fără dependențe mock-uite sunt completate sau
șterse. Un test care nu poate trece nu are ce căuta în repo.

**Acceptanță:** `pnpm test` e verde.

### S3 · Teste unitare pe logica de business

În ordinea priorității:

1. `invoice.service.calculateAmount` — fiecare ramură, inclusiv cazul cu trei sau mai mulți copii,
   care astăzi întoarce `0` și, după scăderea reducerilor, devine negativ.
2. Tiparul de autorizare pe date din `invoice`, `payment`, `child`, `profile`: un părinte nu vede
   datele altui părinte.
3. `auth.service` — hash, login, refresh, expirare.

**Acceptanță:** peste 80% acoperire pe `invoice`, `payment`, `auth`.

### S4 · Teste de integrare pe API

Aplicația pornește cu o bază Postgres efemeră și se verifică prin HTTP: coduri de status, forma
răspunsului, și mai ales autorizarea — un `PARENT` care cere factura altcuiva primește 403 sau 404,
niciodată date.

Testul de autorizare merită scris ca tabel parametrizat peste toate combinațiile rol-endpoint, ca
să nu fie nevoie de disciplină umană la fiecare endpoint nou.

**Acceptanță:** fiecare controller are cel puțin un test fericit și un test de autorizare.

### S5 · Frontend: typecheck și vitest

`nuxt typecheck` trece curat. Vitest cu teste pe `useApi` — logica de refresh pe 401 și
de-duplicarea prin `refreshPromise` sunt subtile și merită acoperite — și pe store-uri.

**Acceptanță:** `pnpm test` și `pnpm typecheck` există și trec în ambele workspace-uri.

### S6 · Workflow CI

`.github/workflows/ci.yml` rulează pe fiecare pull request: install, lint, typecheck, test, build,
prin Turborepo, cu cache. Branch protection pe `main` cere CI verde.

**Acceptanță:** un PR cu un test stricat nu poate fi merge-uit. CI pe o schimbare doar de frontend
nu reface build-ul de backend.

## Dependențe

[E02](E02-monorepo-tooling.md), pentru ca CI să folosească aceleași comenzi ca dezvoltatorul.

## Riscuri

**Testele scrise peste logica actuală de facturare o cimentează.** `calculateAmount` are un bug
cunoscut la trei copii. Testul trebuie să descrie comportamentul *dorit*, marcat explicit ca
eșuând, nu pe cel actual.

## Definition of done

CI verde obligatoriu pe `main`. Peste 80% acoperire pe modulele de bani și autorizare. Niciun test
dezactivat fără comentariu care explică de ce și până când.

## Întrebări deschise

- Testcontainers sau serviciu Postgres în CI? Primul e mai fidel, al doilea mai simplu și mai rapid.
- Prag de acoperire global sau doar pe module critice? Recomand al doilea — un prag global împinge
  la teste inutile pe DTO-uri.
