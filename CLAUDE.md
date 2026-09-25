# CLAUDE.md

Ghid pentru agenți care lucrează în acest repo. Vezi și [README.md](README.md) pentru quick start.

## Ce este

ITBridge School — platformă de management pentru o școală de IT pentru copii (interfață în română).
Părinții își fac cont, înregistrează copiii, copiii intră în grupe, se marchează prezența, iar
lunar se emit facturi (PDF în S3) și se înregistrează plățile.

Monorepo pnpm, orchestrat cu Turborepo, plus Postgres ca infrastructură locală:

| Workspace            | Stack                                                                 | Port       |
| -------------------- | --------------------------------------------------------------------- | ---------- |
| `apps/api/`          | NestJS 11, TypeORM, JWT, PDFKit, AWS S3, sharp                        | 3000       |
| `apps/web/`          | Nuxt 4, @nuxt/ui 4, Pinia, Tailwind                                   | 3001       |
| `apps/agent/`        | Node 22 simplu, **zero dependențe de runtime** — agentul de încărcare | —          |
| `packages/types/`    | contractul API partajat, `@itbridge/types`                            | —          |
| `docker-compose.yml` | Postgres 17 + MinIO — singurele lucruri care rulează în Docker        | 5432, 9000 |

`apps/agent` nu rulează local și nu pornește cu `pnpm dev`: e un serviciu Windows care stă pe
calculatorul din birou al școlii, urmărește o partajare de rețea și urcă prin API ce salvează
profesorii acolo (E14 S2). Se construiește cu `pnpm --filter agent build`; instalarea e în
[apps/agent/README.md](apps/agent/README.md).

## Cele două branch-uri

**`release/prod` e site-ul public. `release/stage` e restul.**

Vercel servește `release/prod` pe `itbridgeschool.com`, iar paginile publice nu ating backend-ul —
de asta site-ul stă în producție deși API-ul de producție nu e deployat nicăieri. Tot ce e după
autentificare — portalul, zona de admin, întreg `apps/api` de după E08 — trăiește pe `release/stage`,
iar de acolo **se deployează singur**: web pe `stage.itbridgeschool.com` (Vercel), API pe
`api-stage.itbridgeschool.com` (EC2). Un push pe branch e un deploy; vezi „Infrastructură — stare
reală" mai jos.

În `release/prod` intră doar ce afectează site-ul public și poate fi verificat fără backend:
conținut, SEO, performanță, corecturi de interfață publică. Se aduc prin cherry-pick, nu prin merge
din `release/stage` — un merge ar trage în producție jumătate de platformă care n-are unde să
ruleze.

**Documentația din `docs/` și fișierul ăsta sunt identice pe ambele branch-uri**, fiindcă descriu
proiectul, nu ramura. Deci pe `release/prod` vei citi despre module care nu există în arborele de
sub tine — `enrollment`, `project`, `storage` — și e în regulă: sunt pe `release/stage`. Ce **nu** e
în regulă e ca cele două copii ale documentației să divergă; dacă atingi una, adu-o și pe cealaltă.

**Amândouă numele sunt noi: `main` → `release/prod` și `develop` → `release/stage`, septembrie 2026.** Sunt redenumiri, nu branch-uri noi — același istoric, aceleași SHA-uri — deci un mesaj de
commit, un titlu de PR sau un paragraf mai vechi care spune `main` sau `develop` vorbește despre
ele. Pe origin nu mai există niciunul dintre numele vechi. Într-o clonă mai veche:

```bash
git branch -m main release/prod
git branch -m develop release/stage
git fetch origin
git branch -u origin/release/prod release/prod
git branch -u origin/release/stage release/stage
git remote set-head origin -a
```

**Vercel nu află de redenumire dintr-un webhook.** El construiește la push, iar o redenumire nu
produce niciun commit — deci tot istoricul de deployment-uri rămâne legat de numele vechi și
`release/prod` are zero, iar dashboard-ul refuză să-i dea Production Branch sau un domeniu, cu
„No deployments found". Nu e un buton de apăsat: se deblochează la primul commit care ajunge pe
branch. Production Branch din Settings → Git se pune de mână, o singură dată.

## Comenzi

Toate de la rădăcină. Nu intra în `apps/*` să rulezi `npm` — nu există `package-lock.json` și nu
mai există `node_modules` propriu.

```bash
cp .env.example .env              # un singur .env, la rădăcină
pnpm install
docker compose up -d              # Postgres + MinIO; aplicația rulează pe Node
pnpm --filter api migration:run   # schema; synchronize e oprit
pnpm seed                         # date de dezvoltare; admin / parola123
SEED_TODAY=2026-03-16 pnpm seed   # aceleași date, dar ancorate la o zi fixă
pnpm seed:scale                   # o școală de trei ani, ca să se poată măsura o interogare
pnpm smartbill:check              # SmartBill: doar citiri (TVA, serii); --draft trimite o ciornă
pnpm dev                          # api + web, hot reload

pnpm build          # turbo, în ordinea dependențelor
pnpm typecheck      # toate workspace-urile
pnpm lint           # verifică, nu modifică; corectare: pnpm --filter api lint:fix
pnpm test           # jest pe api, vitest pe web
pnpm test:e2e       # integrare prin HTTP; cere Postgres pornit
pnpm test:a11y      # axe-core pe paginile publice, într-un Chromium adevărat; construiește întâi
pnpm test:a11y:auth # același lucru pe ecranele din spatele autentificării; cere API pornit și seed
pnpm test:privacy   # aceleași pagini: nicio cerere în afara originii, niciun cookie
pnpm test:links     # aceleași pagini: fiecare link intern răspunde 200, fragmente incluse
pnpm secrets        # nicio cheie, niciun token în ce urmărește git; rulează și în CI

pnpm --filter api <script>   # o comandă într-un singur workspace
```

Aplicația **nu** rulează în Docker, nici local nici în producție. Backend-ul își citește `.env`
prin `apps/api/src/load-env.ts`, importat înaintea oricărui modul care atinge `process.env` la
încărcare — dacă adaugi un import nou în `main.ts`, lasă-l pe ăsta primul.

**Seed-ul e ancorat la ziua de azi, nu la o constantă.** Tot ce scrie atârnă de `SEED_TODAY` din
`apps/api/src/seed/seed.ts`: cele opt săptămâni de prezență din urmă, orizontul de orar din față,
lunile care au facturi. Era o dată fixă, iar la șase luni după ce a fost scrisă o bază proaspăt
populată se deschidea pe „Nicio oră azi", cu cea mai nouă factură veche de jumătate de an. Acum
implicitul e ziua curentă, iar `SEED_TODAY=2026-03-16` o fixează la loc dacă vrei două rulări
identice. Grupele acoperă luni–sâmbătă tocmai ca „azi" să aibă o oră în șase zile din șapte.
`pnpm seed` nu trece prin turbo, deci variabila **nu** se declară în `globalEnv`.

**`pnpm seed:scale` e a doua volumetrie, nu a treia țintă.** Seed-ul obișnuit are ~120 de ședințe
și ~80 de marcaje, iar la dimensiunea aia Postgres alege scanarea secvențială orice index i-ai pune
— deci o interogare care scanează toată tabela și una care folosește un index dau **același plan și
același timp**. Două defecte au stat fix în golul ăla până în septembrie 2026, printre ele un `SUM`
peste plățile unei facturi care rula neindexat **ținând lacătul acelei facturi**.

Comanda umple baza cu o școală de trei ani — implicit 250 de familii, 300 de copii, 30 de grupe,
3.510 ședințe, 35.100 de marcaje, 9.000 de facturi, 54.000 de rânduri în coadă — în vreo două
secunde, fiindcă scrie prin `generate_series`, nu prin TypeORM. Dimensiunea se schimbă din
`SCALE_YEARS` și `SCALE_FAMILIES`; forma stă în `scale.rules.ts` și are spec propriu, fiindcă e
partea care poate fi tăcut greșită: un copil înmulțit cu **toate** ședințele școlii, în loc cu cele
ale grupei lui, dă 936.000 de rânduri în loc de 35.100, iar scriptul rulează la fel de vesel.

**Nu e o bază în care se dă clic**: n-are conturi de părinte, toate familiile se cheamă `Familia 37`
și **golește tot** înainte, deci trece prin acelaşi `checkSeedTarget`. Când ai terminat de măsurat,
`pnpm seed` îți dă înapoi baza folosibilă. Ce tipărește la final sunt numerele **citite din bază**,
nu cele prezise — prima versiune tipărea predicția și era greșită cu treizeci de rânduri la plăți,
iar un rezumat care contrazice tabela e mai rău decât niciun rezumat.

**Seed-ul are două ținte, iar `seed-target.ts` e tot ce le desparte.** `pnpm seed` merge pe baza
locală; `pnpm seed:stage` citește `.env.stage` și merge pe staging. Pe orice host care nu e
localhost, `checkSeedTarget` cere două lucruri și le **refuză**, nu le avertizează:
`SEED_ALLOW_NON_LOCAL` trebuie să fie **numele bazei**, nu `1` — un „da" rămas într-un fișier de
mediu autorizează orice scrie `DB_NAME` data viitoare —, iar `SEED_PASSWORD` trebuie setată, fiindcă
`parola123` e în repo și pe un host public ar fi un cont de admin publicat. Parola de pe staging nu
se tipărește la final: ar ajunge în logul rulării. Regula e pură și are spec propriu; dacă adaugi o
a treia țintă, treci prin ea, nu pe lângă.

**`seed:stage` trimite `SEED_TARGET=stage`, iar o bază locală de acolo e refuz.** `dotenv -e
.env.stage` **nu dă eroare când fișierul lipsește** — încarcă nimic —, iar `data-source.ts` cade
atunci pe `localhost`, deci comanda ar fi golit tăcut baza de dezvoltare a celui care aștepta să se
umple staging-ul: exact greșeala de țintă pe care restul fișierului o oprește, intrată pe ușa din
față. Dacă adaugi o comandă de seed pentru încă un mediu, dă-i și ei un `SEED_TARGET` — un flag de
mediu care se pierde tăcut e mai rău decât unul care lipsește.

**O variabilă de mediu nouă trebuie declarată în `turbo.json`, la `globalEnv`.** Turbo rulează în
mod `strict`: un task vede doar ce e declarat acolo, iar restul lipsesc fără niciun mesaj. E cea
mai probabilă cauză când ceva „nu vede” o variabilă pe care tocmai ai pus-o în `.env`.

**Și acum o ține un spec, fiindcă nu era treaba nimănui s-o observe.** Două porturi rămăseseră
nedeclarate — `THIRD_PARTY_PORT` și `LINK_CHECK_PORT` —, iar primul era singura ieșire dintr-o
ciocnire: `check-third-party.mjs` și `check-a11y-auth.mjs` serveau amândouă pe 3124, deci a doua
comandă rămânea fără server, iar butonul de scăpare nu ajungea niciodată la script fiindcă
`pnpm test:privacy` trece prin turbo. Un buton care nu face nimic e mai rău decât niciun buton: îl
trimite pe cel care-l apasă să caute în altă parte. `every-env-var-is-declared.spec.ts` compară
fiecare `process.env.X` din surse cu `globalEnv` și pică pe nume; cele două excepții —
`SEED_TODAY`, fiindcă `pnpm seed` nu trece prin turbo, și `TZ`, fiindcă e pus de scripturile jest
înainte să pornească Node — au propoziția lor lângă ele.

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

**Backend** — douăzeci și patru de module în `apps/api/src/modules/`, șaptesprezece după același
tipar `controller / service / module / dto/`: `auth`, `user`, `profile`, `child`, `enrollment`,
`location`, `room`, `group`, `class-session`, `attendance`, `invoice`, `payment`, `discount`,
`announcement`, `lead`, `reconciliation`, `audit`.
Șapte ies din tipar: `storage` și `smartbill` n-au controller, fiindcă nimic din ele nu e expus pe HTTP — ce
se cere SmartBill-ului decide modulul care deține rândul —, `mail` are unul singur
și îngust — editorul de șabloane din E17 S2; trimiterea în sine rămâne neexpusă —, `health` n-are
decât atât, iar `project` are **două** controllere și patru servicii — audiențele sunt diferite
(agentul de pe Windows și ecranele), iar treburile la fel: ce e un document, ce pleacă din clădire,
ce ia părintele acasă, ce cere agentul. `dashboard` are și el două controllere și patru servicii, dar
din motivul opus: nu deține nimic, ci adună — vezi regula lui E21 mai jos. `privacy` are tot două:
drepturile pe care o familie le exercită asupra datelor ei — exportul, ștergerea, retragerea — și
acordurile pentru lucrările copiilor (E07 S2), pe care le scriu și familia, și biroul. Entitățile stau centralizat
în `apps/api/src/entities/` și
sunt expuse tuturor modulelor prin `EntitiesModule` (un singur `TypeOrmModule.forFeature`
reexportat), deci un modul nou importă `EntitiesModule`, nu entitățile individual.

**Stocarea de obiecte e un modul propriu, `storage`.** `S3Service` stătea în modulul de facturi și
știa un singur tip de fișier: fixa `ContentType: 'application/pdf'` pe orice upload. E14 are nevoie
de `.sb3`, de JPEG și de video, deci serviciul s-a generalizat și s-a mutat — `putObject` cere acum
tipul ca argument, iar clientul știe `HeadObject`, ștergere, stream și URL semnat. Bucket-ul rămâne
unul singur; `projects/` stă lângă `invoices/`.

**Model de date** — `User` (credențiale) și `Profile` (date de contact) sunt separate
intenționat: un admin poate crea un `Profile` fără cont, iar `GET /users/without-profile`
servește fluxul de legare ulterioară. `Profile` e "părintele" în tot restul modelului.

```
User ─1:1─ Profile ─1:N─ Child ─N:1─ Group ─N:1─ Room ─N:1─ Location
                    │      ├─1:N─ Enrollment ─N:1─ Group
                    │      ├─1:N─ WaitlistEntry ─N:1─ Group
                    │      ├─1:N─ Attendance ─N:1─ ClassSession ─N:1─ Group
                    │      └─1:N─ Project ─1:N─ ProjectVersion ─1:N─ ProjectFile
                    │                    └─1:N─ ProjectLink
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

**Iar un loc oferit listei de așteptare nu e liber** (revizuirea din 25 septembrie 2026). Cele 48 de
ore în care familia are de răspuns, niciun număr nu-l vedea: formularul public îl vindea ca probă,
un admin înscria alt copil în el, iar familia care spunea da găsea `GROUP_FULL` — exact rezultatul
pentru care există lista. `occupancyOf` întoarce acum și `held` (ofertele fără răspuns), iar `free`
e ce rămâne după `taken` și `held`; `freeSeatsAtSessions` și verificarea de capacitate numără la fel.
**Singura excepție e copilul care ține oferta**: oferta lui e scaunul în care se așază, nu un scaun
din calea lui. `taken` rămâne înscrierile, ca un ecran să poată deosebi o probă de o promisiune.

**Și locurile unei ore sunt ale sălii în care e ora** (aceeași revizuire). O oră mutată într-o sală
mai mică are locurile sălii, nu ale grupei: `freeSeatsAtSessions` numără cel mai mic dintre cele
două, iar ședința îi dă sala ei (`SeatedSession.room`). Iar un copil înscris azi stă în fiecare oră
de acum încolo, deci `enrol` și `transfer` întreabă și de ora cea mai strâmtă (`tightestClassFrom`):
una cu un copil mutat acolo pe o săptămână are un scaun mai puțin, iar al zecelea copil din zece
intra în grupă cât joia avea un vizitator — unsprezece în sală în joia aia. Copilul care se înscrie
nu e vizitator în orele în care intră, chiar dacă biroul îl mutase deja acolo pe o săptămână: stă pe
un scaun, nu pe două. Refuzul e tot `GROUP_FULL`, dar numește ora, fiindcă grupa arată un loc liber;
iar peste el, `allowOverCapacity` lasă în jurnal ora pe care a supraumplut-o, nu „peste capacitate".
De partea sălii: nu mai scade sub o grupă care se ține în ea (`ROOM_SMALLER_THAN_GROUP`), iar o oră
nu se mută și nu se recuperează într-o sală în care nu încap copiii care vin (`ROOM_TOO_SMALL`) —
numărați **sub lacătul grupei, în tranzacția mutării**, ca o probă programată între timp să fie
văzută.

**Factura numără înscrierile `ACTIVE`, nu copiii din familie.** Din E11/S4: proba e gratuită, iar un
copil care nu e în nicio grupă nu vine, deci nu plătește. Al doilea caz era greșit dinainte să existe
probele. Dacă schimbi asta, e o decizie de preț și e a E15 — nu o numărare de rânduri în `children`.
Proba rămâne gratuită și după ce e decisă, prin `Enrollment.trialUntil` — vezi emiterea, mai jos.

**Un copil își schimbă grupa doar prin transfer**, `POST /enrollments/transfer`: închide vechea
înscriere și o deschide pe cea nouă într-o singură tranzacție. **Locul lăsat în urmă se oferă listei
grupei vechi**, ca orice loc eliberat. Paragraful de aici spunea invers — că locul „nu e liber, se dă
acestui copil" —, ceea ce nu e adevărat despre niciun scaun: copilul stă acum în _cealaltă_ grupă,
iar ecranul grupei vechi arăta `free: 1` lângă o listă pe care n-o anunțase nimeni. De aceea
transferul e singura tranzacție care ține **două** grupe, și le ia în ordinea id-ului, cea mai mică
prima — altfel două transferuri în sensuri opuse țin fiecare câte una și o așteaptă pe cealaltă. Și
decontează, ca `enrol`, cererea pe care copilul o avea pentru grupa nouă.

**O probă mutată în altă grupă își ia lead-ul cu ea** (revizuirea din 25 septembrie 2026). Lead-ul
atârnă de înscrierea pe care o decide E11, iar după transfer aia e rândul nou — deci decizia pe el nu
decontase nimic, iar mementoul și recontactarea după neprezentare vorbeau despre ora grupei vechi.
`LeadProgressService.followTransfer` mută `enrollment` și `group`, iar cât proba e încă în față îi dă
ca oră următoarea oră neîncepută a grupei noi: ce s-a stabilit la telefon platforma nu are de unde
ști, iar următoarea e ce ar oferi și formularul. O probă deja ținută își păstrează ora — acolo s-a
ținut —, iar `location` rămâne unde a cerut familia, fiindcă după ea numără pâlnia cererea. Tot de
aici: o probă închisă prin `close` în loc de `resolveTrial` își trece lead-ul pe pierdut, iar
**`close` refuză o zi din viitor** (`ENROLLMENT_END_IN_FUTURE`): închiderea ia locul pe loc, deci o
dată înainte scotea copilul din catalog și îi oferea scaunul listei cât încă stătea pe el.

**Contractul de înscriere e pe hârtie; platforma ține faptul și ziua, nimic altceva** (E07 S8).
`Enrollment.contractSignedAt` se completează la înscriere, la confirmarea probei sau după, prin
`PUT /enrollments/:id/contract` — cu `null` pentru o dată greșită. **Proba e refuzată**
(`TRIAL_HAS_NO_CONTRACT`): e gratuită și n-are contract, deci o dată pe ea ar spune că familia s-a
angajat înainte să decidă. Lista `GET /enrollments/without-contract` numără doar înscrierile
**active**: o înscriere închisă e istorie, iar tabloul de bord o cere de la
`EnrollmentService.withoutContract`, nu numără el. Nu adăuga textul, versiunea sau o acceptare
digitală: nu există auto-înscriere, deci e mereu cineva în cameră când se semnează, iar hârtia se
obține la fel de ușor ca o bifă.

**Verificarea de vârstă e avertisment, nu blocaj** (E11/S6): prima cerere primește 409
`COMPATIBILITY_WARNINGS` cu vârstele în mesaj, a doua trece cu `acknowledgeWarnings: true`. Nu e o
cale de acces peste capacitate — aia se verifică prima și refuză oricum. Dacă adaugi un endpoint care
înscrie, dă-i și câmpul: un avertisment fără cale de răspuns e un blocaj cu numele greșit.

**Prezența se leagă de ședință, nu de o dată și o oră.** `ClassSession` (tabelul `class_sessions`)
e ședința din orar, generată din programul grupei pe un orizont rulant de opt săptămâni. Numele are
prefix fiindcă `Session` e deja luat de tabelul de refresh tokenuri.

**Generarea e idempotentă pe loc, nu pe zi** (revizuirea din 25 septembrie 2026).
`ClassSession.scheduledFor` e ziua pentru care a scris-o generatorul, iar o mutare n-o schimbă. O zi e
ocupată de două ori: o oră stă pe ea, sau o oră **a fost generată pentru ea** și s-a mutat în altă
parte. Cât timp se întreba doar de zi, o oră mutată de vineri pe sâmbătă lăsa vinerea liberă, iar
rularea de a doua zi o scria din nou: două ore în săptămâna aia, iar cea fantomă era vândută pe
`/proba`, oferită la mutări și raportată nemarcată. De ce nu „o oră pe săptămână": o oră mutată **în
altă săptămână** lasă săptămâna aia cu ora ei proprie, iar regula pe săptămână ar fi șters-o.
`UQ_class_sessions_group_slot` ține linia pentru două generări deodată; `scheduledFor` e `null` pe un
rând pe care nu l-a scris generatorul, iar o recuperare (E12 S9) scrisă pe o zi goală primește ca loc
ziua pe care o recuperează.

**O grupă mutată pe altă zi, oră sau sală își ia orele viitoare cu ea** — `followGroup`, chemat din
`updateGroup` în aceeași tranzacție. Editarea schimba grupa și atât: opt săptămâni de ore rămâneau pe
ziua veche, iar generarea de a doua zi scria opt pe cea nouă. Acum fiecare oră încă acolo unde a pus-o
generatorul (pe locul ei, la ora și în sala vechi, neținută, neanulată) se mută **în săptămâna ei** pe
ziua nouă — luna în care se facturează e a lunii în care cade lunea (E15 S9). Rămân pe loc ora mutată
de birou dinadins, ora ținută sau anulată, și ora a cărei zi nouă a trecut, e închisă de calendar
sau are deja o oră a grupei; toate dau totuși locul săptămânii zilei noi, ca generarea să nu scrie
una lângă ele. **Familiile află o dată**, prin șablonul `group-schedule-changed`, nu o dată pe oră:
opt ore care urmează grupa sunt o singură schimbare.

**Orarul ascultă de calendarul școlar, iar calendarul anulează, nu șterge.** `NonTeachingPeriod`
(E12 S2) e un **interval**, nu o zi: o vacanță de două săptămâni e un rând, o sărbătoare legală e un
rând cu aceleași date la ambele capete. `location` gol înseamnă „toată școala". Trei reguli care se
încalcă ușor:

- `generateForGroup` sare peste zilele acoperite și le numără în `skipped`. **Grupele se încarcă cu
  `relations: { room: { location: true } }`** — fără `location`, fiecare grupă se citește ca fiind
  fără locație și orice interval local golește orarul întregii școli, tăcut, fiindcă ședințele pe
  care le scoate pur și simplu nu apar. Testul unitar nu prinde asta: fixture-ul lui are relația
  oricum populată.
- Adăugarea unui interval trece ședințele din el în `CANCELLED` și le scrie numele intervalului în
  `notes`. Ștergerea intervalului **nu** le reactivează — o ședință anulată de vacanță și una anulată
  fiindcă profesorul a fost bolnav arată la fel după aceea. Reactivarea e per ședință. **O ședință cu
  prezențe nu se anulează** — s-a ținut, iar anulată ar ieși din numărătoarea lunii (E15 S9) cu
  copiii marcați în ea —, iar **un copil mutat de birou într-o ședință anulată e eliberat**
  (`clearOn`), ca la anularea de mână, și reapare printre cei de mutat. Nu se scrie nimănui, dinadins:
  o vacanță nu e o veste.
- Suprapunerile sunt refuzate simetric, indiferent de locație (`PERIOD_OVERLAPS`). Regula mai îngustă
  ar face acceptarea să depindă de ordinea în care au fost tastate cele două intervale.

**O oră schimbată e trei scrieri într-o singură tranzacție** (E12 S5). Anularea, mutarea și
reactivarea trec prin `dataSource.transaction`: rândul, plasările copiilor mutați în ora aceea și
mesajele către familiile grupei stau sau cad împreună — o oră anulată fără ca nimeni să afle e exact
defecțiunea pentru care există coada. `ClassSessionNotifier` scrie **un mesaj per părinte**, nu per
copil, iar cheia de deduplicare poartă **a câta anunțare e pentru ședința aceea**, nu ziua: o oră
anulată, reactivată și anulată din nou — chiar în aceeași după-amiază — trebuie anunțată de două
ori, în timp ce doi admini care apasă în aceeași clipă nu. Reactivarea are mesaj din același motiv —
familiile au fost anunțate că nu se ține. Copiii mutați în ora anulată se eliberează în aceeași
tranzacție, prin `ReplacementService.clearOn` — **după** `notifyCancelled`, și ordinea e regula, nu
stilul: notificatorul citește plasările ca să afle care sunt familiile vizitatoare, iar una ștearsă
deja e o familie pe care n-o mai vede. Anularea **nu** compensează cu nimic: prețul e pe ședință
ținută (`pricing.ts`), deci ora care nu s-a ținut nu se facturează, iar un drept pe deasupra ar fi a
patra lecție la prețul a trei — o decizie de preț, nu o consecință a butonului. Dacă familia
trebuie totuși mutată undeva, se mută, din `/admin/absente`.

**O oră care nu se poate ține se recuperează dintr-un singur act, cheiat pe grupă și zi** (E12 S9).
`RescheduleService` (`apps/api/src/modules/class-session/reschedule.service.ts`) nu pornește de la
un id de ședință, fiindcă ora poate să nu fie un rând: o sărbătoare trecută în `/admin/calendar`
înainte de generare lasă ziua goală, una trecută după o anulează. Din amândouă stările — și din
cea programată — `POST /class-sessions/reschedule` scrie **exact un rând** pentru săptămâna grupei:
îl editează pe cel care există (și îl pune la loc dacă era anulat, cu nota de anulare păstrată) sau
îl scrie pe ziua-țintă. Nu trece prin `reinstateSession` + `moveSession`: ar fi două mesaje către
familie, dintre care primul, „ora se ține", e neadevărat pe o zi liberă. Ținta trebuie să fie **în
aceeași săptămână** — `RESCHEDULE_OUT_OF_WEEK` — fiindcă luna facturată e a lunii în care cade lunea
săptămânii (E15 S9), iar `moveSession` **nu** verifică asta, prin decizie amânată, nu prin scăpare.
Ferestrele din `GET /class-sessions/reschedule-windows` sunt pe grila școlii — orele de început ale
grupelor active de la adresa grupei, în sălile ei, regula pură fiind în `reschedule.rules.ts` — și
„liber" înseamnă doar sala: platforma nu are profesori (E09 e scos din MVP), deci o fereastră în care
același om predă în cealaltă sală se oferă cu convingere.

**O absență anunțată nu marchează pe nimeni absent** (E12 S3). `AbsenceNotice` leagă copilul de o
**ședință**, ca tot ce vorbește despre o oră de curs. Catalogul rămâne al profesorului: un copil al
cărui părinte a anunțat poate veni totuși. Trei lucruri de ținut minte: `inTime` se **îngheață la
scriere** — eligibilitatea e un fapt despre momentul anunțului, iar o valoare derivată la citire
și-ar schimba răspunsul pe măsură ce ora intră în trecut; un al doilea anunț **modifică** rândul, nu
adaugă unul (`UQ_absence_notice_child_session`), și rejudecă `inTime`; iar termenul se compară pe
**ceasul școlii**, prin `Intl` pe `Europe/Bucharest` — prin UTC, un anunț de la 01:00 ora Bucureștiului
ar fi judecat ca fiind ziua dinainte. Regula însăși („luni la 12:00 din săptămâna ședinței") e o linie
în `apps/api/src/modules/attendance/absence-notice.rules.ts`. **Biroul notează și mută din
`/admin/absente`**, iar ecranul arată `inTime` fără să-l facă poartă: de când notează adminul,
coloana spune când a tastat el, nu când a sunat familia, deci un buton „Mută" ascuns pe „după
termen" ar fi ținut de cod o regulă pe care S3 a lăsat-o dinadins biroului. Cifra celor de mutat stă
în meniu, prin `unplacedAbsencesStore`, din același motiv ca restanța de documente din E17 S8.
**Iar familia vede mutarea cât timp ora în care a fost mutat copilul e încă în față** (revizuirea din
25 septembrie 2026): `GET /attendance/absences` ține un anunț cât timp ora lui **sau** ora mutării
sunt azi ori mai încolo, pe ziua școlii. Cheiată doar pe ora pierdută, lista familiei pierdea
mutarea de luni pe sâmbătă a doua zi după luni, iar portalul spunea „nicio mutare" despre singurul
lucru pe care familia mai avea de făcut. Pe tabloul de bord, „următoarea oră" sare peste ora pe care
copilul o pierde și arată ora în care a fost mutat, cu grupa ei.

**`User.passwordHash` e `select: false`: nu iese din bază decât cerut pe nume.** Până în septembrie
2026 nu era, și singurul lucru dintre hash-ul unei familii și un browser era forma fiecărei
interogări — iar două au greșit-o: rândul întors de `POST /attendance/absences` și cel întors de
`PUT /children/:childId`, al doilea chiar către părinte. Consecințele de ținut minte: **singurul
cititor e `AuthService.login`**, care îl cere cu `.addSelect('user.passwordHash')` — un al doilea
loc care compară parola trebuie să facă la fel, altfel `bcrypt.compare` primește `undefined` și
refuză pe toată lumea; inserările și `update()` îl scriu oricum, fiindcă `select` guvernează doar
citirile. Și **contul tot nu se întoarce** acolo unde a fost încărcat doar ca să verifice
proprietatea: `AbsenceNoticeService.forResponse`, `ChildService.updateChild` și
`ProjectService.withoutAccount` scot `parent.user` înainte să răspundă, ca `ProfileService`, fiindcă
pe rând stă și `rejectionReason`, nota adminului pe care un părinte respins n-are de ce s-o
citească. Al treilea a venit ultimul și arată de ce regula are nevoie de mătură: `PROJECT_RELATIONS`
încarcă contul **numai** pentru ramurile de proprietate din `findByPublicId` și `findOne`, iar toate
trei răspunsurile îl dădeau înapoi — inclusiv singura rută pe care i-o trimite școala părintelui
prin email, `GET /projects/link/:publicId`. Hash-ul nu mai putea pleca pe acolo, fiindcă între timp
coloana devenise `select: false`; restul rândului putea. **Se scoate copiind, nu golind pe loc**:
`child.parent` e o relație încărcată, iar un câmp șters ajunge în orice altceva ține același obiect.
`password-hash.e2e-spec.ts` mătură rutele care au cont la un join distanță și verifică că
`passwordHash` nu apare nicăieri în corp, iar login-ul încă merge.

**Recuperarea nu e un credit, e o mutare pe o săptămână — și n-a mai fost un credit din E12 S4.**
`MakeUpCredit`, `MakeUpCreditService`, `AttendanceService.settleMakeUp`, `expiresOn` și tabela
`make_up_credits` **nu mai există**; dacă le găsești pomenite undeva, textul e vechi, nu codul.
Un jeton descrie o școală în care familia alege ora; asta citește luni absențele anunțate și mută
copiii între grupe cu mâna, fiindcă „ce grupă are un scaun liber și un profesor care mai poate lua
un copil de nouă ani" nu e o interogare. Deci toată tabela s-a strâns într-o coloană nullable pe
anunțul care a provocat-o: `AbsenceNotice.replacementSession`, scrisă de `ReplacementService`
(`apps/api/src/modules/attendance/replacement.service.ts`) din `/admin/absente`. Patru consecințe:

- **`null` înseamnă două lucruri, și le desparte calendarul**: cât săptămâna e în față, „nu s-a
  ocupat nimeni încă"; după ce a trecut, „nu s-a întâmplat". Nu adăuga o coloană de stare — ar fi al
  doilea loc care spune ce spune deja data.
- **Fereastra e săptămâna în care s-a pierdut ora** (`replacement.rules.ts`), fiindcă un copil nu
  poate sta cu altă grupă într-o săptămână care a trecut. Ce oprește o mutare e ora oferită
  (`canBackfill` — ședința de înlocuire n-a început încă), **nu** `inTime`: ăla rămâne un fapt despre
  anunț, iar biroul care tastează marți ce a sunat luni n-are de ce să coste familia săptămâna.
- **Marcarea nu mai consumă nimic.** `AttendanceType.MAKE_UP` se scrie în continuare singur pentru
  orice copil marcat în afara grupei lui, dar e o observație despre unde a stat, nu decontarea unui
  drept.
- **Locul liber se numără pe ședință**: un copil mutat temporar ocupă un scaun ca o probă (D7), deci
  înscrieri în vigoare plus copiii mutați în acea ședință — nu `occupancyOf`, care e despre grupă.
  Numărătoarea stă în `EnrollmentService.freeSeatsAt` / `freeSeatsAtSessions`, lângă `occupancyOf`:
  D7 are un singur proprietar, iar cei trei care întreabă — mutările, programarea la probă și
  rezervarea ei — obțin același răspuns. **Și se numără ținând lacătul**: `lockGroup` se ia pe rândul
  grupei _înaintea_ numărătorii, în aceeași tranzacție cu scrierea. Verificat-apoi-scris fără lacăt
  a fost exact defecțiunea pe care E20/S2 a închis-o pentru grupă și a lăsat-o deschisă pentru
  ședință: două programări la aceeași oră citeau amândouă ultimul loc, iar la `ReplacementService`
  verificarea stătea chiar în afara tranzacției care o folosea. Lacătul se pune înaintea numărului
  pe care îl apără; a doua luare, în `enrol`, e no-op în aceeași tranzacție. **Iar ora se citește a
  doua oară după lacăt** (revizuirea din 25 septembrie 2026) — starea, sala și grupa, nu copiile de
  dinainte —, cu rândul ei blocat `FOR SHARE`: o anulare nu ia lacătul grupei, deci una încă în zbor
  s-ar fi comis după citire, iar eliberarea plasărilor ei ar fi ratat-o pe cea scrisă acum.
- **A patra oară a fost pe partea care _eliberează_ locul**, și acolo victima nu e cel care se
  așază, ci cel care așteaptă. `offerFreedSeat` număra fără lacăt, deci un `enrol` care lua ultimul
  scaun se comitea nevăzut, iar familia din capul listei era anunțată că are locul 48 de ore pentru
  un scaun deja ocupat — exact rezultatul pentru care există lista. Lacătul stă acum **în**
  `offerFreeSeats`, lângă numărul pe care îl apără, nu în apelanți, ca o cale nouă care eliberează
  un loc să-l moștenească în loc să și-l amintească. Iar căile care scriu un rând — o înscriere
  închisă, o probă decisă, un `WaitlistEntry` — îl iau **înaintea** rândului: `enrol` ia grupa și
  _apoi_ decontează lista, deci ordinea inversă e singurul ciclu de deadlock din zonă.
- **A cincea oară, scrierea însăși** (revizuirea din 25 septembrie 2026). Lacătul serializa, dar
  fiecare cale scria rândul pe care îl citise _înainte_ de lacăt, fără să întrebe dacă mai e în
  starea aia: două apăsări pe „închide" eliberau locul de două ori, iar măturarea ofertelor expirate
  suprascria ca „expirat" un „nu" dat între timp și îi trimitea familiei mailul greșit. Acum `close`,
  `resolveTrial`, `transfer`, `expireLapsedOffers` și `removeFromWaitlist` scriu **condiționat** —
  numai dacă rândul e încă în vigoare, încă probă, încă ofertă — și nu fac nimic mai departe când
  n-au mișcat nimic.
- **Fiecare loc liber se oferă, nu unul pe apel.** `offerFreeSeats` oferea exact un loc, pe teoria
  că două locuri eliberate înseamnă două apeluri — dar jumătate din ușile care eliberează un loc nu
  chemau deloc: transferul, un copil șters, o familie ștearsă, o capacitate mărită. Acum dă câte un
  loc fiecărei familii din capul listei, cât sunt locuri libere, iar numărul e sigur de folosit
  întreg fiindcă e luat sub lacăt și scade deja ofertele date (`held`). Ștergerile trec prin
  `lockSeatsHeldBy` înainte de `DELETE` și prin `offerFreeSeatsIn` după el, fiindcă o cascadă nu
  întreabă pe nimeni. **O grupă inactivă nu primește oferte** (`GROUP_INACTIVE` ar refuza-o la
  ușă), iar o familie fără adresă lasă un rând `undeliverable`, nu o linie de log (E17/S5).

**Proiectele elevilor merg într-o singură direcție, și nimic nu pleacă singur** (E14). Un fișier
salvat de profesor în folderul copilului, pe partajarea de rețea, e urcat de `apps/agent` prin
`POST /projects/ingest`, apare pe ecranul grupei în starea `nou`, iar un admin bifează și apasă. Abia
atunci se scriu mesajele în `outbox`, unul per **părinte** — nu per copil, ca un părinte cu doi copii
să primească un singur email. Trei consecințe de ținut minte:

- **Cheile de obiect se derivă, nu se stochează.** `projectFileKey(projectId, versionId, fileId)` și
  `projectThumbnailKey(projectId)` din `apps/api/src/modules/project/project.keys.ts` sunt singura
  definiție a locului. Numai identificatori, niciodată numele copilului — cheia ajunge în URL-uri
  semnate și în loguri, iar lecția e deja plătită pe facturi.
- **Încărcarea e idempotentă pe conținut**, nu pe nume: `{childId}:{sha256}`, cu index unic pe
  `project_files.ingestionKey`. Cheia e scopată pe copil, ca doi copii care salvează același fișier
  de pornire să nu se anuleze unul pe altul.
- **Un părinte vede doar ce a fost trimis.** Restrângerea e în serviciu, ca peste tot, și adaugă
  `status = 'sent'` pe lângă restrângerea pe utilizator. Portalul nu are voie să fie portița prin
  care se vede ce n-a verificat încă nimeni.
- **Un eșec care nu se poate repeta cu folos e un refuz, nu o eroare.** Agentul tratează eșecul ca
  „mai încearcă" și lasă fișierul pe partajare — corect pentru o rețea picată, fiindcă partajarea
  _e_ coada. Un `.url` fără nicio adresă în el nu mai avea însă ce să încerce: rămânea în folder,
  era găsit din nou la fiecare trecere, scria un avertisment la fiecare treizeci de secunde și ținea
  câmpul de sănătate al agentului roșu pe un defect pe care nimeni nu-l putea repara — exact ce
  descrie comentariul din `Agent.pass` despre erorile care rămân după ce cauza lor a trecut. Are
  acum motiv propriu, `link_without_address`, deci pleacă în `_neatribuite` ca orice alt refuz. Dacă
  adaugi o cale nouă de eșec, prima întrebare e dacă a doua încercare poate da alt răspuns.
- **O cheie de deduplicare are o durată, iar cea a fișierelor neatribuite e „cât stă deschis".**
  `unassigned_files.reportKey` e `{grupă}:{cale}` și avea un unic simplu — ceea ce se citește ca
  „raportează fiecare loc o dată", dar promite că un fișier apărut în rădăcina grupei în septembrie
  nu mai poate apărea acolo niciodată. Cea mai frecventă cauză a lor e obiceiul unui profesor, deci
  reapare în octombrie: a doua oară inserarea era ignorată, agentul muta fișierul în
  `_neatribuite` exact ca prima dată, iar pe ecran nu apărea nimic — fișierul pleca din folder în
  tăcere, adică fix ce promite S2 că nu se întâmplă. Acum indexul e **parțial**,
  `WHERE "resolvedAt" IS NULL`, ca `UQ_enrollments_one_in_force`: unic e ce e în vigoare, nu ce a
  fost vreodată. Restul cheilor din repo aveau deja discriminatorul în ele — ziua școlii la anunțuri
  și la mementouri, a câta anunțare la o ședință, id-ul plății la chitanță —, deci asta era singura
  cheiată pe o identitate care nu se schimbă niciodată. Dacă adaugi una, întreabă ce se întâmplă a
  doua oară când lucrul ăla se întâmplă din nou. Mementoul probei a fost al doilea caz, găsit în
  revizuirea din 25 septembrie 2026: era cheiat pe lead, iar de când ora unui lead se poate schimba —
  o probă mutată în altă grupă — cheia poartă și ora (`trial-reminder:<lead>:<oră>`, la fel
  recontactarea).

**Miniatura are două drumuri, iar al doilea nu e o coadă nouă** (E14 S3b). O imagine primește poza
în cererea care o încarcă, după commit; un video și un `.sb3` n-au cum — primul fiindcă octeții lui
nu trec niciodată prin proces (drumul cu URL semnat există tocmai pentru asta), al doilea fiindcă e
o arhivă plus un teanc de compoziții. Alea le face `ProjectThumbnailJob`, la cinci minute, cinci
proiecte pe trecere. Patru lucruri:

- **Coada e `hasThumbnail` plus `thumbnailAttemptedAt`, nu o tabelă.** „N-are poză și n-a încercat
  nimeni" e deja o întrebare pe care o răspund două coloane; o tabelă de rânduri de procesat lângă
  ele ar fi al doilea răspuns, care divergează prima dată când un proiect e șters. Și **nu prin
  `outbox`**, cum cerea story-ul scris înaintea cozii: acolo un rând e un mesaj cu destinatar,
  subiect și corp, iar un rând care n-ar fi un mesaj ar strica exact tabelul din care se citește ce
  a primit o familie.
- **Lipsa lui ffmpeg nu consumă încercarea.** `ThumbnailToolMissingError` e singura eroare care lasă
  rândul nestampilat, iar prima amânare oprește trecerea — restul candidaților sunt pe cale să
  întâlnească același host. E lecția plătită de `recordFailure` din outbox: un eșec de configurare
  care consumă încercări îngroapă coada exact în deploy-ul în care unealta lipsește. Consecința: o
  restanță de videouri se desenează singură la primul tick de după `apt install ffmpeg`.
- **`.sb3` se desenează, și asta a fost un spike cu răspuns scris.** E un ZIP cu `project.json`
  înăuntru; `sb3.ts` citește arhiva de mână — din același motiv pentru care `file-types.ts` își
  scrie semnăturile de mână — și așază fiecare sprite din trei conversii: `bitmapResolution`
  (editorul exportă bitmap-urile la dublu), `size` ca procent, și ancora pe **centrul de rotație**,
  cu y în sus. Oricare dintre ele greșită dă o poză plauzibilă a unui proiect pe care nu l-a făcut
  nimeni. Se desenează proiectul **așa cum a fost salvat**, nu cum arată după steagul verde.
- **Un sprite se decupează la scenă înainte de compunere.** Scratch lasă sprite-urile să atârne pe
  margine și copiii le parchează acolo tot timpul; sharp refuză un strat care nu încape în pânză,
  deci fără decupare rezultatul nu e o poză strâmbă, e `null`.

**Locația nu e un câmp pe grupă, ci o consecință a sălii.** `Group.room` e obligatoriu, `Room.location`
la fel, deci fiecare grupă știe unde se ține fără să poată contrazice sala. Ștergerile sunt
`RESTRICT` în ambele direcții, verificate întâi în serviciu, ca refuzul să ajungă la client ca 409 cu
explicație, nu ca 500 de la driver.

**Familia, în schimb, e `CASCADE` în trei direcții deodată, și de aia nu se șterge de nicăieri.**
`children.parent_id`, `invoices.parent_id` și `discounts.parent_id` sunt toate `CASCADE`, iar
`payments.invoice_id` e `CASCADE` după ele — deci un singur `DELETE` pe `profiles` lua copiii, toate
prezențele lor, proiectele, facturile emise și încasările înregistrate. Măsurat pe o bază reală:
1 copil, 1 înscriere, 1 factură, 1 plată înainte; zero din fiecare după. `ProfileService.deleteProfile`
refuză acum, cu cod propriu, dacă familia are facturi (`PROFILE_HAS_INVOICES`) sau copii
(`PROFILE_HAS_CHILDREN`) — ruta rămâne pentru rândul tastat greșit, atât. **Ștergerea unei familii e
E07 S4, `/admin/stergeri`**: aia păstrează facturile, golește rândul, curăță bucket-ul și scrie cine
a apăsat. Dacă adaugi o a doua ușă care șterge o familie, prima întrebare e ce ia cu ea — și
răspunsul nu se citește din entitate, fiindcă `onDelete` stă pe partea copilului.

**Același lucru, un nivel mai jos: `DELETE /children/:id`.** Tot ce atârnă de un copil e `CASCADE`,
inclusiv catalogul și proiectele — măsurat la fel: un copil, o înscriere și un marcaj înainte, zero
din fiecare după, 200, de pe tokenul părintelui. `ChildService.deleteChild` refuză acum dacă
copilul are prezențe (`CHILD_HAS_ATTENDANCE` — catalogul e ce s-a întâmplat, iar E15 S9 facturează
din el) sau lucrări (`CHILD_HAS_PROJECTS` — cheile de obiect se derivă din id-uri, deci după
ștergerea rândurilor nimic nu mai poate spune ce era de scos din bucket). **Înscrierile singure nu
blochează**, dinadins: o înscriere fără niciun marcaj consemnează o intenție, nu un fapt, iar
refuzul pe ea ar închide singura folosință rămasă rutei — un copil adăugat și repartizat din
greșeală. Ștergerea din E07 S4 nu trece pe aici: `ErasureService` șterge rândurile prin tranzacția
lui, după ce citește cheile.

**Retragerea e o zi consemnată, iar ștergerea la termen e aceeași ștergere** (E04 S5, E22 S3).
`Profile.withdrawnAt` e ziua în care școala a notat că familia a plecat — pusă de un admin din pagina
familiei, prin `POST /privacy/retention/:profileId`, și anulabilă până la termen —, iar
`RetentionJob` (03:45, ceasul școlii) șterge familiile retrase de peste `FAMILY_RETENTION_MONTHS`
chemând `ErasureService.erase` cu `SYSTEM_ACTOR` și cu motivul pentru jurnal. Cinci reguli:

- **Nu deduce retragerea din tăcere.** Nici din ultima autentificare, nici din ultima factură, nici
  din ultima înscriere închisă: familia care ia o pauză de o vacanță e exact cea pe care ar șterge-o
  o deducție. Retragerea e un act al cuiva, cu o zi pe el.
- **E refuzată cât timp ceva e încă deschis** (`FAMILY_HAS_ENROLMENTS_IN_FORCE`,
  `FAMILY_ON_WAITLIST`), fără să închidă ea nimic: o înscriere se încheie prin `EnrollmentService`,
  care eliberează locul și îl oferă listei. Invers, `enrol` anulează singur o retragere, în aceeași
  tranzacție — o familie cu un copil în grupă n-a plecat.
- **O familie care datorează bani nu se șterge la termen**: restanța vine din `ArrearsService`, iar
  ecranul `/admin/stergeri` spune de ce a rămas. Golit, rândul ar lăsa școala cu o datorie pe care
  n-o mai poate cere nimănui.
- **Nici una cu o factură încă în drum spre SmartBill**, plătită sau nu (`FISCAL_WORK_OUTSTANDING`:
  în coadă, în aer, la revizie sau refuzată). Documentul fiscal se scrie din numele familiei **când
  pleacă**, deci ștearsă înainte, factura ar ajunge în SPV pe numele unui rând golit.
  `ErasureService.erase` refuză la fel, cu `FAMILY_HAS_FISCAL_WORK`: contabilitatea se termină
  întâi.
- **Numerele sunt propuneri și stau într-un singur loc**, `retention.rules.ts`, de unde pleacă și pe
  sârmă: 12 luni pentru familie, pentru cererile de probă fără înscriere și pentru copiile mesajelor,
  30 de zile după expirare pentru linkurile de confirmare și de resetare. Nota de confidențialitate
  §7 le promite; dacă schimbi unul, schimbi și nota.

**Un rând fără drum către familie se revendică doar printr-o adresă pe care o garantează cineva**
(E07 S4, revizuirea din 25 septembrie 2026). `outbox` și lead-urile tastate de birou n-au relație
către `Profile`, deci exportul, ștergerea și retenția le caută după adresă — iar adresa de pe un
profil e ce a tastat cineva în el. `PUT /profiles/:id` verifică doar că n-o mai ține alt _profil_:
adresa biroului trece, numărul unei familii care a sunat și nu s-a înregistrat trece. Potrivit așa,
`GET /privacy/export` îi dădea oricui își făcea cont copilul altei familii — nume, data nașterii,
proba — și subiectul fiecărui mesaj al biroului, iar ștergerea le lua cu ea. Regula e
`vouchedAddresses` din `apps/api/src/modules/privacy/family-rows.ts`, citită de toate trei:

- **un cont: e-mailul, după confirmare** — linkul deschis e singura dovadă că familia citește adresa,
  iar orice editare a adresei golește ștampila;
- **o familie fără cont: amândouă, cum le-a tastat biroul** — nimeni altcineva nu poate edita rândul;
  e linia pe care o trage `announcement.service.ts` pentru „confirmat";
- **telefonul unui cont: niciodată** — nimic din platformă nu dovedește un număr. Prețul e un lead cu
  telefon și fără e-mail, pe care niciun flux nu-l mai găsește pentru o familie cu cont; pleacă la
  termenul lui.

`user` trebuie încărcat: `null` e „fără cont", `undefined` e „n-a cerut nimeni relația" și nu
revendică nimic — citit invers, un apelant care uită join-ul ar da fiecărei adrese tastate
încrederea biroului. Dacă adaugi a patra căutare după adresă, trece prin aceeași funcție:
unicitatea printre profiluri nu face o adresă a familiei care a tastat-o.

**Auth** — două roluri, `ADMIN` și `PARENT` (`apps/api/src/enum/role.enum.ts`). `register` creează
întotdeauna `PARENT`; adminul se promovează manual prin DB sau `PUT /users/:id`. JWT în pereche
access (15 min) / refresh (7 zile), cu secrete distincte în `apps/api/src/constants/jwtConstants.ts`.

**Un cont de părinte trece prin două porți înainte să fie folosibil** (E11 S2). Sunt două coloane
independente pe `User`, nu un singur status: `emailConfirmedAt` — părintele a deschis linkul trimis
la înregistrare — și `approvalStatus` — un admin a recunoscut familia. „Activ" nu e stocat, e derivat
prin `isAccountActive` din `apps/api/src/entities/user.entity.ts`, fiindcă o a treia coloană ar fi
liberă să contrazică primele două. Adminii sunt exceptați: nimeni nu-i confirmă și nu-i aprobă.
**O adresă schimbată închide poarta la loc.** `PUT /profiles/:id` golește `emailConfirmedAt` și
trimite un link nou către adresa nouă, în aceeași tranzacție cu editarea — fiindcă „confirmat"
înseamnă că familia a dovedit că citește adresa _aceea_, iar după mutare n-a dovedit nimic. Regula
era deja scrisă, în comentariul lui `AuthService.resendConfirmation`: acela refuză să primească o
adresă tocmai ca nimeni cu o sesiune să nu poată trimite confirmarea unde vrea, și lasă redeschiderea
porții în seama editării care a mutat-o. Editarea n-o făcea. Cine apasă nu contează: un admin care
corectează o greșeală de tastare n-a dovedit mai mult decât familia. Compoziția — rând, token, link
randat, mesaj în coadă — e una singură, `EmailConfirmationService.issueAndSend`, iar cei trei
apelanți i-o dau pe a lor `EntityManager`.

**Și linkul vechi încetează să meargă în clipa aia.** Poarta închisă de editare se redeschidea
singură: linkul emis înainte de mutare mai trăia restul celor 48 de ore, iar un clic pe el punea
`emailConfirmedAt` la loc — pe o adresă pe care nu o dovedise nimeni. Ce autorizează ștampila aia e
tot: `queueOrRecord` o citește înainte să scrie la o adresă, iar `isAccountActive` înainte să lase un
copil într-o grupă. Deci cine putea citi adresa _veche_ — un străin, dacă motivul editării a fost o
greșeală de tastare — putea declara dovedită adresa nouă. `EmailConfirmation.email` purta de la
început adresa pentru care a fost emis linkul; nimeni n-o întreba. `confirm` refuză acum când nu mai
e adresa de pe fișă, cu cod propriu (`CONFIRMATION_TOKEN_SUPERSEDED`): cel care ține linkul n-a
greșit cu nimic, iar ieșirea e linkul mai nou, deja în inbox — altă propoziție decât „expirat".
Comparația trece prin `sameAddress` din `apps/api/src/common/same-address.ts`, aceeași pe care o
folosește `movesTheAddress`: una decide că editarea _e_ o mutare, cealaltă că linkul e vechi, și
n-au voie să nu fie de acord ce înseamnă „aceeași cutie poștală" — scrisă mai strict aici, o editare
care schimbă doar majusculele ar omorî singurul link viu al familiei.

Porțile se pot deschide în orice ordine, iar singurul lucru pe care îl blochează efectiv e
repartizarea unui copil într-o grupă (`PARENT_ACCOUNT_NOT_ACTIVE`). **Un cont neactiv se poate
autentifica** — portalul îi arată ce mai lipsește și butonul de retrimitere a linkului; un login care
refuză fără să explice ar lăsa familia să nu distingă „încă nu" de „stricat".

**Parola uitată e al treilea link din familia asta, și singurul care deschide contul.**
`PasswordResetService` (`apps/api/src/modules/auth/password-reset.service.ts`) stă lângă
`EmailConfirmationService` din același motiv pentru care acela stă lângă `AuthService`: unul e despre
a dovedi cine ești la fiecare cerere, ăsta despre singura clipă în care se schimbă chiar
credențialul. Tabela `password_resets` e modelată pe `email_confirmations`, care e modelată pe
`sessions` — **tokenul nu se stochează niciodată**, doar un SHA-256 al lui. Șase reguli, și cinci
dintre ele sunt diferențe față de linkul de confirmare, nu asemănări:

- **O oră, nu patruzeci și opt.** Linkul de confirmare are voie să aștepte duminica dimineața a
  cuiva, fiindcă tot ce dovedește e o adresă. Ăsta deschide un cont, iar fiecare oră în care rămâne
  valabil e o oră în care poate fi găsit într-un mail redirecționat sau într-o cutie de familie.
  Cine întârzie cere din nou — costă un clic, față de o ușă lăsată deschisă două zile.
- **A doua cerere o omoară pe prima.** Exact invers față de `resendConfirmation`, și dinadins: două
  tokenuri vii sunt două șanse pentru cine n-ar trebui să aibă niciuna, iar părintele care a apăsat
  de două ori se uită oricum la mailul mai nou. La confirmare, prețul invalidării e o familie care
  dă clic pe mailul vechi și e certată pentru asta; aici, prețul **ne**-invalidării e o ușă deschisă.
- **Nimic nu spune dacă adresa are cont.** `POST /auth/forgot-password` răspunde aceeași propoziție
  fie că a scris un rând, fie că n-a găsit nimic, fie că profilul e unul tastat de admin fără cont;
  iar `reset` dă **același** `RESET_TOKEN_INVALID` pentru un token necunoscut, unul expirat, unul
  folosit și unul emis pentru o adresă pe care contul n-o mai are. Un endpoint care distinge e un
  endpoint care enumeră, iar ăsta ar enumera familiile unei școli de copii. Ce **nu** e identic e
  durata: o adresă cunoscută randează un șablon și scrie două rânduri, una necunoscută se întoarce
  după un singur `SELECT`. Nivelarea ar însemna să facem munca și pentru adresele fără cont, iar
  ruta e limitată la trei pe minut — scris aici ca să nu fie descoperit mai târziu.
- **Adresa e înghețată la emitere și recitită la folosire.** E raționamentul
  `CONFIRMATION_TOKEN_SUPERSEDED` cu miza ridicată: dacă adresa a fost corectată fiindcă era greșit
  tastată, cutia în care a ajuns linkul poate fi a unui străin, iar un token care ar mai merge ar fi
  drumul lui înăuntru. Comparația trece prin acelaşi `sameAddress`.
- **Porțile contului nu se consultă.** O familie neconfirmată sau neaprobată își poate reseta
  parola: `isAccountActive` guvernează ce poate _face_ un cont, iar alegerea unei parole nu e printre
  acele lucruri. Un refuz aici ar lăsa o familie încuiată afară cu o ușă care se deschide doar după
  ce apasă altcineva un buton.
- **Se revocă toate sesiunile**, la resetare și la schimbarea din cont deopotrivă. Cine cere o
  resetare e ori încuiat afară, ori îngrijorat, iar în al doilea caz sesiunile rămase vii sunt exact
  cele ale persoanei de care se teme. `AuthGuard` nu atinge `sessions`, deci un access token emis
  înainte mai merge până la cincisprezece minute — compromisul deja documentat, și locul de schimbat
  dacă vine vreodată o cerință de revocare instantanee.

**O cutie poștală e a unei singure familii, oricum ar fi scrisă.** Înregistrarea și
`forgot-password` caută adresa după `lower(email)`, dar cele două editări de profil comparau exact,
deci o a doua familie putea ține `Ana@Example.com` lângă `ana@example.com`, iar `forgot-password`
găsea două rânduri și îl lua pe primul venit: linkul putea pleca pentru contul celuilalt. Acum
editările compară ca restul (`emailTakenByAnother` din `ProfileService`, cu rândul propriu scos, ca
o familie să-și poată schimba doar majusculele), iar indexul unic `UQ_profiles_email_lower` ține
linia și pentru două cereri deodată. E un index pe expresie, scris de migrare: TypeORM nu-l
poate descrie, deci nu stă pe entitate — și nici nu-l atinge, deci `check:schema` nu-l vede ca drift.

`POST /auth/change-password` **cere parola actuală**, și nu e ceremonie: un access token ține un
sfert de oră și e onorat fără să se atingă `sessions`, deci un telefon împrumutat sau un tab uitat
deschis ajunge până la rută. Ce știe doar proprietarul e ce oprește schimbarea să fie la îndemâna
oricui are fila deschisă. Cititorul hash-ului e al doilea din tot repo-ul, după `AuthService.login`,
și îl cere pe nume cu `.addSelect('user.passwordHash')` — fără asta, `bcrypt.compare` primește
`undefined` și refuză pe toată lumea.

**Înregistrarea are doi pași, iar al doilea nu se poate sări.** `register` cere cinci câmpuri —
utilizator, parolă, prenume, nume, email — și scrie în aceeași tranzacție contul, un `Profile`
**coajă** (atât cât să știm cine e și unde pleacă linkul de confirmare), tokenul de confirmare și
mesajele din outbox. Restul — telefon, adresă și contactul de urgență, toate trei — se cer imediat
după, pe `/user/profile-setup`, prin `PUT /profiles/:id`, unde sunt **obligatorii**. E11/S2 avusese
dreptate să strângă cei doi pași într-unul: ecranul al doilea de atunci era _opțional_, deci o
familie putea rămâne pentru totdeauna fără nicio cale de contact. Dar rezultatul a fost un prim
ecran cu zece câmpuri obligatorii, fix în epicul în care E20 coboară bariera de intrare — iar cine
abandonează la câmpul opt nu e o familie cu date incomplete, e o familie pe care școala n-a
văzut-o. Distincția față de starea dinainte de S2 e tot ce contează: pasul doi e acum de netrecut.

„Complet" nu se stochează, se derivă — `isProfileComplete` din
`apps/api/src/entities/profile.entity.ts` — din același motiv pentru care nu există o coloană
„activ": o a treia valoare ar fi liberă să contrazică cele șase câmpuri pe care le rezumă. Pleacă pe
sârmă ca `CurrentUser.profileComplete`, iar frontend-ul **nu o recalculează**: middleware-ul care
redirecționează și endpoint-ul care refuză repartizarea trebuie să spună același lucru despre
aceeași familie.

Poarta e tot repartizarea într-o grupă, dar cu cod propriu: `PARENT_PROFILE_INCOMPLETE`, separat de
`PARENT_ACCOUNT_NOT_ACTIVE`, fiindcă unul așteaptă un admin și celălalt așteaptă părintele — iar
trimiterea la ușa greșită înseamnă o familie care așteaptă pe cineva ce n-are ce face. Se verifică
în `EnrollmentService.enrol`, numai pentru profilurile **care au cont**: programarea publică la
probă din E20 scrie tot un `Profile` coajă, fără user, fără email și fără telefon, iar o poartă
oarbă la asta ar închide exact ușa pe care epicul o deschide. Nu se verifică la `transfer`: o
familie deja înscrisă nu se blochează retroactiv.

Celălalt drum către un `Profile` — adminul care introduce o familie de la telefon, prin
`POST /profiles` — rămâne exact cum era, cu toate câmpurile opționale. Sunt două uși cu reguli
diferite, fiindcă au surse de adevăr diferite. Un test ține fluxul adminului viu, ca să nu fie
strâns din greșeală odată cu `register`.

**Formularul are două bife, iar a doua nu e o exagerare de avocat** (E22 S4). Codul civil
art. 1203 spune că într-un contract standard clauzele neuzuale — la noi §14 suspendarea, §15
limitarea răspunderii, §18 modificarea unilaterală — **nu produc efecte** decât acceptate expres și
separat, deci o bifă care acoperă tot documentul e exact acceptarea care nu contează pentru ele.
De aici `acceptedUnusualClauses`, refuzat ca orice altceva decât `true`, și un al treilea rând în
`document_acceptances`: `unusual_clauses`, care poartă versiunea **termenilor**, fiindcă asta e — o
parte din ei, nu un al treilea document. Din același motiv titlurile din `docs/legal/` au acum
id-uri (`headingSlug` din `apps/web/server/utils/legal-markdown.ts`): o bifă care numește trei
secțiuni și duce în capul unui document de douăzeci nu e „expres" în niciun sens util.

**O versiune nouă se cere la prima autentificare de după, iar cine decide asta e serverul.**
`outstandingDocuments` (`apps/api/src/modules/auth/legal-acceptance.rules.ts`) compară evidența cu
`LEGAL_DOCUMENT_VERSIONS` prin **apartenență la mulțime**, nu prin „ultimul rând e vechi": un text
pus la loc la o versiune deja acceptată nu se cere a doua oară, fiindcă familia chiar a acceptat-o,
într-o zi pe care evidența o știe. Răspunsul pleacă în `GET /auth/me` ca
`pendingLegalDocuments`, lângă `profileComplete` și pentru același motiv — altfel ecranul care
redirecționează și evidența care consemnează ar avea două păreri despre aceeași familie. Patru
lucruri de ținut minte:

- **`POST /auth/accept-documents` scrie numai ce lipsește**, deci a doua apăsare nu mută ziua
  primei acceptări, și **refuză o listă care lasă ceva neacceptat** — cazul care contează fiind fix
  cel din art. 1203, bifa pe termeni fără bifa pe clauzele dinăuntru.
- **Evidența nu se actualizează niciodată, se adaugă.** Rândul de la versiunea veche rămâne: „ce a
  acceptat familia asta, și când" are răspuns pentru fiecare versiune, nu doar pentru ultima.
- **Adminii sunt exceptați**, ca la porțile de cont: termenii sunt contractul părintelui cu școala,
  iar o versiune nouă n-are voie să încuie afară singurii oameni care ar putea repara ceva.
- **Nicio rută nu refuză o cerere pentru asta.** §18 promite că portalul cere, nu că platforma se
  închide; poarta e `03.legal-acceptance.global.ts`, care **cedează cât timp ține poarta de profil**
  — două middleware-uri globale care redirecționează amândouă sunt o buclă fără eroare și fără log,
  iar precedența e scrisă în fișierul care a venit al doilea.

**Fiecare acceptare e confirmată pe email, cu ce s-a acceptat _atunci_** (termenii §4.7). Șablonul
`legal-acceptance` se pune în coadă în tranzacția care scrie rândurile, la înregistrare și în
`acceptDocuments`, iar lista din el vine din rândurile **scrise** (`RETURNING id, document`), nu din
cele cerute: o politică nouă acceptată în martie nu e termenii acceptați din nou în martie, iar un
submit concurent poate să fi scris o parte primul. Cheia e `legal-acceptance:<cont>:<id-urile
rândurilor>`, deci al doilea clic, care n-a scris nimic, nu confirmă nimic. La înregistrare mesajul
**nu** trece prin poarta adresei confirmate — adresa e nedovedită prin definiție atunci, iar legat de
ea singurul mesaj promis ar ajunge `undeliverable`. Evidența se recitește din Profil, prin
`GET /auth/documents`. Textul unei versiuni înlocuite nu se servește încă nicăieri: azi fiecare
document are o singură versiune, iar la prima schimbare de după publicare trebuie păstrat înainte —
procedura din `legal-documents.ts` îl numește.

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

Vezi `apps/api/src/modules/invoice/invoice.service.ts:118`. Același tipar în `payment`, `child`, `profile` — respectă-l.

**Numai `andWhere`, niciodată `where`, după ce ai început să compui.** `qb.where()` _înlocuiește_
toată clauza, deci un `where` pus după restrângerea pe utilizator o șterge fără niciun semn. Exact
așa a scăpat `PaymentService.findOne`: orice părinte putea citi plata oricărei alte familii, cu
profilul complet atașat. Dacă ai nevoie de o primă condiție, pune-o tot cu `andWhere`.

**Și acum o ține un spec, fiindcă nimic altceva n-o vede.** Nu e eroare de tip — amândouă metodele
există și amândouă întorc builder-ul —, nu e finding de lint, iar `authorization.spec.ts` verifică
gărzile handler-ului, nu ce face a douăzecea linie cu clauza pe care el a compus-o.
`scoping-is-never-overwritten.spec.ts` citește sursele ca AST și pică pe fișier și linie, în
amândouă formele în care a apărut greșeala: **înlănțuit** — `.andWhere(…).where(…)` într-o expresie
— și **prin variabilă**, adică `qb.andWhere(…)` sub un `if` și `qb.where(…)` douăzeci de rânduri mai
jos; a doua e cea care a ajuns în producție și cea peste care ochiul trece. Sub-interogările nu se
numără, dinadins: `qb.subQuery()` deschide un builder nou, deci `where`-ul de după el e chiar prima
lui condiție — așa citesc `ProjectService.childrenWithoutProjects` și `EnrollmentService`, și
amândouă sunt corecte. Ordinea se judecă per funcție, ca o metodă care restrânge să nu acuze alta
care chiar începe cu `where`.

**Un slot care nu se potrivește cu nimic e aruncat în tăcere.** Ecranul de catalog a stat trei
story-uri fără butonul de salvare: blocul cu selectorul de oră și cu **Salvează Prezența** e un
`<template #footer>`, iar S5b a înlocuit `<UCard>`-ul care îl învelea cu `<AdminPage>`, care are doar
`#actions` și slotul implicit. Vue nu spune nimic despre un slot pe care nu-l cere nimeni, deci
profesorul putea marca toată grupa și n-avea ce apăsa. **Nimic nu putea prinde asta**: un slot care
nu duce nicăieri nu e eroare de tip, nu e finding de lint și nu e încălcare de accesibilitate —
conținutul absent n-are contrast și n-are etichetă lipsă, deci poarta din S6 a trecut ecranul de
două ori. Când muți un ecran pe `AdminPage`, uită-te ce sloturi foloseau învelișurile dinainte; ce
nu e `#actions` sau conținut implicit trebuie mutat, nu redenumit.

**Magazinele Pinia întorc `readonly(...)`, iar `Array.sort` reordonează pe loc.** Deci
`payments.value = paymentsStore.payments.sort(...)` nu sortează nimic: fiecare schimb e o scriere
refuzată de Vue — optsprezece avertismente pentru optsprezece rânduri — și înapoi vine lista în
ordinea în care a venit de la API, prefăcându-se sortată. Ecranul de plăți a promis „cele mai noi
întâi" fără să fie, de la început. Copiază înainte de sortare: `[...store.lista].sort(...)`.

**Și pe asta o ține acum un spec**, fiindcă felul în care pică e felul în care a trecut de review:
nu e nicio excepție și nicio linie roșie — vectorul se întoarce, șablonul îl randează, fiecare rând
e corect —, greșită e doar **ordinea**, adică singurul lucru pe care cititorul nu-l poate verifica
uitându-se la ecran. `sorting-copies-first.spec.ts` citește sursele ca AST, script-ul din `.vue`
inclusiv, și pică pe fișier și linie. Linia trasată e **„citit de pe altceva"**: `store.items.sort()`
sau `invoices.value.reverse()` — orice ajuns printr-un punct — are un proprietar în altă parte și se
copiază întâi; un vector local (`rows.sort(...)`, construit cu câteva rânduri mai sus) e al funcției
care îl sortează și e lăsat în pace, cum face `user/absente.vue`. Și `reverse` e acolo, nu doar
`sort`: reordonează tot pe loc. Ce vine dintr-un `filter`, `map`, `slice` sau dintr-un spread e deja
vector proaspăt — adică aproape toate sortările din aplicație.

**Un buton de retry care nu șterge eroarea apasă degeaba.** `AdminError` cheamă `load()` din nou, dar dacă acel `load()` nu pune `loadError` pe gol **înainte** de cerere, a doua încercare reușește, datele vin, iar `v-else-if="loadError"` ține cardul de eroare deasupra lor: cererea pleacă, primește 200, și pe ecran nu se schimbă nimic. Cinci ecrane au fost livrate așa, și niciunul n-a fost găsit citind — butonul e acolo, e legat, cheamă funcția care trebuie, iar ce lipsește sunt două linii la începutul unei funcții aflate la douăzeci de rânduri distanță. Forma corectă e `loading.value = true;` plus golirea lui `loadError`, amândouă înaintea lui `try`; `retry-clears-error.spec.ts` mătură sursele după ordinea asta.

**Nimic din spatele autentificării nu se randează pe server, și e o chestiune de corectitudine, nu
de viteză.** Autentificarea e client-only prin construcție (`plugins/01.auth.client.ts`), deci când
Nitro randa `/admin/...` n-avea niciun utilizator: shell-ul de admin ieșea cu meniul părintelui,
portalul fără numele familiei, iar browserul hidrata pe deasupra ce trebuia. **Vue înlocuiește
textul și lasă atributele** — o spune chiar el în avertisment —, așa că bara laterală a ajuns cu o
intrare scrisă „Rapoarte" al cărei `href` era `/`: un clic stânga mergea, fiindcă router-ul
folosește props-urile componentei, dar ctrl-clic, „deschide în tab nou" și „copiază adresa" duceau
pe pagina publică. `routeRules` din `nuxt.config.ts` pune acum `ssr: false` pe `/admin/**` și
`/user/**`. Un `<ClientOnly>` pe fiecare bucată care depinde de cine e logat ar fi reparat cele două
găsite și l-ar fi lăsat pe al treilea să fie găsit la fel; ecranele astea sunt oricum `noindex`,
n-au SEO și își cer datele la montare, deci randarea pe server nu cumpără nimic.

**Paginile publice nu pot face la fel** — au nevoie de server pentru SEO —, iar al treilea a fost
găsit exact acolo: bara de navigare e singura componentă publică ce depinde de cine e logat, deci un
părinte autentificat vedea „Contul meu" cu `href`-ul lui „Programează o probă", pe fiecare pagină
publică. `Navbar.vue` **ține ramura vizitatorului până la montare**: hidratarea potrivește HTML-ul
serverului, iar comutarea de după e un patch obișnuit, care mută și `href`-ul. Dacă mai adaugi pe o
pagină publică ceva care citește `userStore`, poartă-l la fel.

**Un `value` gol într-un `USelect` nu e o opțiune, e o opțiune lipsă.** reka-ui refuză `SelectItem`
cu `value=""`, fiindcă șirul gol e felul în care se golește un select — iar refuzul e o eroare în
consolă, nu una pe ecran: declanșatorul afișează în continuare eticheta, deci nimic nu arată greșit
până când cineva filtrează o dată și nu mai are cum să revină la „toate". Se scrie ca la
`/admin/orar` și la comutatorul de locație: o valoare-santinelă (`"all"`), tradusă în `undefined`
când pleacă spre API.

**Poarta autentificată pică acum și pe o eroare scrisă în consola browserului**, nu doar pe axe —
`check-a11y-auth.mjs`. Amândouă defectele de mai sus erau vizibile exact acolo și nicăieri altundeva:
nu se văd într-o captură de ecran, nu pică niciun test pe date și nu le vede axe. Cererile picate
sunt excluse dinadins: job-ul ăla n-are stocare de obiecte, deci ecranul de PDF răspunde 500 acolo
pentru totdeauna, iar un ecran rămas fără date e deja prins de verificarea de „se încarcă". **Și
citește, tot autentificat, fiecare pagină publică din sitemap** — singurul loc în care le vede
cineva așa: celelalte trei gărzi publice vizitează anonim, deci bara de navigare de mai sus le-a
trecut pe toate. Rulată pe build-ul de dinainte de reparație, verificarea a picat pe toate cele
douăsprezece pagini publice.

**Nu pune `@input` pe un câmp de text Nuxt UI.** Handler-ul rulează, dar **înainte** ca `v-model` să scrie caracterul tocmai tastat: Vue îmbină ascultătorul venit prin `$attrs` cu al componentei într-un vector și le cheamă în ordinea aia, al nostru primul. Deci orice citește din model e cu o tastă în urmă. Căutarea de copii din catalog a fost exact asta: `a` nu găsea nimic (filtra pe șirul gol), `aa` găsea unsprezece (filtra pe `a`), iar un nume întreg nu găsea niciodată nimic. Derivă din model — un `computed` nu poate fi decalat față de ce citește. `@change` și `@blur` sunt emit-uri declarate și se produc după actualizare, deci sunt în regulă. `no-input-listener.spec.ts` ține linia.

**Frontend** — lanțul de autentificare are o ordine care contează:
`apps/web/app/plugins/01.auth.client.ts` setează `authInitialized` → middleware-urile globale
`01.auth.global.ts` și `02.profile-setup.global.ts` **ies devreme** dacă flag-ul e fals →
`apps/web/app/middleware/admin-check.ts` e opt-in, pus explicit pe paginile `/admin/*`. Prefixele numerice
din numele fișierelor dictează ordinea de execuție; nu le redenumi.

**Un plugin `async` care aruncă duce toată aplicația în pagina de eroare.** O respingere neprinsă la
boot nu strică ecranul care a cerut, ci **orice** pagină, pentru oricine e autentificat — iar cauza
nu se vede de pe ecranul stricat. `02.payments.client.ts` a fost exact asta: cerea toate facturile
la fiecare încărcare de pagină, fără `try`, ca să umple două booleene pe care nu le citea nimeni.
Șters. Dacă adaugi un plugin care atinge rețeaua, prinde-i eroarea și scrie de ce e în regulă să
continui fără — cum face `03.profile.client.ts`.

**Iar `useInvoiceApi()` și frații lui își fac câte un `ref` propriu la fiecare apel**, deci ce umple
un apelant nu se vede din alt apelant. E de ce plugin-ul de mai sus n-avea cum să folosească
cuiva: fiecare ecran își cheamă oricum propriul `fetch`. Ce se împarte între apelanți sunt doar
lucrurile declarate la nivel de modul, în afara factory-ului — și alea sunt magazinele Pinia, nu
composable-urile de API.

Tokenurile trăiesc în cookies (`apps/web/app/stores/tokenStore.ts`). Toate apelurile trec prin
`apps/web/app/composables/api/useApi.ts`, care face refresh automat pe 401 și de-duplică refresh-urile
concurente printr-un `refreshPromise` partajat. Nu apela `$fetch` direct — folosește
composable-urile din `apps/web/app/composables/api/`.

State-ul e în Pinia stores (`stores/`), tipurile în `types/`, câte un fișier per domeniu.

**Nuxt UI citește din `classical.css` și fundalul, și accentul.** Blocul de la finalul lui `:root`
(și geamănul lui din `.dark`) pune în variabilele lui Nuxt UI `--ui-bg`, `--ui-text`, `--ui-border`
**și `--ui-primary`**. Ultima a lipsit până la E18 S7, iar consecința e capcana pe care o repetă
oricine adaugă un jeton pe jumătate: `--ui-primary` rămâne la 500-ul rampei, adică `--color-accent`
— o culoare tunată pentru 3:1, deci pentru chenare și text mare, nu pentru text. Toată zona
autentificată citea așa la **2,61:1**, exact cifra pe care E18 S6 o scosese din paginile publice.
Textul de accent merge pe `--color-accent-ink`; dacă adaugi o variabilă nouă de Nuxt UI, pune-o
tot acolo, nu într-o componentă.

**Șirurile lui Nuxt UI sunt în română, prin `<UApp :locale="ro">` din `app.vue`.** Tot ce randează
o componentă pentru sine — eticheta care deschide meniul, „No data" sub un tabel gol, butoanele de
închidere — vine din locale-ul pachetului, iar implicitul e engleza. Regula „numai codul e în
engleză" acoperă și etichetele pe care nu le-a scris nimeni din echipă.

**Iconițele sunt împachetate local, nu cerute de la Iconify.** `@iconify-json/lucide` e instalat, deci
`@nuxt/icon` scanează sursele și pune în bundle doar iconițele folosite (43, 10,4KB la E18 S7),
servite de pe domeniul propriu. Fără pachet, fiecare iconiță e o cerere către `api.iconify.design`
la rulare — pe conexiunea din sală asta înseamnă butoane goale, iar butonul de meniu **e** o
iconiță și nimic altceva. Dacă folosești un prefix dintr-o altă colecție, instaleaz-o și pe aia,
altfel exact acele iconițe se întorc pe rețea, tăcut.

**Zona autentificată se verifică pe telefon, la 390px, nu doar pe desktop** (E18 S7). Două lucruri
se strică acolo și nicăieri altundeva. Grupul din dreapta al navbar-ului are nevoie de `min-w-0`:
fără el își păstrează lățimea intrinsecă și crește **peste** butonul de meniu din stânga — din 44px
rămăseseră 10 apăsabili, iar o atingere în centrul hamburgerului deschidea filtrul de locație. Și
ținta minimă e 44px pe drumul profesorului; `size="sm"` pe un buton pe care cineva îl apasă stând
în picioare e prea mic, deci se scrie `class="min-h-11"`. Zona n-are poartă automată de
accesibilitate — S6 o amână deliberat până se rescrie portalul în S4/S5 — deci verificarea e
manuală, iar cifrele de referință sunt în E18 S7.

**Partea publică nu atinge backend-ul, cu două excepții declarate.** Cele șapte pagini publice
vechi, cele șase de sub `/cursuri/`, formularul de contact, `robots.txt`, `sitemap.xml`, `llms.txt`
și datele structurate funcționează fără `API_BASE` — de aceea site-ul stă în producție pe Vercel deși backend-ul de
producție nu e deployat. Prima excepție e `/proba`, formularul de programare la lecția de probă
(E20/S2): el chiar are nevoie de API, fiindcă scrie un rând. E scris să pice moale — orele se cer
doar din client, iar fără răspuns formularul tot se trimite și cititorul primește numărul de
telefon. A doua e `/dezabonare` (E17/S4), pagina la care duce linkul din subsolul unui mesaj
promoțional: acolo **pagina întreagă e scrierea**, deci nu poate pica moale la fel — ce face în loc
e să spună că n-a mers și să dea adresa biroului. Niciuna **nu se aduce pe `release/prod`** până nu
rulează un backend acolo; pe `release/stage` funcționează amândouă, pe
`api-stage.itbridgeschool.com`. Faptele despre școală stau în `apps/web/shared/`, nu în
pagini: `school.ts` (nume, telefon, adrese, program), `courses.ts` (nivelurile și prețurile),
`subjects.ts` (uneltele și examenul, câte o pagină sub `/cursuri/`; nivelurile la care se predă o
unealtă se **derivă** din `teaches`, nu se listează, iar lucrările copiilor intră tot acolo, în
`projects`, când există — până atunci pagina nu desenează nicio galerie), `teachers.ts`, `seo.ts`
(titlul și descrierea fiecărei pagini; `PUBLIC_PAGES` de acolo e lista din care ies sitemap-ul și
`llms.txt`, iar `pageSeo` aruncă pentru un drum care nu e în ea), `structured-data.ts`
(constructorii de JSON-LD). Aceleași constante alimentează pagina, graful JSON-LD, sitemap-ul și
`llms.txt` —
**dacă schimbi un preț sau o adresă, schimbi acolo, într-un singur loc.** Un număr scris de mână
într-o pagină e un bug, nu o scurtătură: NAP inconsecvent e cea mai frecventă cauză de poziționare
locală slabă.

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
  (rezolvat prin `baseUrl`). Frontend folosește alias-ul Nuxt `~/`. **Excepția e lanțul lui
  `load-env.ts`**: `config/env.validation.ts` și ce importă el se importă relativ, fiindcă CLI-ul
  TypeORM (`migration:run`) le încarcă fără `tsconfig-paths` — un `src/…` acolo pică migrarea, și
  odată cu ea deploy-ul. `pnpm typecheck` și testele trec fără să observe; îl prinde doar pasul
  „Migrate" din jobul „Accessibility (authenticated)" din CI.
- Sumele monetare: `decimal` în Postgres, expuse ca `number` în aplicație printr-un
  `transformer` pe coloană (vezi `apps/api/src/entities/invoice.entity.ts`).
- Lunile de facturare sunt string-uri `'YYYY-MM'` (`monthIssued`), cu constrângere
  `@Unique(['parent', 'monthIssued'])` pe `Invoice`.
- `Group.weekday` e zi ISO: 1 = luni, 7 = duminică.
- Unicitatea orarului e pe **sală**, nu pe școală: `@Unique(['room', 'weekday', 'startTime'])`.
- `Room.capacity` implicit e 10, dar e configurabil din `/admin/locations`; nu-l hardcoda nicăieri.
  Nu coboară sub capacitatea unei grupe care se ține în sală (`ROOM_SMALLER_THAN_GROUP`).
- `isActive` pe `Location` și `Room` blochează **grupe noi**, nu editarea celor existente.

## Capcane

Lucruri care te vor bloca dacă nu le știi dinainte.

**`pnpm test` verde nu înseamnă `pnpm typecheck` verde.** ts-jest e mai permisiv decât `tsc` pe
fișierele de test, deci o suită poate trece în timp ce `tsc --noEmit` raportează erori pe același
cod. Rulează amândouă înainte să deschizi un PR — CI le rulează separat.

**`lint:fix` poate schimba tipuri, deci `typecheck` se rulează _după_ el, nu înainte.** Regula
`@typescript-eslint/no-unnecessary-type-assertion` **șterge** o aserțiune pe care o consideră
inutilă, iar `--fix` o face fără să întrebe: un `app.get(S3Service) as unknown as { deleteObject:
jest.Mock }` din care rămâne `app.get(S3Service)` compilează perfect până în clipa în care cineva
cheamă `.mockClear()` pe el. Local trece dacă ai rulat typecheck-ul înaintea lui `lint:fix`, și
pică în CI. Când ai nevoie de forma asta, îngustează dintr-un `unknown` declarat — `const client:
unknown = ...; return client as X;` — fiindcă aia e o îngustare reală, pe care regula n-o poate
numi inutilă.

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

**Imaginea MinIO e a Chainguard, `chainguard/minio`, fiindcă MinIO nu mai publică imagini.** Pe 25
septembrie 2026 `minio/minio` și `minio/mc` nu mai existau pe Docker Hub, iar `quay.io` răspundea
unui `docker pull` anonim cu `unauthorized`, de trei ori din trei — deci jobul „Integration tests"
pica la „Start MinIO" fără niciun test rulat. Paragraful de dinainte spunea că Hub nu era închis și
că, dacă se închide, ăsta e locul de corectat; s-au închis amândouă registrele. `chainguard/minio` e
MinIO construit din sursă și publicat pe Docker Hub de Chainguard. Are în el și `mc`, și un shell,
deci îl folosește și `minio-init` — `chainguard/minio-client` n-are shell pentru comanda lui. Două
diferențe față de imaginea veche, amândouă măsurate, nu presupuse:

- **Vine cu un `/data/.minio.sys` gata făcut în stratul imaginii**, iar pe sistemul de fișiere
  overlay al containerului MinIO nu-l poate redenumi („Rename across devices not allowed"). De aceea
  în CI `/data` e un `--tmpfs`: un director proaspăt, în memorie, în care poate scrie utilizatorul
  non-root al imaginii. În `docker-compose.yml` datele stau pe volum, deci problema nu apare acolo.
- **Rulează ca non-root, iar imaginea veche rula ca root.** Un volum `minio_data` scris de cea veche
  e al lui root, iar serverul non-root se oprește pe el cu „file access denied" — de aceea în
  `docker-compose.yml` rulează cu `user: "0:0"`, ca volumele existente să meargă mai departe.

Ce s-a reparat la mutarea de dinainte, și rămâne, e **felul în care pică pasul**. „Start MinIO"
n-avea nici reîncercare, nici mesaj, iar un `docker pull` picat lăsa cei doi pași de după el —
`check:schema` și **toată** suita de integrare — _skipped_: checkul ieșea roșu cu numele
„Integration tests" și cu zero teste rulate, adică arăta exact ca un test picat. Acum sunt trei
încercări și un `::error::` care spune în cuvinte că n-a rulat nimic.

Regula care rămâne, și e cea care costă o după-amiază dacă o uiți: **dacă vezi roșu la „Integration
tests", uită-te întâi dacă a rulat vreun test.** Un pas de infrastructură care cade nu seamănă cu un
test picat, dar checkul are aceeași culoare.

Din `docker-compose.yml`, **nicio rulare de CI nu atinge** nici serverul, nici `minio-init` — le
folosește doar `docker compose up -d` —, deci partea aia a mutării a fost verificată de mână:
serverul ajunge `healthy` prin `mc ready local`, iar `minio-init` iese cu 0 și creează bucket-ul.

**`scripts/` e exclus din `tsconfig.build.json`, intenționat.** Inclus, ar urca `rootDir` la
rădăcina pachetului, iar `nest build` ar scrie `dist/src/main.js` în loc de `dist/main.js` — deci
`start:prod` și deploy-ul s-ar rupe în tăcere. Scripturile rulează oricum prin ts-node.

**Un `''` dintr-un formular nu e `undefined`, iar `@IsOptional()` nu-l sare.** Orice input HTML
netastat se trimite ca string gol, deci `@IsOptional() @Length(1, 255)` respinge exact payload-ul pe
care formularul îl produce mereu. Pe câmpurile opționale de text pune `@EmptyToUndefined()`
(`apps/api/src/common/empty-to-undefined.ts`) înaintea validatorilor. Din cauza asta ecranul de
completare a profilului a devenit imposibil de trecut în clipa în care validarea a fost pornită.

**Regula e „gol înseamnă lipsă", nu „nu mai da 400", și o ține un spec.** Patruzeci și opt de
câmpuri rămăseseră fără ea, iar cele două feluri de greșit merită deosebite: majoritatea
**refuzau** — un `@Length`, un `@Matches`, un `@IsEnum` sau un `@IsDateString` pe care o casetă
golită n-are cum să le treacă —, dar câteva **acceptau**, ceea ce e mai rău. `PUT /children/:id`
primea `firstName: ''` și îl scria: un câmp opțional fără limită de lungime e o cale prin care se
golește numele unui copil dintr-o casetă ștearsă și un buton de salvare. Trei ecrane compensau deja
cu `|| undefined` la ieșire, iar al patrulea urma să uite — de aia decizia stă pe API, nu în
apelanți. `optional-text-is-never-empty.spec.ts` mătură DTO-urile și pică pe nume. Singura clasă
exceptată e `PreviewMailTemplateDto`, cu motivul lângă ea: acolo `''` e o stare, nu o absență —
editorul de șabloane previzualizează exact ce e în casete, deci un subiect șters trebuie să se vadă
șters, nu cum e încă salvat pe server. Dacă mai apare una, se trece în listă cu propoziția ei.

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
SQL-ul generat înainte de commit. O redenumire de coloană îi apare ca `DROP` plus `ADD`.

**O relație nouă are nevoie de index pe ea, fiindcă Postgres nu-l face.** Postgres indexează partea
**referită** a unei chei străine, niciodată coloana de pe copil. Deci fiecare `ON DELETE CASCADE`,
fiecare `RESTRICT` și fiecare interogare care filtrează pe relație era scanare secvențială —
treizeci și patru de coloane erau așa, iar două dintre ele poartă interogări care rulează **în
interiorul unui lacăt de rând**. Măsurat pe o școală de trei ani (250 de familii, 46.800 de marcaje
de catalog, 9.000 de facturi, 8.250 de plăți):

- `payments.invoice_id` — `recomputeInvoiceStatus` adună plățile reușite ale unei facturi **ținând
  lacătul acelei facturi**, la fiecare plată scrisă sau editată: **0,791 ms → 0,100 ms**.
- `attendances.class_session_id` — catalogul unei ore, adică fix ce deschide profesorul în sală:
  **3,378 ms → 0,044 ms**.

Costul l-am măsurat și pe el, fiindcă „mai pune un index" nu e gratis: douăzeci de mii de marcaje
noi se inserează în 551 ms cu index și 567 ms fără — în zgomot. Deci regula e simplă și fără
excepții de memorat: **pui un `@Index` pe fiecare `@ManyToOne` pe care îl adaugi.** Nu toate se vor
vedea într-un plan azi — `leads` și `projects` sunt încă mici, iar pe o tabelă de 300 de rânduri
Postgres alege oricum scanarea —; sunt acolo pentru ziua în care tabela crește, iar o schemă
indexată pe jumătate e una despre care nimeni nu mai poate raționa.

Ce **nu** rezolvă: rapoartele care citesc tot. Interogarea de restanțe atinge toate facturile
neplătite și le împerechează cu toate plățile, iar acolo hash join peste scanare completă chiar e
planul corect — a rămas la 2,3 ms și cu index, și fără. Un index ajută punctul, nu bilanțul.

**Nu te chinui însă să păstrezi date: nu există niciunele.** Nici pe stage — baza de acolo e tot
seed, refăcută dintr-o comandă —, n-a existat niciodată un utilizator real, iar în afara ei baza
rulează doar pe mașinile de dezvoltare și în teste. Deci o migrare generată se ia ca atare, se
rescriu liber migrările nepornite încă și nu se scrie cod de backfill pentru rânduri care nu există.
Ce **rămâne** obligatoriu e ca migrările să existe și să corespundă entităților, fiindcă de asta
depinde `check:schema` din CI — și fiindcă regula se schimbă în ziua în care există prima familie
reală, nu în ziua în care a existat un deploy.

Ce s-a schimbat de când există stage e **prețul greșelii, nu regula**: `deploy.sh` rulează
`migration:run` între build și `pm2 reload`, deci o migrare care pică oprește deploy-ul și lasă pe
`api-stage` versiunea dinainte. Costul nu mai e un `docker compose down -v` pe laptopul tău, e un
branch care nu mai ajunge nicăieri până e reparat.

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
(`apps/api/src/modules/storage/s3.service.ts`) aruncă fără ea, deci backend-ul cade la
boot, chiar dacă nu atingi nicio factură. Cheile de acces sunt opționale — lipsa lor duce SDK-ul pe
lanțul implicit de credențiale, adică IAM instance role în producție. Mesajul de eroare cere trei
variabile, dar verifică una singură.

**`archiver` rămâne pe `^7`, ultimul major CommonJS.** v8 e `"type": "module"` și cade în ts-jest cu
`SyntaxError: Unexpected token 'export'`, exact ca `@nestjs/schedule` v12. Aceeași capcană, al doilea
pachet — dacă adaugi o dependență și testele pică deodată cu un mesaj care nu spune de ce, verifică
întâi `type` din `package.json`-ul ei. Din același motiv verificarea tipului real de fișier e scrisă
de mână în `apps/api/src/modules/project/file-types.ts` în loc să folosească `file-type`, care e
ESM-only de la v19: sunt opt semnături, adică treizeci de linii.

**`sharp` are nevoie de scripturi de instalare**, deci e în `onlyBuiltDependencies` din
`pnpm-workspace.yaml`. Fără el nu se generează nicio miniatură — dar nici nu se rupe nimic: E14
tratează eșecul de miniaturizare ca pe un rezultat normal, iar proiectul se încarcă oricum.

**`projects.publicId` se generează în entitate, printr-un `@BeforeInsert`, nu prin `DEFAULT
gen_random_uuid()`.** Funcția e în core de la Postgres 13 și ar merge perfect, dar TypeORM nu știe să
compare un default de funcție cu ce raportează baza, deci `check:schema` ar declara drift la fiecare
rulare și ar emite un `DROP DEFAULT` urmat de un `SET DEFAULT` identic. O gardă care pică pe fiecare
PR nu mai e citită. Consecința: un proiect creat printr-un query builder n-ar primi identificator —
nimic nu face asta, iar `ON CONFLICT DO NOTHING` e necesar pe `project_files`, nu pe `projects`.

**Ordinea rutelor contează în două controllere.** În `ProjectController`, `link/:publicId`,
`child/:childId/archive`, `group/:groupId/missing` și `send` sunt declarate înaintea lui `:id/…`,
fiindcă Nest potrivește în ordinea declarării și `:id` are `ParseIntPipe`, care răspunde 400 la un
UUID. În `LeadController` (E20/S3) e aceeași capcană cu alt chip: `follow-up` și `undecided` stau
înaintea lui `:id`, altfel `ParseIntPipe` răspunde 400 la un cuvânt.

**Singurul lucru servit `inline` de pe domeniul școlii e miniatura.** Fișierele urcate se servesc
prin URL semnat cu `Content-Disposition: attachment`, fiindcă vin de pe o partajare pe care poate
scrie orice mașină din școală. Miniatura e altceva: octeții ei au fost produși de `sharp` pe server,
deci un poliglot valid și ca imagine și ca altceva n-a supraviețuit reîncodării. Are `nosniff`
oricum. Nu extinde excepția la altceva.

**`outbox.attachments` ține chei, nu octeți.** Obiectul se citește din bucket în secunda în care
mesajul e predat furnizorului. Base64 în coloană ar îngrășa fiecare interogare de revendicare pentru
date de care e nevoie o dată; iar un obiect care lipsește nu oprește mesajul — pleacă fără poză.

**Refresh tokenurile sunt urmăribile și revocabile.** Tabelul `sessions` ține un SHA-256 al
fiecăruia, niciodată tokenul. Refresh-ul rotește, iar refolosirea unuia consumat revocă tot lanțul —
semnalul de furt. `POST /auth/logout` nu cere access token, fiindcă acela e adesea deja expirat.

**„Închide toate sesiunile" așteaptă o rotație în curs, prin rândul contului.** `revokeAllForUser`
era un singur `UPDATE`: sub READ COMMITTED aștepta rândul pe care îl blocase rotația, îl sărea
fiindcă venea înapoi revocat și nu vedea succesorul, scris după instantaneul lui. Deci un refresh
prins la jumătatea unei resetări de parolă păstra un token nou șapte zile — exact în clipa în care
cineva încearcă să închidă ușa unui hoț. Acum rotația ține rândul din `users` **partajat**
(`FOR SHARE`) înaintea sesiunii, iar măturarea îl ia **exclusiv** (`FOR UPDATE`) înainte să revoce.
Ordinea e cont, apoi sesiune, peste tot — și `DELETE`-ul ștergerii cascadează la fel —, altfel două
tranzacții țin fiecare câte una și o așteaptă pe cealaltă. Iar `revokeAllForUser` nu se cheamă
dintr-o tranzacție care ține deja rândul contului: s-ar aștepta pe ea însăși, fără ca Postgres să
vadă vreun ciclu. Testul forțează interleavarea — o a doua conexiune ține rândul contului, care
oprește rotația exact între revocarea rândului vechi și scrierea celui nou.

**Numele de utilizator al unui admin nu pleacă spre un părinte.** E jumătate din credențial, iar
login-ul e limitat pe adresă, nu pe cont. `GET /payments` îl punea pe fiecare plată a fiecărei
familii (`recordedBy`), deși niciun ecran de părinte nu-l arată; acum îl primește doar biroul —
`withRecorder` din `payment.service.ts`.

**Revocarea acționează doar pe refresh, nu și pe access.** `AuthGuard` verifică semnătura JWT și
atât — nu atinge tabelul `sessions`. Deci după `logout` sau `logout-all`, un access token deja emis
mai funcționează până la 15 minute. E compromisul acceptat: alternativa e o interogare în baza de
date la fiecare cerere. Dacă vine o cerință de revocare instantanee, ăsta e locul de schimbat.

**Clientul trebuie să salveze refresh tokenul întors de `/auth/refresh`.** Rotația îl consumă pe
cel prezentat; dacă păstrezi tokenul vechi, a doua reîmprospătare arată ca un replay, iar serverul
revocă tot lanțul. `useApi.ts` a avut exact bug-ul ăsta și deloga fiecare părinte la ~30 de minute.

**Și trebuie să reîmprospăteze o singură dată deodată, oricâte cereri ar aștepta.** Două
reîmprospătări pornite în paralel prezintă amândouă același token: serverul îl rotește pentru prima
și o citește pe a doua ca replay — „clientul care se întrece cu el însuși" e scris chiar în
`SessionService.rotate`, iar tratamentul e același ca pentru un furt, fiindcă din afară arată
identic. În browser, poarta e `refreshPromise` la nivel de modul din `useApi.ts`. În
`apps/agent`, care n-o avea, nu era o interleavare rară, ci **orarul**: trei cronometre
independente peste un singur `ApiClient` — scanarea la 30s, heartbeat-ul la 5 minute, oglinda la 15
—, iar access tokenul ține un sfert de oră, deci tick-ul în care tocmai a expirat e regulat un tick
în care pornesc două. Calculatorul din birou ridica semnalul de furt al platformei de câteva ori pe
oră, degeaba — ceea ce e mai rău decât autentificările irosite: o alarmă care strigă „lupul" după
ceas e una în care nimeni n-o să creadă în ziua în care are dreptate. Al doilea capăt e un contor de
generație: un 401 întors **după** ce altcineva a rotit deja n-are nevoie de o rotire proprie, ci de
tokenul care există între timp. Amândouă capetele au test propriu, iar testul pornește un server HTTP
adevărat: ce se verifică e ce se întâmplă când două cereri sunt în aer în același timp, iar un
`fetch` înlocuit cu un răspuns gata făcut dă înapoi controlul prea devreme ca ele să se suprapună
cu adevărat.

**Un login ține șapte zile, cât refresh tokenul din spatele lui.** `useCookie("accessToken")` fără
opțiuni scrie un cookie **de sesiune** — `CookieDefaults` din Nuxt pune `path`, `watch`, `decode`,
`encode` și `refresh`, și nimic altceva, deci nici `maxAge` și nici `expires` —, așa că amândouă
tokenurile se aruncau la închiderea browserului. Tot ce e de partea cealaltă a sârmei fusese
construit pentru opusul: șapte zile de refresh token, tabelul `sessions` care îl urmărește, rotația
care revocă lanțul la refolosire. Un părinte își retasta parola la fiecare vizită, iar nimeni nu
alesese asta — era implicitul pe care nu-l recitise nimeni. Trei lucruri de ținut minte:

- **`maxAge` pe cookie-ul de refresh, singur, nu repară nimic.** Și pluginul de boot
  (`01.auth.client.ts`), și middleware-ul (`01.auth.global.ts`) citeau **access tokenul** ca „e
  cineva autentificat", deci părintele întors a doua zi era trimis la formularul de login cu un
  refresh token bun în borcan, neatins: nimic nu cheamă `/auth/refresh` până nu ia o cerere 401, și
  nu pleca nicio cerere. Jumătatea durabilă a unei sesiuni e refresh tokenul, iar amândouă îl citesc
  acum — `/auth/me` ia 401, `useApi` reîmprospătează, reluarea duce tokenul nou.
- **Access tokenul rămâne pe sesiune, dinadins.** E un drept de cincisprezece minute pe care
  `AuthGuard` îl onorează fără să atingă `sessions`, deci n-are ce căuta pe disc după ce s-a închis
  tab-ul.
- **`secure` se decide din protocolul paginii, nu din build.** `import.meta.dev` e testul evident și
  e greșit în două locuri deodată: `pnpm test:a11y:auth` servește un build **de producție** pe
  `http://127.0.0.1:3124` și așteaptă cookie-ul `accessToken`, iar zona autentificată se verifică pe
  telefon la 390px (E18 S7), adică tot pe HTTP simplu. Un cookie `secure` pe HTTP e aruncat de
  browser fără niciun mesaj, deci greșeala arată exact ca o parolă greșită. `sameSite: "lax"` e
  igienă de stocare, nu apărare CSRF: tokenurile circulă în antetul `Authorization`, iar API-ul nu
  citește niciun cookie.

Cele două numere — `REFRESH_TOKEN_MAX_AGE_SECONDS` din `apps/web/app/stores/tokenStore.ts` și
`JWT_REFRESH_TOKEN_EXPIRATION` — se mută împreună: browserul nu vede mediul API-ului, iar `useCookie`
fixează `maxAge` când se creează ref-ul, deci valoarea nu poate fi citită nici de pe token.

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

**O coloană nouă pe o entitate trebuie clasificată în inventarul de date** (E07 S1). Sursa e
`apps/api/src/privacy/data-inventory.ts`, iar `data-inventory.spec.ts` citește metadatele lui
TypeORM — nu o listă întreținută de cineva — deci o coloană adăugată fără intrare pică suita, cu
numele ei în mesaj. Sunt clasificate **toate** coloanele, nu doar cele personale: fiecare e ori dată
personală, cu scop, temei legal, regulă de păstrare și cine o poate citi, ori nu e, cu un motiv
dintr-o listă scurtă. Nu există a treia stare — aia e felul în care un număr de telefon ajunge
neclasificat. Trei lucruri care se ratează:

- **Un rând despre o familie face personale coloanele lui, orice ar conține.** Suma unei facturi nu
  e un număr în abstract, e ce datorează familia aia. „N-are niciun nume în el" nu e un motiv.
- **`linkedVia` e drumul de la rând la familie**, iar testul îl parcurge relație cu relație și cere
  să se termine la `Profile`. E coloana pe care o citește E07 S4: un export trebuie să găsească
  fiecare rând despre o familie, deci un drum inventat e o gaură pe care nimic n-o semnalează. Trei
  tabele n-au drum, dinadins, și scrie de ce la fiecare.
- **Documentul se randează, nu se editează**: `pnpm --filter api inventory:render` scrie
  `docs/inventar-date.md`, iar același spec pică dacă a rămas în urmă. Fișierul e în
  `.prettierignore` fiindcă prettier v3 își încarcă parserul de markdown prin `import()` dinamic, pe
  care ts-jest nu-l poate face — deci verificarea compară randarea brută, iar un hook care ar
  reformata fișierul ar face-o roșie pe alinierea barelor și pe nimic altceva.

**Urma unei schimbări se scrie în tranzacția care a produs-o** (E07 S3). `AuditService`
(`apps/api/src/modules/audit/audit.service.ts`) **cere** `EntityManager`-ul tău — nu îl acceptă
opțional, ca outbox-ul: o urmă care supraviețuiește unei tranzacții date înapoi spune că s-a
întâmplat ceva ce nu s-a întâmplat, iar una pierdută când schimbarea a reușit e o gaură. Asimetria
față de coadă e intenționată: un mesaj poate să n-aibă nicio tranzacție în jur — rularea de restanțe
și mementoul de prezență și-o compun dintr-o citire —, în timp ce o intrare în jurnal _e_ relatarea
unei schimbări, deci există mereu o tranzacție la care să se alăture. Opt scriitori derivaseră spre
apelul fără manager — toți cei de date personale, plus ambele jumătăți ale cererii de ștergere —, iar
unul dintre ei, editarea de profil, avea chiar atunci o tranzacție deschisă și pur și simplu n-o
dădea mai departe. Semnătura e ce oprește al nouălea; un tip ține linia mai bine decât un comentariu.
Patru lucruri de ținut minte dacă adaugi un scriitor nou lângă facturi, plăți și reduceri:

- **Nu există `update` și nu există `delete`** — nici metodă pe serviciu, nici rută pe
  `AuditController`, care are un singur verb. Singurul lucru care se poate face tabelului prin
  aplicație e să i se adauge, și ăsta e tot rostul lui.
- **`changes` ține doar ce s-a mișcat, și numai scalari.** `diffFields` din `audit.rules.ts` compară
  datele pe instant și zecimalele pe valoare — altfel două `Date` cu același moment, sau `350` față
  de `"350"` venit ca text din driver, ar raporta o schimbare pe care n-a făcut-o nimeni. O salvare
  care n-a schimbat nimic **nu scrie niciun rând**: `recordUpdate` iese devreme. Un „înainte și
  după" al rândului întreg ar face din jurnal a doua copie a datelor unei familii, adică invers
  decât cere epicul care l-a cerut.
- **Derivările nu se consemnează.** `recomputeInvoiceStatus` mută starea facturii fiindcă s-au
  adunat plăți; e o consecință, nu o decizie a nimănui. Un jurnal în care fiecare derivare stă lângă
  deciziile oamenilor e un jurnal în care deciziile nu se mai găsesc.
- **A patra ușă e capacitatea depășită**, lângă bani și date personale: `allowOverCapacity` e o
  decizie a unui om despre o sală, deci `assertRoomForOneMore` scrie un rând **pe grupă**, nu pe
  înscriere — întrebarea e „cine a pus al unsprezecelea copil în grupa 5", și se pune despre
  cameră. De aici și `Actor` în loc de `actingUserId` pe `enrol` și `transfer`; `null` e formularul
  public de probă, singurul apelant fără cont, iar nota spune care dintre cele două a fost.
- **Actorul vine din token, prin `actorFrom(req)`**, și se stochează denormalizat — id plus numele
  copiat la scriere, fără relație către `User`. O urmă care arată către un rând ce poate fi șters
  pierde exact intrările care contează: cele despre un cont scos ulterior. Pentru munca programată
  există `SYSTEM_ACTOR`, cu ambele câmpuri `null`, fiindcă „n-a apăsat nimeni" e un fapt care merită
  citit, nu un gol de umplut cu un nume inventat.

**Datele personale lasă numele câmpului, nu valoarea** (E07 S3). Cealaltă jumătate a jurnalului —
`Profile` și `Child`, create, editate sau șterse — trece prin
`AuditService.recordPersonalDataChange`, care scrie `{ from: null, to: null }` pe fiecare câmp
atins. Nu e prudență: câmpurile alea au retenția `account` în inventarul din E07 S1 și pleacă odată
cu familia, în timp ce `audit_log` are retenția `audit` și îi supraviețuiește **prin construcție**,
fiindcă n-are relație către profil — de aia mai poate răspunde „cine a șters familia 412" după ce
familia 412 nu mai e. O valoare copiată acolo ar rămâne de partea la care ștergerea din S4 nu
ajunge. Două consecințe: ce s-a mișcat se calculează cu `changedFieldNames`
(`apps/api/src/modules/audit/personal-fields.ts`) **înainte** de `applyDefined`, altfel compari
rândul cu el însuși; iar o salvare care n-a mișcat nimic nu scrie niciun rând, ca la bani. Dacă
adaugi un al treilea drum prin care un om atinge datele unei familii, cheamă aceeași ușă — nu
`record` cu valori în ea.

**A treia categorie e accesul, și ea cade ușor între primele două** (E07 S3). Cine intră, cine e
refuzat, cine devine admin, al cui cont dispare: cele patru scrieri din `apps/api/src/modules/user/`
sunt deciziile prin care platforma spune cine o poate folosi, iar multă vreme n-au consemnat nimic —
niciuna nu primea nici măcar un actor, fiindcă `UserController` n-avea niciun `@Request()` în el.
`approvalDecidedAt` spune _când_ a hotărât școala, nu cine; `PUT /users/:id`, singura scriere care
dă cuiva datele tuturor familiilor, nu lăsa absolut nimic. Toate patru trec acum prin
`recordPersonalDataChange`, în tranzacția care face schimbarea, cu **numele câmpului, nu valoarea**:
`username`, `role` și `approvalStatus` sunt clasificate personale cu retenția `account`, deci
aceeași graniță care ține un număr de telefon în afara jurnalului ține și un rol. Nu se pierde
nimic: rolul curent e pe rând, iar ce rândul nu poate spune — cine l-a mutat — e exact ce adaugă
intrarea. Motivul respingerii nu e nici el trecut: e propoziția adminului, și rămâne pe rând pentru
cine are dreptul s-o citească. Intrarea de la ștergere își supraviețuiește subiectului, fiindcă
jurnalul n-are relație către `users`. Dacă adaugi o a cincea ușă prin care cineva capătă sau pierde
acces, treci-o pe acolo.

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
`outbox` cu motivul scris în `lastError`. **Și chiar rămân — un eșec de configurare nu consumă o
încercare.** `attempts` e, prin definiția de pe entitate, de câte ori a fost întrebat furnizorul, iar
un backend fără cheie nu întreabă pe nimeni: `send` aruncă înainte să atingă rețeaua. Cât timp
`exhausted` se citea doar din numărul de încercări, fără să întrebe și de ce a picat, un deploy
neterminat își îngropa singur coada — șapte treceri, cam două ore, și tot ce era scris ajungea
`failed`, stare pe care `claim` n-o mai atinge niciodată —, deci cheia pusă după aceea nu mai salva
nimic. Acum `recordFailure` dă încercarea înapoi, și odată cu ea și amânarea crescătoare: backoff-ul
temperează furnizorul, iar ăsta n-a fost atins, deci coada reîncearcă pe cadența de bază și pleacă
întreagă în clipa în care apare variabila. `MAIL_OUTBOX_ENABLED=false` oprește doar scheduler-ul;
testele de integrare îl setează, ca o trecere de fundal să nu miște rândurile sub aserțiuni.

**Rapoartele nu definesc nimic, doar adună** (E21). `apps/api/src/modules/dashboard/` cere fiecare
număr de la serviciul care deține întrebarea — restanțele de la `ArrearsService`, locurile de la
`EnrollmentService.occupancyOf` — și nu rederivă niciunul; a doua definiție e cea care divergează.
Raportul financiar ține **două calendare**, amândouă pe ecran: „încasat pentru lună" (plățile pe
facturile lunii, oricând au venit) și „încasat în lună" (plățile datate în lună, pentru orice
factură). Diferă exact când o familie plătește târziu, deci nu alege unul în locul celuilalt. Doar
plățile `succeeded` sunt bani, iar `waived` se numără, nu se adună. Pragul de ocupare (60%) și prețul
unui loc gol stau în `reports.rules.ts` și sunt propuneri afișate ca atare, nu decizii.

**Semnalele timpurii sunt patru liste și un email de luni, nu o acțiune** (E21 S7).
`EarlySignalsService` (`apps/api/src/modules/dashboard/early-signals.service.ts`) cere fiecare
listă de la cine deține definiția: restanțele repetate de la `ArrearsService.list`, grupele sub prag
din raportul de ocupare — aceleași rânduri, nu a doua numărare —, iar cele două tipare de prezență,
care sunt noi, din regula pură `signals.rules.ts`: un copil ale cărui ultime trei marcaje sunt
absențe (și seria e „vie": ultimul marcaj sub trei săptămâni, altfel copilul a plecat), o grupă a
cărei medii pe ultimele trei ședințe ținute a căzut cu 20 de puncte față de cele trei dinainte.
Toate pragurile sunt constante acolo și pleacă pe sârmă, ca ecranul să numească linia pe care o
trage. **`asOf` e verificarea retroactivă**: marcajele și facturile se citesc așa cum stăteau în
ziua cerută, ocuparea mereu azi — și răspunsul o spune. Digest-ul `EarlySignalsJob` pleacă luni la
08:00 pe ceasul școlii, prin outbox, cu `dedupeKey` `early-signals:<zi>`, și **doar când există ceva
de semnalat**, ca mementourile de prezență și de lead-uri. Un semnal nu declanșează nimic — nici
reducere, nici transfer, nici mesaj către familie; e un motiv de telefon, cu numărul lângă el.

**Restanța se derivă, iar `Invoice.status` e doar o memorie** (E16 S7). Termenul e 14 zile de la
`dateIssued` — `arrears.rules.ts`, fără coloană `dueDate` — iar `ArrearsService.list` numără plățile
**reușite**, nu se uită la coloana de stare: un ecran despre bani n-are voie să greșească o zi
fiindcă n-a rulat un job. `markOverdue` ține coloana onestă pentru restul ecranelor. Consecința pe
care se sprijină acceptanța: mementourile se opresc la încasare fiindcă factura plătită iese din
interogare, nu fiindcă anulează cineva ceva.

**Ce vede familia ca „de plătit" e restul, nu totalul** (revizuirea din 25 septembrie 2026). Portalul
arăta suma facturii, deci o familie care plătise 100 din 350 citea tot 350 — iar cine plătește ce
scrie pe ecran plătește de două ori. Fiecare factură din `GET /invoices` și `GET /invoices/:id` poartă
acum `paid` și `outstanding`, atașate de `ArrearsService.withBalances` din aceeași sumă a plăților
reușite și aceeași scădere (`outstandingOf`) ca lista de restanțe — nu o a doua definiție. În web,
`leftToPay` citește `outstanding`; un ecran nou care arată cât datorează o familie îl folosește pe el,
nu `amount`.

**Încasarea se începe de la factură, iar suma precompletată e restul, nu totalul** (E16 S5).
`/admin/restante` și `/admin/payments/new` deschid amândouă `AdminPaymentModal`, care se completează
din rândul de restanță — familia, factura și `outstanding`. Precompletarea cu totalul facturii, cum
era înainte, punea 350 în locul unei familii care mai avea 150 de plată. Și **lista facturilor care
mai au ceva de plată e lista de restanțe**, nu o interogare nouă peste toate facturile: „mai are
ceva de plată" înseamnă `pending` sau `overdue` cu rest pozitiv, adică fix ce răspunde
`GET /invoices/arrears`. Dacă adaugi un al doilea loc de unde se încasează, cere-i tot un rând de
acolo — o a doua scădere `amount - plăți` ar fi a doua definiție a aceluiași număr.

**Chitanța se datorează când o plată _devine_ `succeeded`, nu când se scrie un rând** (E16 S6).
Regula e în `apps/api/src/modules/payment/payment-receipt.rules.ts`, iar distincția e tot ce
contează: un transfer trecut ca `initiated` cât timp extrasul e provizoriu n-a ajuns încă, iar „am
primit plata" atunci e o promisiune despre banii altcuiva. Deci `createPayment` trimite dacă plata
intră direct reușită, `updatePayment` trimite dacă tocmai a devenit, iar o editare pe o plată deja
reușită nu retrimite — n-a devenit adevărat nimic. `PaymentStatus` are patru stări și **niciuna nu
se numește `PENDING`**: sunt `INITIATED`, `SUCCEEDED`, `FAILED` și `REVERSED`; un test scris cu
`PaymentStatus.PENDING` compară cu `undefined` și trece degeaba.

Restul de plată din chitanță vine din `recomputeInvoiceStatus`, care returnează
`{ paid, outstanding, status }` — suma plăților reușite se face acolo oricum, iar un
`amount - plăți` scris a doua oară în compozitor ar fi exact a doua definiție de mai sus.
**Și numără ținând lacătul rândului de factură**, ca locurile din E11: doi admini care înregistrează
bani pe aceeași factură în aceeași secundă — numerar la birou, un transfer de pe extras — numărau
fiecare pe fotografia lui, deci niciunul nu vedea rândul celuilalt. Pe o factură de 350, 100 și 250
deodată dădeau amândouă „mai are de plată": factura rămânea `pending`, iar fiecare chitanță spunea
familiei un rest pe care tocmai îl achitase. Ecranul de restanțe nu era atins, fiindcă el numără
plățile reușite în loc să citească coloana de stare — exact de aia numărul greșit ieșea doar acolo
unde îl citea o familie. Lacătul stă înăuntrul derivării, nu la cele trei apeluri, fiindcă aia e
singura ușă prin care trec toate. Cheia de
deduplicare e `receipt:<id-ul plății>`, **fără ziua în ea**, spre deosebire de mementourile de
restanță: alea se repetă prin design, o plată se confirmă o dată. Mesajul se pune în coadă în
tranzacția care înregistrează banii — dă-i `EntityManager`-ul —, iar dacă adaugi un al doilea loc de
unde se încasează, cheamă și de acolo aceeași ușă: o încasare tăcută arată pentru familie exact ca
una pierdută.

**Factura fiscală e a SmartBill, iar SmartBill n-are sandbox** (E16 S0–S3). Orice factură emisă
prin API-ul lor e un document fiscal real: ia următorul număr din serie și, cu e-Factura activă,
pleacă în SPV. De aici toată forma integrării, din `apps/api/src/modules/smartbill/` (clientul și
regulile pure) și `apps/api/src/modules/invoice/fiscal-issuing.*` (coada):

- **Implicitul lui `SMARTBILL_MODE` e `off`**, care nu trimite nimic și emite ca înainte, cu PDF-ul
  local. `draft` trimite fiecare factură drept **ciornă** — fără număr, nu e document fiscal, nu
  ajunge în SPV: sandbox-ul pe care nu-l au. `live` emite de-adevăratelea și **refuză să pornească**
  fără două lucruri: `SMARTBILL_LIVE_DB` egal cu `DB_NAME` — regula lui `SEED_ALLOW_NON_LOCAL`,
  pentru că baza de pe stage e seed — **și `NODE_ENV=production`**, spus explicit: un `NODE_ENV`
  nesetat e un laptop. Prima singură nu ținea stage-ul departe — un fișier de stage cu `live` și
  numele propriei baze trece de ea, iar amândouă sunt setări SmartBill, tastate în aceeași
  după-amiază de cine încearcă SmartBill. `NODE_ENV` spune ce e tot backend-ul, deci **stage
  rulează cu `NODE_ENV=stage` și trimite cel mult ciorne.** Regula e una, `mayIssueFiscalDocuments`
  din `smartbill.config.ts`, verificată de trei ori: la pornire, de coadă înainte să revendice un
  rând, și în `SmartBillService.issueInvoice`, ușa pe care trece orice cerere — acolo orice nu e
  ciornă e refuzat în afara producției, pe orice drum ar veni. `test` trece de regulă fiindcă sub
  jest clientul refuză oricum host-ul de producție; testele îl îndreaptă spre
  `test/fake-smartbill.ts`. Verificarea contului se face cu `pnpm smartbill:check`, care doar
  citește, sau cu `--draft`, care trimite o ciornă.
- **Emiterea nu așteaptă după SmartBill.** `POST /invoices/issue` scrie factura cu
  `fiscalStatus = pending`, iar documentul îl face `FiscalIssuingJob`, la 30 de secunde, prin
  `FiscalIssuingService`. Coada sunt coloanele `fiscal*` de pe `invoices` — nu `outbox`, unde un rând
  e un mesaj, și nu o tabelă alăturată; aceeași judecată ca la miniaturi.
- **SmartBill n-are cheie de idempotență, deci proba e seria.** `nextNumber` se scrie pe rând
  (`fiscalExpectedNumber`) **înaintea** cererii, iar rândul trece în `uncertain` tot înainte, deci un
  proces mort la jumătate lasă exact adevărul. Un răspuns pierdut se judecă după ce expiră
  împrumutul de două minute, recitind seria: n-a mișcat → se retrimite; a mișcat → `review`, și un
  om confirmă numărul (`POST /invoices/:id/fiscal/confirm`) sau spune că nu e acolo (`…/retry`).
  **Platforma nu adoptă niciodată un număr fiscal pe care nu l-a văzut venind înapoi.** Cât timp
  un rând e în aer nu pleacă nimic altceva, fiindcă seria s-ar mișca sub judecata lui — și de aceea
  seria configurată în `SMARTBILL_INVOICE_SERIES` trebuie să fie **doar a platformei**.
  **Împrumutul curge de la cerere, nu de la începutul trecerii**: se reînnoiește chiar înaintea ei,
  odată cu numărul așteptat. Ștampilat de la începutul trecerii, o serie lentă le dădea ultimelor
  rânduri un împrumut deja expirat, iar trecerea următoare citea seria înainte ca SmartBill să
  termine de scris — adică o a doua factură. Dacă scrierea de dinaintea cererii nu mai găsește rândul,
  l-a luat altcineva, și nu pleacă nimic. **Și un 2xx al cărui corp nu se citește e tăcere, nu
  succes** (`call`), la fel ca o factură sau o chitanță confirmată fără număr: altfel devenea o
  factură `issued` fără număr, pe care nimic n-o mai putea retrimite, confirma sau șterge.
- **Felul eșecului decide pasul următor**, în `classifyFailure`: un refuz (`errorText` completat,
  **chiar și pe un 200** — „errorText este sursa de adevar") așteaptă un om; un 401 sau un 403 de
  drepturi și blocarea pentru rată (429, sau 403 cu „limita maxima de requesturi", cum se vede de
  fapt) **nu consumă încercarea**; doar tăcerea și un 5xx rămân deschise, fiindcă numai ele pot
  însemna o factură pe care n-a văzut-o nimeni. Limita e 30 de apeluri la 10 secunde per token;
  clientul lasă 400 ms între apeluri și, după o blocare, nu mai sună deloc zece minute.
- **O factură emisă nu se mai corectează din platformă.** `updateInvoice` refuză suma și data, iar
  `deleteInvoice` ștergerea, cu `INVOICE_HAS_FISCAL_DOCUMENT`, pentru `issued`, `uncertain` și
  `review` — corectura e o stornare în SmartBill. Verificarea se face sub lacătul rândului, fiindcă
  și coada revendică cu `FOR UPDATE SKIP LOCKED`. Și **nu salva o factură întreagă citită înaintea
  tranzacției**: `save` din TypeORM scrie înapoi fiecare coloană care diferă, deci coloanele fiscale
  s-ar întoarce cum erau la citire — o factură emisă între timp ar reintra în coadă și s-ar emite a
  doua oară. Exact asta făcea `updateInvoice`; acum scrie doar câmpurile trimise.
- **Plățile ajung și ele singure, iar proba lor e suma încasată pe factură** (E16 S5).
  `PaymentFiscalService` (`apps/api/src/modules/payment/`) trimite fiecare plată reușită de pe o
  factură `issued` ca încasare, `POST /payment`: numerarul ca `Chitanta` numerotată pe
  `SMARTBILL_RECEIPT_SERIES` (obligatorie în `live`, și tot a platformei), transferul ca
  `Ordin plata`, fără document și **fără niciun identificator în răspuns**. Deci un răspuns pierdut
  nu se judecă după serie, ci după `paidAmount` din `GET /invoice/paymentstatus`, citit înainte
  (`fiscalExpectedPaid`) și recitit după: neschimbat se retrimite, mișcat cu exact plata merge la un
  om. O plată pe care SmartBill o ține nu-și mai schimbă suma, data sau metoda și nu se șterge
  (`PAYMENT_RECORDED_IN_SMARTBILL`) — se stornează aici și se șterge de mână acolo. `updatePayment`
  scrie și el doar câmpurile trimise, sub lacătul rândului, din motivul de la `updateInvoice`. În
  `draft` plățile nu pleacă deloc — o ciornă de factură n-are număr, iar dintre încasări doar
  chitanța are ciornă —, iar o chitanță de probă se vede cu
  `pnpm smartbill:check --draft --receipt`. O plată care nu mai e bani — inversată cât răspunsul
  ei era pierdut — **iese din coadă** când se judecă răspunsul, nu se retrimite; `claimNext` ia doar
  plăți reușite, iar „retrimite" pe una sub revizie care nu mai e bani o scoate, cu urmă în jurnal.
  Iar o factură pe care SmartBill n-o mai găsește trimite la un om **doar acea plată**: înainte
  oprea toată coada, la fiecare trecere.
- **Divergența cu SmartBill se derivă; pe factură stă doar ce a spus SmartBill** (E16 S8).
  `fiscalPaidAmount`, `fiscalTotalAmount` și `fiscalCheckedAt` sunt citirea lor, reîmprospătată o
  dată pe zi de `FiscalDivergenceJob`; verdictul e `divergenceOf`, calculat când se citește
  raportul (`GET /invoices/fiscal-divergences`), față de plățile de atunci. O încasare înregistrată
  golește `fiscalCheckedAt`, iar o factură necitită nu se judecă — altfel o cifră veche ar fi o
  alarmă falsă. Dacă adaugi un drum care schimbă partea SmartBill a unei facturi, golește-l și acolo.
  Iar citirea **se scrie doar dacă nicio plată a facturii nu s-a înregistrat după ce a început**:
  altfel punea la loc, cu cifra de dinainte, verificarea pe care tocmai o golise plata.
- **În `live`, PDF-ul e al lor, la aceeași cheie** (`invoicePdfKey`, mutată în `invoice-pdf-key.ts`
  ca să nu facă ciclu): nu se mai generează nimic cu PDFKit, iar descărcarea, exportul și ștergerea
  îl citesc fără să știe cine l-a făcut. Documentul poartă **o singură linie, la suma calculată de
  platformă**, cu reducerile în mențiuni — liniile de reducere ale SmartBill au capcane (o valoare
  pozitivă _crește_ totalul, o linie fără `numberOfItems` e ignorată cu 200), iar potrivirea la leu
  e promisiunea din E15 S7. Din familie pleacă numele și adresa, atât, iar `sendEmail` e fals:
  familia aude de la platformă, prin coadă.
- **Extrasul bancar se potrivește cu propuneri, niciodată singur** (E16 S8,
  `apps/api/src/modules/reconciliation/`). CSV-ul băncii se citește după cuvintele din capul de
  tabel, nu după o bancă anume — preambul, `;` sau `,`, credit și debit sau o sumă cu semn,
  `1.234,56` sau `1,234.56` —, iar un rând care nu se citește se raportează cu numărul lui, nu se
  sare. Se păstrează doar intrările, iar amprenta liniei (conținutul plus locul printre liniile
  identice) e unică, deci un extras importat de două ori nu adaugă nimic. Propunerile sunt două:
  **după numărul fiscal al facturii** din detalii — sigure, se confirmă toate dintr-o apăsare — și
  **după numele plătitorului și suma rămasă exact** — doar propunere, câte una. Cele sigure se judecă
  **împreună**, cea mai veche întâi, fiecare față de ce au lăsat cele dinainte
  (`withRunningRemainder`): judecate una câte una, două linii care citează aceeași factură treceau
  amândouă, iar o apăsare o înregistra plătită de două ori. „Ce mai datorează o
  factură" vine din `ArrearsService.list`, nu dintr-o interogare nouă. O linie confirmată devine plată
  prin `PaymentService.createPayment`, în tranzacția liniei — `createPayment` primește acum
  `EntityManager`-ul apelantului —, deci familia primește confirmarea și plata pleacă spre SmartBill
  ca oricare alta. Starea liniei se derivă (are plată, e pusă deoparte, sau așteaptă); o plată
  ștearsă o pune singură la loc în coadă, prin `SET NULL`. **O linie devenită plată e a familiei**:
  intră în exportul ei (E07 S4), iar la ștergere pierde plătitorul și detaliile — familiile scriu
  acolo numele copilului la fel de des ca numărul facturii —, și păstrează cifrele, referința băncii
  și amprenta. Amprenta trebuie să rămână: fără ea, același extras importat din nou ar aduce numele
  înapoi ca linie nouă. Din același motiv, plata primește ca referință doar referința băncii, nu
  detaliile — referința supraviețuiește ștergerii, nota nu.
- **Plata cu cardul, dacă vine, vine prin SmartBill**, nu printr-un procesator integrat aici: ei au
  deja Netopia, EuPlătesc și Stripe, cu link pe factură și încasare înregistrată singură acolo. Dar
  **starea plății trebuie adusă înapoi din SmartBill înaintea linkului** (E16 S8), altfel mementoul
  de restanță scrie unei familii care a plătit ieri.

**Numai marketingul stă pe o bifă** (E17 S4). `Profile.marketingOptIn` e implicit `false` — un
consimțământ pe care nu l-a dat nimeni nu e consimțământ — și gatează exclusiv `queueMarketing`.
`queue` și `queueOrRecord` **nu primesc deloc preferința**, deci nu există argument prin care cineva
ar putea opri o factură, o chitanță, o oră anulată sau proiectul copilului: alea sunt executarea
contractului, nu reclamă. Un refuz **nu** lasă rând în evidență, spre deosebire de un mesaj fără
destinatar — acolo cineva trebuia contactat și n-a fost, aici nimeni nu trebuia.

**Marketingul își poartă propria cale de oprire, iar aceea se adaugă la ușă, nu în șablon**
(E17 S4). Legea 506/2004 art. 12 cere ca refuzul să fie posibil **din fiecare mesaj**, nu dintr-un
ecran, iar GDPR art. 7 alin. 3 ca retragerea să fie la fel de ușoară ca acordarea — un login e mai
greu decât bifa care a pornit mesajele. Footerul se compune în `queueMarketing`
(`unsubscribe-footer.ts`), adică exact acolo unde se verifică și consimțământul: un subsol pe care
fiecare expeditor trebuie să-l lipească e un subsol pe care cineva îl uită, iar aici un mesaj de
marketing fără cale de oprire e **imposibil de trimis**, nu doar descurajat. Patru lucruri:

- **`Profile.unsubscribeToken` e `select: false`**, ca `User.passwordHash`: `GET /profiles` citește
  entități întregi printr-un query builder, deci fără asta listarea de admin ar duce în browser
  jetonul fiecărei familii. Singurul cititor îl cere pe nume — interogarea de audiență a anunțului.
- **Îl scrie un `EventSubscriber`, nu un `@BeforeInsert`.** Un hook de entitate rulează doar când
  ce se salvează e o **instanță** a clasei, iar `register`, programarea la probă și `ProfileService`
  dau lui `save` un obiect simplu. Cu hook, înregistrarea moare pe `NOT NULL` — măsurat, nu
  presupus. De aceea `data-source.ts` are acum și un glob de `subscribers`.
- **Linkul deschide o pagină; scrierea e un `POST`.** Clienții de mail, scanerele de securitate și
  boții de previzualizare deschid linkuri fără om, deci un `GET` care dezabonează la atingere ar
  opri tăcut familii care n-au refuzat niciodată — iar urma ar arăta exact ca oameni care refuză.
  `unsubscribe-needs-a-click.spec.ts` ține linia.
- **Comută într-o singură direcție și nu spune dacă jetonul e real.** Oprește marketingul, niciodată
  nu-l pornește — de aia jetonul poate fi stabil și fără expirare, iar cel mai rău lucru pe care îl
  face unul scurs e să oprească un buletin. Un răspuns care ar distinge „oprit" de „nu există" ar fi
  un oracol pentru ghicit jetoane.

**Al doilea consimțământ din platformă e pe copil, nu pe familie** (E07 S2). `publication_consents`
spune dacă lucrările unui copil pot apărea în materialele școlii, iar un părinte cu doi copii poate
răspunde diferit pentru fiecare. Un rând e un acord de la dat la retras: retragerea ștampilează
`revokedAt`, nu șterge, iar un acord dat din nou e rând nou; `UQ_publication_consents_one_in_force`
ține unul singur în vigoare, iar serviciul scrie cu `ON CONFLICT DO NOTHING`, deci a doua apăsare e
același fapt. Patru lucruri:

- **Nu-l îmbina cu `marketingOptIn`.** Ăla e pe familie fiindcă mesajul pleacă într-o cutie, o dată
  per familie; ăsta e pe copil fiindcă lucrarea e a copilului. Scopul e unul singur azi, `promotion`
  — vitrina din E14 S6 ar fi a doua valoare a enum-ului, nu un `isPublic` pe `Project`.
- **Versiunea e a textului din `docs/legal/acord-lucrari.md`**, copiată pe rând din
  `PUBLICATION_CONSENT_VERSIONS`, pe care `publication-consent.texts.spec.ts` o ține egală cu capul
  fișierului — aceeași procedură ca `LEGAL_DOCUMENT_VERSIONS`.
- **Două uși, o singură coloană între ele.** Părintele dă și retrage din „Profil"; biroul consemnează
  din pagina familiei un acord semnat pe hârtie. `grantedVia`/`revokedVia` spun care, jurnalul spune
  cine, iar familia primește confirmarea **de fiecare dată** — e singura cale prin care observă un
  acord consemnat pe copilul greșit.
- **Retragerea anunță biroul în aceeași tranzacție**, fiindcă platforma nu publică nimic: site-ul e
  static și nu citește din ea, iar rețelele sociale sunt în afara ei. Verificarea „în momentul
  afișării" e deci `/admin/acorduri`, citită înainte să plece o lucrare spre site. Când revine vitrina
  automată, interogarea ei citește aceeași tabelă — nu un instantaneu pus lângă.

**Un mesaj care n-are unde să plece lasă un rând, nu o linie de log** (E17 S5). `queueOrRecord` din
`OutboxService` primește destinatarul oricare ar fi el și scrie `undeliverable` cu motiv tipizat
(`no_address` / `unconfirmed_address`) când n-are adresă — starea e terminală și dispecerul n-o
revendică niciodată, fiindcă niciun backoff nu face să apară o adresă. Nu te ramifica pe
`if (profile.email)` înainte de coadă: exact aia punea faptul într-un log pe care nu-l citește
nimeni, iar „părintele n-a fost anunțat" arăta ca o coadă blocată. Adresa rămâne goală pe rândul
nelivrabil — una inventată n-ar putea fi deosebită de una reală care a respins mesajul.

**Iar „n-a ajuns" are trei feluri, nu unul — și tabloul de bord le numără pe toate.**
`DeliveryLogService.health` (`apps/api/src/modules/mail/delivery-log.service.ts`) e proprietarul
întrebării, iar `OverviewService` o cere, nu o recalculează — regula E21. Cele trei:

- `failed` — furnizorul a refuzat definitiv, sau s-au consumat cele șapte încercări.
- `undeliverable` — n-a avut unde să plece, de mai sus.
- **`stuck` — și ăsta nu e o stare, e un ceas.** Un mesaj pe care dispecerul nu l-a revendicat
  rămâne `pending`, adică arată exact ca unul care își așteaptă backoff-ul; singura diferență e
  `nextAttemptAt`, care a trecut. Pragul e `STUCK_AFTER_MINUTES` din `outbox-health.rules.ts`:
  cincisprezece minute, adică **treizeci de ticuri ratate** la `POLL_INTERVAL_MS` de 30 de secunde,
  și pleacă pe sârmă ca să numească ecranul linia, nu s-o deseneze a doua oară.

Tile-ul scria „Mesaje nelivrate" și număra doar al doilea fel, deci un mesaj refuzat de furnizor
arăta zero, iar o coadă **oprită de tot** arăta tot zero — exact defecțiunea pe care epicul o
descrie: „un mesaj care nu ajunge nu seamănă cu o eroare, seamănă cu liniște."

**Interogarea restrânge pe `status`, și nu din eleganță.** Rândurile `sent` se șterg abia după 12
luni (E22 S3) — scrie la `IDX_outbox_claim` pe entitate —, deci ele _sunt_ tabela, iar tot ce vrea
întrebarea asta e în cele câteva rânduri care nu sunt trimise. Măsurat pe 200.000 de rânduri: fără `WHERE`, scanare
secvențială paralelă la **16,9 ms**; cu el, index-only scan la **0,1 ms**, pe un ecran pe care un
admin îl deschide toată ziua. Dacă adaugi un al patrulea număr aici, ține-l în aceeași listă de
stări.

**Anunțul e singurul mesaj care pleacă la mai multe familii, deci singurul cu reguli proprii**
(E17 S7). `apps/api/src/modules/announcement/` trimite către o grupă, o locație sau toată școala, iar
audiența se citește din `Child.group` — familiile cu un copil într-o grupă din perimetru, probele
incluse, deduplicate **per părinte**. Patru lucruri care se ratează ușor:

- **Un anunț n-are voie să numească un copil.** Verificarea caută prenumele fiecărui copil din
  școală în subiect și corp, fără diacritice și pe cuvinte întregi, iar rezultatul e **avertisment cu
  confirmare** (`ANNOUNCEMENT_NAMES_A_CHILD` plus `acknowledgeWarnings`), aceeași formă ca vârsta de
  la E11 S6. Blocajul ar fi greșit: Maria e și sală, și stradă, iar o verificare care se declanșează
  mereu devine o bifă apăsată reflex.
- **`kind` decide dacă se consultă `marketingOptIn`.** `transactional` (implicit) ajunge la toți,
  `marketing` trece prin `queueMarketing`. Fără el, ecranul ăsta ar fi fost portița prin care orice
  mesaj ajunge la orice familie, indiferent de comutatorul din E17 S4.
- **A doua apăsare identică e refuzată de un index unic**, nu de un `if`: `Announcement.dedupeKey` e
  audiență + subiect + corp + **ziua școlii** (`schoolDay` din `apps/api/src/common/school-clock.ts`),
  hash-uite. O corectură cu alt text trece — e alt mesaj.
- **`OutboxService` nu știe nimic despre anunțuri.** Serviciul își leagă singur rândurile prin
  `outbox.announcement_id`, după ce le pune în coadă și în aceeași tranzacție, deci coada partajată
  se poartă identic pentru ceilalți expeditori. `declinedCount` se stochează pe anunț fiindcă un
  refuz de marketing nu lasă rând — numărat din coadă ar fi mereu zero.

**Pâlnia începe în afara contului, și se termină la un om** (E20). `apps/api/src/modules/lead/` ține
tot ce e între „cineva a întrebat" și „s-a înscris". Două lucruri o fac diferită de restul codului:

- **`GET /trial/slots` și `POST /trial/bookings` sunt singurele rute publice în afară de
  autentificare și health**, și sunt trecute pe nume în lista albă din `authorization.spec.ts`. Sunt
  publice prin decizie: o programare la probă e un lead, nu o obligație, iar dacă ar cere cont,
  bariera pe care epicul o coboară ar fi exact bariera pusă la loc.
- **Nu se creează niciun cont, dar locul e real.** Programarea scrie `Profile` (coajă, fără cont și
  **fără email și telefon** — coloanele alea sunt unice, iar un formular public n-are voie să scrie
  în rândul altei familii), `Child` și o înscriere `TRIAL`, toate într-o tranzacție, iar înscrierea
  trece prin `EnrollmentService.enrol` ca oricare alta. De aici două schimbări în E11: `enrol`
  acceptă acum un `EntityManager`, ca să intre în tranzacția apelantului, și **blochează rândul
  grupei** (`FOR UPDATE`) cât ține verificarea de capacitate — numărarea urmată de inserare o pot
  face două tranzacții deodată, iar doi părinți pe formular la 20:00 nu e un caz rar ca doi admini.

Patru reguli pe care le încalci ușor:

- **Patru din cele șase stări nu se scriu de la niciun ecran.** `trial_scheduled` vine din
  programare, `trial_held` din catalog (`LeadProgressService`, chemat din
  `AttendanceService.settleLead` — singurul lucru pe care marcarea îl mai decontează), iar
  `enrolled` / `lost` din `resolveTrial` în E11. `UpdateLeadDto` **nu are câmp
  `status`**, iar cele două stări pe care le declară un om au endpoint-uri proprii. Un câmp de stare
  pe un PATCH ar lăsa un ecran să scrie `înscris` pe o familie pe care n-a înscris-o nimeni — și aia
  e cifra pe care se sprijină tot raportul de pâlnie.
- **Orele se filtrează pe dată, nu pe grupă.** Ce alege părintele e o zi, iar o grupă cu un loc
  liber n-are niciunul în ziua în care biroul a mutat deja un copil acolo — și are din nou săptămâna
  următoare. Lista cere `freeSeatsAtSessions` pentru toate orele pe care e pe cale să le ofere,
  într-o singură interogare, iar la trimitere se reverifică ora aleasă, în tranzacție: între
  fotografie și buton se poate strecura o mutare. **O oră de azi care a început nu se oferă și nu
  se primește** (revizuirea din 25 septembrie 2026): părinții programează seara, iar ora de la 16:00
  era încă pe listă după ce se terminase — un loc ținut pentru o probă la care nu mai putea veni
  nimeni, până când recontactarea îi spunea familiei că a lipsit. Comparația e pe ceasul școlii, ca
  text, ca toate celelalte „a început?" din aplicație. **Și o oră se oferă doar cât ea și fiecare oră
  de după ea a grupei mai au un loc**: proba ține scaunul până o decide cineva, deci stă și în orele
  următoare, iar `enrol` refuză o probă pe care o oră de mai târziu n-o mai încape. Lista citește de
  aceea toate orele din față, nu doar cele trei săptămâni oferite — altfel oferea o zi la care
  programarea răspundea „nu mai sunt locuri".
- **Formularul nu se termină niciodată într-o eroare.** Fără loc liber, cu ultimul loc luat între
  timp, sau fără nicio oră potrivită — toate trei scriu un lead marcat `noSeats` și răspund „te
  contactăm noi". Cel mai prost rezultat nu e o pagină de eroare, e o familie care pleacă fără ca
  școala să știe că a trecut pe acolo. Numărul ăla e și singura măsură a cererii pe care școala nu o
  poate servi: cine nu găsește oră nu intră în nicio rată de conversie.
- **`lastActivityAt` e o coloană proprie, nu `updatedAt`.** Job-ul de memento nu scrie în ea, deci un
  lead nu poate deveni „proaspăt" fiindcă a fost amintit.
- **Un catalog nemarcat nu e o absență.** Recontactarea după neprezentare cere ca ședința să fi fost
  marcată de cineva; altfel i-am spune unei familii că a lipsit de la o oră la care poate a fost.

**Pagina `/proba` e una dintre cele două pagini publice care ating backend-ul** — cealaltă e
`/dezabonare` din E17/S4 —, ceea ce contrazice regula de mai sus doar în aparență: orele se încarcă
exclusiv în client, iar când nu se pot încărca, formularul tot se trimite și cititorul primește
numărul de telefon. Consecința pentru cele două branch-uri: **nu se aduce pe `release/prod`** până
nu rulează un backend (E01 S4) — acolo ar fi o pagină de conversie care nu poate afișa nicio oră.

**Restanța de documente se măsoară cu vârstă, nu doar cu număr** (E17 S8). `pendingSummary` din
`apps/api/src/modules/project/project.service.ts` e proprietarul întrebării „cât așteaptă și de cât
timp" — `OverviewService` o cere, nu o recalculează, iar ecranul grupelor nu mai numără în browser.
Trei lucruri:

- **Vârsta e în zile calendaristice**, prin `daysWaiting` din `project/pending.rules.ts`: un
  document urcat ieri la 18:00 și citit azi la 09:00 are **o zi**, nu zero. Cine citește „de 3 zile"
  numără dimineți în care nu s-a uitat, nu blocuri de 72 de ore.
- **`staleAfterDays` pleacă pe sârmă**, ca pragul de ocupare din E21: e o propunere, iar ecranul
  spune ce linie desenează în loc s-o hardcodeze.
- **Cifra stă în meniu**, prin `pendingProjectsStore` încărcat din layout-ul `dashboard`, fiindcă
  riscul pe care îl acoperă e că nimeni nu apasă butonul — iar un număr la care trebuie să navighezi
  nu acoperă asta. `null` la `oldestDays` înseamnă „nimic nu așteaptă"; zero înseamnă „a venit azi".

**Job-urile cu cron sunt oprite sub `NODE_ENV=test`, prin `disabled` pe decorator.** Jest setează
variabila singur, iar ambele suite construiesc `AppModule`-ul real: o rulare care prinde exact
secunda de declanșare ar scrie un rând în `outbox` în mijlocul aserțiunilor altcuiva, o dată pe an
și niciodată reproductibil. Consecința pentru tine: **un `@Cron` nu se declanșează în teste**, deci
logica de selecție se scrie ca metodă publică, iar cron-ul doar o cheamă — vezi
`apps/api/src/modules/class-session/unmarked-attendance.job.ts`, care își face treaba în
`reportFor(date)`. Testele cheamă metoda; ce testează cron-ul e ora, și aia nu se testează.
**`@Interval` n-are obiect de opțiuni**, deci acolo garda se scrie ca prima linie a metodei —
`if (process.env.NODE_ENV === 'test') return;` — vezi `OutboxDispatcher` și `LateRegisterJob`.

**Mementoul zilnic de prezență pleacă la 10:00 pe fusul școlii, nu al serverului.** `@Cron` primește
`timeZone: 'Europe/Bucharest'`, iar ziua raportată se calculează prin `Intl` pe același fus — altfel
un server în alt fus ar întreba de altă zi decât cea care tocmai s-a încheiat la școală, și ar
raporta liniște. Adresa e `MAIL_OFFICE_ADDRESS`, opțională, cu `office@itbridgeschool.com` ca
implicit; e prinsă deja de wildcard-ul `MAIL_*` din `turbo.json`, deci nu-i trebuie linie proprie.
Mesajul pleacă doar dacă există ședințe nemarcate, și e unul singur pe zi: `dedupeKey`-ul e
`unmarked-attendance:<zi>`, deci o repornire la 10:05 nu trimite a doua oară.

**Al doilea memento de prezență pleacă în timpul orei, și fereastra lui are două capete.**
`late-register.job.ts` (E12 S7) verifică din 5 în 5 minute și alertează biroul pentru o ședință care
a început acum cel puțin 15 minute și n-are nicio prezență marcată. Capătul de sus e cel care se
uită ușor: fereastra **se închide când se termină ora**, fiindcă singurul motiv pentru care mesajul
există e că un telefon mai poate schimba răspunsul. Fără el, un proces picat toată după-amiaza s-ar
trezi trimițând o duzină de alerte despre ore terminate demult — iar ce ratează fereastra apare
oricum a doua zi la 10:00. `dedupeKey`-ul e `late-register:<id>:<YYYY-MM-DDTHH:mm>` — ședința și ora ei
de început: ședința rămâne în fereastră tot restul orei, deci fără cheie biroul ar primi același mesaj
la fiecare tick, iar ora e în cheie fiindcă `moveSession` păstrează rândul — o ședință mutată în altă
zi e o nouă ocazie și primește o alertă proprie. Ambele mementouri pun
aceeași întrebare, `ClassSessionService.findUnmarkedSessions` — „nemarcat" n-are voie să însemne
două lucruri în funcție de care email îl citești.

**Orele se compară ca text, în ceasul școlii, niciodată ca instante.** `schoolLocalStamp(now)` și
`schoolDay(now)` stau în `apps/api/src/common/school-clock.ts` — au ieșit din
`absence-notice.rules.ts` când al treilea apelant a fost în afara prezenței, iar fișierul ăla le
reexportă, deci importurile vechi merg mai departe. Împreună cu `sessionStartStamp(session)`, rămas
lângă regula lui, dau `YYYY-MM-DDTHH:mm` pe `Europe/Bucharest`, iar comparația e pe string-uri
(`<` pentru un anunț „înainte de oră", `<=` la deschiderea ferestrei de 15 minute). Ședința ține
o dată locală și un `HH:mm:ss` local, deci orice comparație cu un instant UTC e capcana de o zi de
mai jos, cu altă față. Când ai nevoie de „acum minus 15 minute", **mută instantul și apoi
formatează** — nu scădea din text.

**Scheduler-ul trebuie să ruleze într-o singură instanță.** `FOR UPDATE SKIP LOCKED` face două
treceri simultane inofensive una față de alta, dar doi worker-i PM2 s-ar trezi amândoi la fiecare
tick. Fixarea e în `/srv/itbridge/ecosystem.config.js`, pe instanță: `instances: 1` și
`exec_mode: 'fork'`. Fișierul **nu e în repo** — vezi „Infrastructură — stare reală". Dacă cineva
trece vreodată aplicația pe `cluster`, asta e linia care se rupe prima, tăcut.

**Orizontul de opt săptămâni se rulează acum singur, iar până de curând nu se rula.** Ședințele se
scriu prin `POST /class-sessions/generate` (admin) **și** prin `TimetableHorizonJob`
(`apps/api/src/modules/class-session/timetable-horizon.job.ts`), la 04:30 pe ceasul școlii, pentru
toate grupele active. Butonul rămâne: jobul nu e altă cale, e aceeași cale chemată de un ceas —
`topUp` deleagă lui `generateSessions`, fiindcă acolo stau deja calendarul școlar, idempotența și
refuzul pe grupă inactivă, iar a doua implementare a lui „ce zile are grupa asta" e exact felul în
care două răspunsuri încep să difere.

**De ce e zilnic și nu săptămânal**: orizontul se măsoară din _ziua de azi_, deci o trecere
săptămânală l-ar lăsa să respire între șapte și opt săptămâni. Zilnic ține promisiunea pe care o face
constanta, și nu costă nimic — generarea e idempotentă pe loc (`scheduledFor`, mai sus) și lasă
neatins ce există, indiferent de stare, deci o dimineață obișnuită nu scrie niciun rând și nu spune
nimic în log.

Ce se strica înainte merită ținut minte, fiindcă e forma pe care o iau lipsurile astea: orizontul nu
se termina, se retrăgea. Prezența se marchează pe `POST /attendance/session/:classSessionId`, deci o
oră fără rând nu se poate marca deloc — 404, și un ecran gol. Primul defect apărea la opt săptămâni
după ultima apăsare și arăta ca un bug în catalog, nu ca un orar pe care nu-l scrisese nimeni; cine
afla era profesorul din sală.

Restul a ce e programat în backend — dispecerul de outbox și verificarea de la minutul 15
(`@Interval`), mementoul de la 10:00, cele două notificări către părinte din E12 S4, mementourile de
restanță din E16 S7, măturarea ofertelor de pe lista de așteptare din E11 S3 și pasul de miniaturi
din E14 S3b (`@Cron`), plus purjarea sesiunilor, care stă în continuare pe un `setInterval` propriu
în `apps/api/src/modules/auth/session.service.ts` — **nu generează orar**, niciunul.

**Datele calendaristice se construiesc din componente locale, niciodată printr-un ocol prin UTC.**
TypeORM scrie o coloană `date` citind componentele locale ale valorii, iar `new Date('2026-08-29')`
e miezul nopții **UTC** — deci la vest de Greenwich se salvează ziua dinainte. În sens invers,
`toISOString().slice(0, 10)` pe o dată construită local dă ziua dinainte la est de Greenwich, adică
exact în România. Amândouă capetele au deja unelte: `parseIsoDate`, `toIsoDate` și `addDays` din
`apps/api/src/modules/class-session/class-session.dates.ts`, iar în frontend `toDateKey` și
`todayKey` din `apps/web/app/composables/useAttendanceCalendar.ts`, care compară string-uri
`YYYY-MM-DD` și nu ating deloc `Date`. Greșeala e de exact o zi, apare doar în unele fusuri și nu se
vede la review.

**Testele de pe `api` rulează pe ceasul școlii, `TZ=Europe/Bucharest`, iar asta e portanță, nu
preferință.** CI rulează în UTC, care e exact singurul fus în care greșeala de mai sus **nu se
vede**: o coloană `date` citită înapoi ca `Date` stă la miezul nopții local, iar `toISOString()` pe
ea dă ziua dinainte doar la est de Greenwich. Adică suita ar fi verde pe o mașină care nu e a
școlii, pentru o școală care își citește toate datele la București. Nu e ipotetic — `sameValue` din
`personal-fields.ts` compara data nașterii prin `toISOString()` și raporta drept schimbată una pe
care n-o atinsese nimeni, scriind în jurnal că cineva a editat data nașterii unui copil. Testul
pentru asta trece în UTC și pică în Europe/Bucharest.

`TZ` trebuie pus **înainte să pornească Node** — o atribuire pe `process.env.TZ` într-un spec e
prea târziu, fiindcă fusul e deja memorat —, deci stă pe scripturile din `apps/api/package.json`.
`tests-run-on-the-school-clock.spec.ts` verifică și declarația, și efectul; dacă adaugi un script
care pornește jest, treci-l acolo.

Într-un formular de admin, o dată se alege prin `AdminDateField`, al cărui model e chiar string-ul
`YYYY-MM-DD`: trecerea la `CalendarDate` stă în `apps/web/app/composables/useDateField.ts` și nu
atinge nici ea `Date`. Nu ancora un popover la `inputsRef` al lui `UInputDate` — e un index de
segment care depinde de locale, iar exemplul din documentația Nuxt UI exact asta face.

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
`ClassSessionStatus` a fost convertit la o uniune de literali la E12 S2, iar etichetele lui au
plecat în `apps/web/app/types/class-session.types.ts`, lângă `SessionStatus` — obiectul
`as const satisfies` cu care se compară un ecran. `AttendanceType` a făcut același drum mai târziu,
și e cazul care arată de ce regula avea nevoie de un test: era încă `enum` acolo, iar cele trei
locuri care îl compară includ tabloul de bord al **părintelui** — un subarbore abandonat acolo e o
familie care nu află dacă i-a venit copilul la oră. Obiectul se cheamă acum `MarkType`, ca
`SessionStatus`: un nume nu poate fi și tip reexportat, și `const` local, în același modul.

**Ce mai e voie să rămână e o listă, iar lista e un test.** `contract-carries-no-surprises.spec.ts`
citește sursele din `packages/types/src/` și pică pe nume la orice export de rulare nou, la orice
`enum` în afară de `Weekday` și `Role`, și la orice intrare rămasă în listă după ce lucrul pe care
îl scuza a plecat. Cele nouă rămase au fiecare o propoziție lângă ele: cele trei enumerate mai sus
sunt importate **și** de `apps/api`, restul sunt tabele de etichete ca obiecte simple. Regula era
scrisă de la E12 și era doar proză; între timp `AttendanceType` a trecut pe lângă ea.

În `contract.ts`, o uniune de literali se compară cu enum-ul din API prin `` `${Enum}` ``: enum-ul e
nominal, deci niciun sens al lui `extends` nu ține între cele două, oricât de identice ar fi
valorile. Template literal-ul îl reduce exact la string-urile care pleacă pe sârmă.

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

**Prețul e pe ședință, nu pe lună: `apps/api/src/modules/invoice/pricing.ts`.** 87,50 lei/ședință
primul copil, 62,50 fiecare frate. Pe o lună de patru ședințe iese exact 350 și 600 — numerele pe
care le știe toată lumea — dar o lună cu vacanță costă mai puțin, automat. Asta a făcut școala
dintotdeauna cu calculatorul; codul factura 350 fix și supra-factura fiecare lună scurtă.

**Tariful întreg merge la copilul cu cele mai multe ședințe**, restul iau tariful de frate. Sortarea
e toată regula: fără ea, suma ar depinde de ordinea rândurilor dintr-o interogare. Un copil cu zero
ședințe nu consumă tariful întreg.

**Emiterea se face din `/admin/invoices/emitere`, și numai de acolo**: un ecran cu familiile ca
arbore, o valoare per copil, total jos, un buton. **Valoarea e citită, nu tastată** (E15/S9):
serverul numără ședințele lunii din cataloage — `billable-sessions.rules.ts` e regula,
`BillableSessionsService` singura interogare — iar ecranul le arată, cu desfacerea lor și cu
ședințele fără catalog deasupra. `POST /invoices/issue` primește luna și data, nimic altceva; cine
apasă s-a uitat la ce s-a întâmplat, nu la ce a tastat cineva. Singurul număr care mai intră de mână
e **corectura pe copil** (`SessionCountOverride`, `PUT|DELETE /invoices/overrides`): o decizie
consemnată — cât, de ce, cine, când —, un rând per copil și lună, aplicată în fișă ca factura să
poarte același număr pe care l-a arătat ecranul, și înghețată odată ce familia are factura lunii.
Factura poartă o singură linie de produs, deci corectura nu contrazice niciodată catalogul; ce
apără rândul e evidența școlii.

**O probă decisă rămâne gratuită, iar prima și ultima zi a unei înscrieri le decide catalogul**
(revizuirea din 25 septembrie 2026). Regula citea statusul: `TRIAL` nu se factura, dar în clipa în
care biroul decidea — acceptată pe același rând, refuzată, închisă sau mutată în altă grupă —
statusul nu mai spunea „probă", iar ora de probă intra pe factură. `Enrollment.trialUntil` e ziua
deciziei, scrisă de fiecare ieșire din `TRIAL` (`close`, `transfer`, `resolveTrial`), și nimic până
la ea inclusiv nu se facturează — ziua deciziei întreagă, chiar dacă biroul a decis înaintea orei ei:
o oră promisă gratuit și facturată e greșeala mai rea dintre cele două. Un rând care n-a fost decât
probă nu apare deloc pe fișă, altfel familia primea o factură de 0 lei fără să se fi înscris vreodată.
Cealaltă jumătate e ziua: `enrol`, `transfer` și `close` scriu azi, iar copilul era în grupă
dimineață și nu mai e seara — nimic de pe rând nu spune de care parte a orei a căzut schimbarea. Așa
că o oră din prima sau din ultima zi se facturează **numai dacă copilul e în catalogul ei**, marcat
prezent sau absent: catalogul listează grupa așa cum era când a fost luat. Familia care a retras
copilul luni dimineață nu plătește ora de luni seara; cea care a spus la plecare că a fost ultima,
da. Zilele dintre capete se facturează ca până acum, cu sau fără catalog, iar o oră atinsă de două
rânduri — copil scos și pus la loc în aceeași zi — se facturează o dată. `membersOn` citește ziua de
final ca plecată, ca registrul.

**Emiterea nu desenează nimic; PDF-ul platformei se desenează la prima descărcare** (E15 S6). În
`off` și `draft`, fiecare familie era un PDF desenat cu PDFKit și urcat în bucket cu tranzacția
deschisă — 100 de familii în 8,2 s, iar o stocare picată dădea înapoi toată luna; acum emiterea e
numai scriere în bază (0,38 s), iar `getInvoicePdf` desenează din rând și păstrează la aceeași cheie.
Cine primește desen o spune `servesLocalPdf` din `fiscal-issuing.rules.ts`, la descărcare, nu la
emitere. Trei lucruri de ținut minte:

- **Tot ce se tipărește vine din rând**, fiindcă desenul poate veni la săptămâni după emitere: data e
  `dateIssued`, niciodată `new Date()` — vechiul PDF tipărea ziua desenării —, iar scadența vine din
  `dueDateFor`, aceeași din care numără restanțele.
- **O editare a sumei sau a datei aruncă desenul păstrat, iar ștergerea îl ia cu ea**, după commit și
  fără ca un eșec de stocare să strice ceva: rândul e evidența, PDF-ul doar un desen al lui.
- **Reducerile se citesc la desenare, și e sigur fiindcă o reducere pe o lună facturată e
  înghețată** (`DISCOUNT_MONTH_INVOICED`, în `DiscountService`). Suma facturii s-a calculat o singură
  dată, la emitere; o reducere schimbată după aceea nu mai ajungea nicăieri. Pe PDF stau ca pe
  documentul SmartBill: o linie la suma facturii, iar reducerile în cuvinte, prin `describeDiscount`
  — nu adunate înapoi în lei, cum făcea înainte cu o reducere de 50%.

Al doilea drum a fost **șters** (E18/S5b): `/admin/invoices/new` și `/admin/invoices/preview/:month`
emiteau aceeași lună prin `POST /invoices/preview` plus `POST /invoices`, adică pe numere calculate
de server, nu văzute de om. Ecranul lui arăta „Număr Copii" numărând toți copiii familiei, deși
factura numără de la E11/S4 doar înscrierile `ACTIVE` — două răspunsuri la aceeași întrebare, iar
cel de pe ecran era greșit. `POST /invoices` și `POST /invoices/preview` **există în continuare pe
server** și sunt testate; nimic din interfață nu le mai cheamă. Dacă adaugi un al doilea loc de unde
se emite, e aproape sigur o greșeală: locul e unul.

**O reducere știe dacă e în lei sau în procente, iar procentul se aplică pe prețul de listă.**
`Discount.type` (E15 S5) e `fixed` sau `percent` — un `50` stocat e cincizeci de lei sau jumătate de
factură, iar numărul singur nu poate spune care. `discountTotal` din `pricing.ts` calculează fiecare
procent din **prețul de listă**, niciodată dintr-un total curent, deci ordinea în care vin reducerile
din bază nu poate schimba factura; două reduceri de 50% duc totalul la zero, nu la un sfert.
Reducerea se rotunjește ea însăși la bani, ca linia tipărită și totalul să se adune pe hârtie.
Plafonul de 100% e în `DiscountService`, nu în DTO: o actualizare poate schimba tipul într-o cerere
și valoarea în alta, iar doar starea de după îmbinare spune ce ajunge stocat.

**Recomandarea se dă la apăsare, iar o apăsare în plus e o lună în plus** (E20 S5). Controlul din
profilul familiei e un `−  n luni  +`: `POST /discounts/referral` adaugă o lună la 50%,
`DELETE /discounts/referral/:parentId` o ia pe ultima înapoi, iar `GET` pe aceeași cale întoarce
starea. Toate trei răspund cu **lunile acoperite**, nu cu rândul atins — un ecran care și-ar aduna
singur apăsarea ar diverge de server în clipa în care altcineva șterge o lună din `/admin/reduceri`.

Trei reguli care par detalii și nu sunt:

- **A doua apăsare dă a doua lună, nu o reducere mai mare pe aceeași lună.** Procentele se adună pe
  prețul de listă (`discountTotal`), deci 50% peste 50% e o lună gratuită, iar una apărută dintr-un
  dublu-clic nu se deosebește de una hotărâtă. `nextUncoveredMonth` caută prima lună neacoperită,
  deci umple întâi golul lăsat de un `−`.
- **Luna o alege serverul**, prin `nextBillingMonthAt` și `monthAfter` din
  `apps/api/src/modules/discount/discount.rules.ts`, pe ceasul școlii și din componentele
  string-ului — prin `Date`, un întâi de lună la 01:00 ar cădea pe luna tocmai facturată, iar 31
  decembrie ar sări o lună.
- **Nimic nu se întinde în trecut**: `+` pleacă de la luna viitoare, `−` ia doar de acolo încolo, și
  scoate numai rândurile recompensei. Un procent tastat din formular nu e al butonului să-l
  retragă, iar peste el `DISCOUNT_ALREADY_GRANTED` refuză să se adune. Refuzul e în serviciu, fără
  index unic în spate, și nu mai lasă nici duplicatul pe care îl lăsa înainte: două apăsări în
  aceeași secundă ajung pe aceeași lună, iar lacătul lunii (mai jos) o pune pe a doua să aștepte,
  să găsească rândul primei și să fie refuzată — apăsată din nou, cade pe luna următoare.

**Ultimul pas al oricărei facturi e tabelul `discounts`, și nu depinde de cum s-a calculat suma.**
Indiferent ce dă totalul — ședințe numărate pe un ecran, prezențe, orice vine după —, rândurile
familiei pe **luna care se emite** (`monthIssued`) se scad la final, prin `discountTotal` din
`apps/api/src/modules/invoice/pricing.ts`. Calea de azi o face în `issueFromSessions`; **o cale nouă
de emitere trebuie s-o facă și ea.** Fără pasul ăsta, familia căreia școala i-a promis jumătate
primește factura întreagă, iar promisiunea rămâne în tabel, nevăzută de nimeni: nu apare ca eroare
nicăieri, fiindcă suma calculată e perfect validă. Cazul obișnuit e −50% din E20/S5, dat dintr-un
buton, deci nu mai e rar.

**Tot ce hotărăște din ce e făcută factura unei luni stă la rând cu emiterea ei** (revizuirea din 25
septembrie 2026). Emiterea citea luna — cataloagele, bifele de vacanță, corecturile pe copil,
reducerile — pe fotografia ei, iar fiecare dintre scriitorii ăștia verifica „luna nu e facturată
încă" pe a lui. O corectură salvată în aceeași secundă cu „emite" ajungea după ce emiterea citise
luna și înainte ca factura ei să existe: nu intra pe factură, și nici nu era refuzată, ci rămânea
înghețată pe o lună care n-o citise niciodată — ecranul arăta un număr și factura purta altul. Acum
e un lacăt consultativ pe lună, `lockInvoiceMonth` (`invoice-month-lock.ts`), luat în tranzacția
care scrie: emiterea îl ia **înainte** să citească luna, iar corecturile, reducerile (și butonul de
recomandare) și bifa de vacanță îl iau înainte să întrebe dacă luna mai e deschisă. Două luni —
mutarea unei reduceri — se iau în ordine, cea mai veche întâi. Un scriitor nou al lunii facturate
trece pe aici, altfel redeschide exact fereastra asta. Tot de aici, bifa de vacanță scrie doar
coloana ei, și doar cât ora nu e anulată: salvarea rândului întreg citit înainte punea la loc o
anulare venită între timp.

**Zero e un răspuns, nu un câmp gol.** O lună fără plată se scrie ca factură `waived`, de 0 lei,
fără PDF. Rândul există fiindcă n-are bani în el: fără el, o familie fără factură pe octombrie arată
la fel cu una a cărei lună a uitat-o cineva. `GET /invoices/:id/pdf` răspunde 404 pe ele, explicit.

**Starea unei facturi nu se tastează, iar o factură cu plăți nu se șterge** (revizuirea din 25
septembrie 2026). `PUT /invoices/:id` primea `status`, iar un `paid` pus de mână spunea „plătit" pe
portal lângă o restanță pe `/admin/restante`, care numără plățile. Acum DTO-ul nu-l mai are (400),
iar o sumă schimbată re-derivă starea în aceeași tranzacție, prin `recomputeInvoiceStatus`: la zero
luna devine `waived` și iese din coada fiscală, ca la emitere — refuzat cu `INVOICE_HAS_PAYMENTS`
cât timp are bani pe ea —, de la zero redevine datorată și intră în coadă, altfel decid plățile. Tot
acolo `if (dto.amount)` înghițea zero fără niciun semn. Iar `DELETE /invoices/:id` refuză cu același
cod o factură cu orice plată, de orice stare: `payments.invoice_id` e `CASCADE`, deci ștergerea lua
banii cu ea, și nimic nu mai spunea că au existat.

`apps/web/shared/courses.ts` ține cifrele pentru site și **încă spune „350 lei pe lună"** — adică
prețul unei luni pline, nu regula. Dacă atingi prețul, potrivește-le pe amândouă.

## Infrastructură — stare reală

**Stage rulează întreg. Din producție, doar site-ul.**

|                 | web                                 | API                                  |
| --------------- | ----------------------------------- | ------------------------------------ |
| `release/stage` | `stage.itbridgeschool.com` (Vercel) | `api-stage.itbridgeschool.com` (EC2) |
| `release/prod`  | `itbridgeschool.com` (Vercel)       | — nedeployat                         |

Frontend-ul e pe **Vercel** pe amândouă branch-urile, configurat din dashboard — nu există
`vercel.json`. Backend-ul e pe o singură instanță **EC2** în `eu-north-1`, cu Postgres 17 pe aceeași
mașină, PM2 pentru proces și **Caddy** pentru TLS și proxy invers către `127.0.0.1` (nu `localhost`:
`main.ts` ascultă pe IPv4, iar numele se rezolvă întâi la `::1`). `api.itbridgeschool.com` n-are
nimic în spate, deliberat: `release/prod` poartă API-ul de dinainte de E08 — zece module față de
nouăsprezece — deci un deploy de acolo n-ar fi o lansare timpurie a platformei ăsteia, ci a alteia,
mult mai vechi. `deploy.yml` refuză branch-ul pe nume.

**Un push pe `release/stage` e un deploy.** `.github/workflows/deploy.yml` cheamă `ci.yml` prin
`workflow_call` — verificările și deploy-ul sunt o singură rulare în Actions, deci deploy-ul nu poate
porni pe un commit roșu — și apoi:

1. schimbă un token OIDC pe un rol AWS de o oră. **Nicio cheie AWS nu e stocată în GitHub**; ce e
   acolo e ARN-ul rolului și id-ul instanței. Trust policy-ul e limitat la `refs/heads/release/*`.
2. trimite comanda prin **SSM**, deci nu se deschide niciun port pentru deploy și nu există cheie SSH
   care să se scurgă.
3. pe instanță rulează întâi `fetch-env.sh` **ca root** — regenerează `/etc/itbridge/stage.env` din
   Parameter Store, iar `/etc/itbridge` e 750 —, apoi `deploy.sh` **ca `deploy`**: SSM rulează ca
   root, iar un `node_modules` al lui root sau un al doilea daemon PM2 ar strica fiecare deploy de
   după ăsta, în timp ce ăsta ar raporta succes.
4. `deploy.sh` face `install`, `build`, **se oprește dacă n-a ieșit `apps/api/dist/main.js`** —
   `deleteOutDir` golește `dist/` la început, deci un build întrerupt lasă procesul viu servind din
   memorie și rupe abia la următoarea repornire —, rulează `migration:run`, apoi `pm2 reload`, și
   așteaptă ca procesul să răspundă pe `/health`.
5. workflow-ul verifică la final `/ready`, nu `/health`: `/ready` atinge Postgres și S3, deci prinde
   un proces pornit lângă o bază la care migrarea n-a ajuns.

**Configurația nu e în repo și nu e în GitHub.** Stă în **SSM Parameter Store** și ajunge pe instanță
ca `/etc/itbridge/<env>.env` (640, `root:deploy`), regenerat la fiecare deploy. O variabilă nouă se
scrie acolo — dacă aplicația n-o vede după un deploy, ori n-a fost pusă în Parameter Store, ori
lipsește din lista lui `fetch-env.sh`.

**`NODE_ENV` pe stage trebuie să fie `stage`, nu `production`.** Nu mai e o etichetă: e singurul
lucru care oprește stage-ul să emită facturi fiscale reale prin SmartBill, care n-are sandbox (E16
S2). Ce e setat acolo azi nu se vede din repo; se pune în Parameter Store ca orice altă variabilă,
iar `ecosystem.config.js` n-are voie să-l suprascrie cu un `env: { NODE_ENV: 'production' }` — ar
face din stage, pentru regula asta, o producție. Jurnalul de pornire spune ce a citit:
`Mode draft under NODE_ENV=stage`.

**`ecosystem.config.js`, `deploy.sh`, `fetch-env.sh` și `backup.sh` nu sunt în repo.** Stau în
`/srv/itbridge/` pe instanță. Dacă le cauți aici și nu le găsești, acolo sunt. Backup-ul e un
`pg_dump` zilnic la 03:15 către S3, cu ținte separate pentru cele două medii.

`docker-compose.yml` conține Postgres și MinIO — infrastructura, și numai ea. Aplicația rulează
direct pe Node, local și în producție. Nu adăuga servicii de aplicație acolo.

**Secretele stau în afara repo-ului, iar `pnpm secrets` o verifică la fiecare PR** (E07 S6). Scanarea
e secretlint peste tot ce urmărește git — arborele, nu istoricul, din motivul paragrafului de mai
jos. Unde stă fiecare secret și ce se întâmplă când se schimbă e în [`docs/secrete.md`](docs/secrete.md);
pe scurt: stage-ul le citește din Parameter Store, site-ul din Vercel, iar pe EC2 nu există cheie
AWS — o pereche statică fără `AWS_S3_ENDPOINT` scrie un avertisment la pornire. Dacă adaugi un secret
nou, adaugă-i și rândul în document.

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

**Accesibilitatea paginilor publice se verifică în CI, cu un browser adevărat.** `pnpm test:a11y`
construiește `apps/web`, servește `.output` pe un port local și trece axe-core peste fiecare pagină
pe care o publică `sitemap.xml`, în temă deschisă și în temă închisă, pe WCAG 2.0 și 2.1 nivel A și
AA — `apps/web/scripts/check-a11y.mjs`, rulat în CI în același job cu lint, typecheck și build.
Patru lucruri de știut înainte să-l atingi:

- **jsdom n-ar folosi la nimic.** Fără cascadă și fără layout, contrastul nu se poate calcula, deci
  axe îl sare — și exact ăla e motivul pentru care verificarea există.
- **Rulează cu `prefers-reduced-motion: reduce`, și nu din politețe.** Blocurile intră prin
  `classical-rise`, iar axe citește culoarea din clipa în care se uită: prinsă la jumătate, aceeași
  clasă `.lede` raportează 1,47:1 pe două pagini și 1,18:1 pe a treia. Cu preferința pornită,
  `useReveal` iese devreme, nimic nu se ascunde și rezultatul e același de două ori.
- **Serverul de probă se pornește fără shell.** Cu `shell: true`, `kill` lua shell-ul și lăsa Nitro
  pe port; rularea următoare își pierdea serverul cu `EADDRINUSE` și verifica vesel build-ul vechi
  rămas acolo, raportând verde pe fiecare pagină. Scriptul se uită acum dacă procesul lui moare și
  cade cu mesaj.
- **Într-un container, Chromium are nevoie de două portițe**, amândouă oprite implicit fiindcă CI
  n-are nevoie de niciuna: `A11Y_CHROMIUM_PATH` pentru un browser deja instalat pe mașină, și
  `A11Y_NO_SANDBOX=1` fiindcă sandbox-ul propriu al lui Chromium nu pornește ca root — și nu pică,
  ci **atârnă**, ceea ce costă o jumătate de oră prima dată.

**Zona autentificată e sub aceeași poartă, dar într-un job propriu.** `pnpm test:a11y:auth`
(`apps/web/scripts/check-a11y-auth.mjs`, E18 S6) se autentifică și trece axe peste cele 55 de
ecrane de admin și de portal, în ambele teme, pe aceleași etichete — plus consola paginilor publice,
citite autentificat. Patru lucruri îl deosebesc de
cel public:

- **Are nevoie de bază de date, seed și un API care răspunde**, fiindcă un ecran fără date pe el nu e
  ecranul pe care îl folosește cineva. De asta e job separat în CI, cu Postgres al lui — MinIO nu,
  `seedInvoicePdfs` întreabă dacă S3 e accesibil și sare când nu e.
- **Originea trebuie trecută în `CORS_ORIGINS`.** Scriptul servește build-ul pe `127.0.0.1:3124`, iar
  fără linia aia browserul refuză fiecare cerere înainte ca API-ul s-o audă: nu apare nimic în logul
  lui, iar simptomul arată exact ca o parolă greșită. Scriptul întreabă întâi, cu un singur OPTIONS,
  și pică imediat cu linia de adăugat — înainte să pornească un browser degeaba.
- **Rutele vin din `app/pages/`**, cum vin cele publice din sitemap: un ecran nou e verificat fără
  să-l adauge nimeni a doua oară. Cele cu `[param]` în cale nu se pot vizita fără un id care există,
  deci sunt tipărite la final cu număr — golul e o cifră, nu o tăcere.
- **Două verificări de nume rulează lângă axe, fiindcă axe nu le are.** axe întreabă dacă un control
  **are** nume și se oprește acolo; amândouă cazurile de mai jos treceau pe fiecare ecran. Primul e
  **același nume de mai multe ori**: douăzeci de rânduri cu „Acțiuni", trei alegătoare de dată cu
  „Alege data din calendar", paisprezece butoane cu „Luna anterioară" — citite ca listă de controale,
  sunt paisprezece intrări identice și nicio cale de a alege una. Al doilea e **un nume în engleză**:
  „Show popup" e implicitul lui reka-ui pe declanșatorul de combobox și a ajuns pe **44 de ecrane**
  dintr-un singur `USelectMenu` neetichetat din navbar-ul de admin. Niciunul nu se putea găsi citind:
  primul apare doar când componenta e desenată în buclă, iar al doilea nu e scris nicăieri în repo.
  De aici și regula: dacă un ecran desenează **mai mult de un** `AdminDateField`, dă-i `label` —
  butonul lui arată o iconiță și nimic altceva, deci numele e tot ce primește cititorul.

**Amândouă porțile apasă și tastele** (`apps/web/scripts/keyboard.mjs`, E18 S6), în trecerea cu
tema deschisă. Fiecare pagină e parcursă cu Tab de sus până jos: fiecare oprire se vede, arată
altfel cât are focus, iar parcurgerea ajunge la capăt. Tot ce ascultă de un clic și arată a control
trebuie să se poată atinge din tastatură. Poarta autentificată intră și iese din cont doar cu
tastatura. Trei lucruri de știut:

- **Verificarea așteaptă hidratarea**, prin `isHydrating` al lui Nuxt, și pică dacă nu-l găsește.
  Vue atașează `@click`-urile la hidratare, deci o pagină citită înainte n-are niciun ascultător și
  trece.
- **Citește doar ce se desenează.** Regula globală de `:focus-visible` pune `outline-offset`, iar un
  element fără contur „se schimba" mutându-l. Un `outline: none` plantat trecea așa.
- **Butonul de calendar al unui câmp nativ de dată e sărit.** Acolo inputul nu mai potrivește nici
  măcar `:focus`, iar inelul îl desenează browserul, în afara stilurilor paginii.

**A doua gardă rulează în același browser: nicio pagină publică nu iese din origine și nu pune
niciun cookie.** `pnpm test:privacy` (`apps/web/scripts/check-third-party.mjs`, E07 S5) încarcă
fiecare pagină din sitemap, **o derulează până jos** și pică la prima cerere către alt domeniu sau
la primul cookie. Serverul de probă, citirea sitemap-ului și pornirea lui Chromium sunt împărțite cu
verificarea de accesibilitate, în `scripts/preview-site.mjs` — de asta variabilele de mediu îi spun
tot `A11Y_*`: sunt scrise mai sus și setate în shell-urile oamenilor, iar una necitită nu dă eroare,
ci atârnă. Portul propriu e `THIRD_PARTY_PORT`, implicit **3126** — a fost 3124, adică fix cel al
verificării autentificate, deci cele două comenzi nu se puteau rula împreună. Patru lucruri de
știut:

- **Derularea e tot rostul rulării.** Bug-ul pentru care există garda era `loading="lazy"` pe
  `<iframe>`-ul hărții: se citește ca reținere și se declanșează când cititorul derulează până la
  el. Fără derulare, iframe-ul de sub linia de plutire nu intră niciodată în vizor și verificarea
  raportează verde pe o pagină care ar chema Google la prima mișcare a cititorului.
- **Cookie-urile se numără de la zero, nu „doar cele neesențiale".** Pe site-ul public numărul
  onest e zero — cele patru cookie-uri pe care le are platforma sunt toate după autentificare —,
  iar politica de cookie-uri promite exact asta cititorului. O linie mai strictă și mult mai ușor
  de verificat.
- **Nu apasă butonul.** Cine cere harta primește Google, cu consecințele scrise lângă buton; garda
  e despre cine nu cere. Dacă adaugi ceva care iese din domeniu, poarta e `consentStore` plus un
  `v-if` — `v-show` sau un `src` schimbat sunt cereri care au plecat deja.

**A treia gardă, pe aceeași listă de pagini: fiecare link intern răspunde 200.** `pnpm test:links`
(`apps/web/scripts/check-links.mjs`, E19 S9) citește linkurile **din pagina randată**, nu din sursă,
deci intră și cele construite la rulare. Trei lucruri:

- **Țintele n-au de ce să fie în sitemap.** Paginile de pe care pleacă vin de acolo, dar
  `/auth/login` e legat din navigație și e dinadins în afara lui — dacă se rupe, e la fel de rupt.
- **Fragmentele se verifică pe id-urile paginii-țintă**, fiindcă sunt jumătatea pe care un cod de
  stare n-o vede: `#o-secțiune` se rupe când cineva reformulează un titlu, iar pagina răspunde în
  continuare 200.
- **Linkurile externe nu sunt verificate**, prin decizia story-ului: un site terț picat o oră nu e
  un motiv ca CI-ul nostru să fie roșu. Sunt citirea lunară din E19 S8 — și, la fel ca vecinele ei,
  verificarea asta nu face nicio cerere în afara originii.

`apps/agent` folosește `node --test`, fără jest și fără nicio unealtă proprie — n-are motiv să
capete una. `pnpm --filter agent test` compilează întâi și rulează din `dist`: un `.ts` cu `import`
e interpretat de Node ca modul ES, iar acolo importurile fără extensie nu se rezolvă.

**Bug-urile cunoscute se scriu ca `it.failing`**, nu ca teste care cimentează comportamentul
greșit. Un astfel de test trece cât timp bug-ul există și devine roșu în clipa în care e reparat —
moment în care se șterge `.failing`. Convenția și-a făcut treaba de trei ori și **în momentul ăsta
nu mai e niciun `it.failing` viu în repo**: prețul la doi copii, prețul la trei sau mai mulți și
crearea de profiluri fără date de contact au devenit toate teste de regresie, iar unul care cimenta
comportamentul greșit — „charges 250 per child for two children" — a fost șters. Dacă vrei un
exemplu, citește-le în `pricing.spec.ts` ca teste normale; convenția rămâne pentru bug-ul următor.

## Planul de lucru

Epic-urile sunt în [docs/epics/](docs/epics/). Citește
[docs/epics/README.md](docs/epics/README.md) pentru harta dependențelor înainte să începi ceva
mai mare decât un bugfix. Lista de lansare a site-ului public — cele douăzeci de întrebări
obișnuite, fiecare cu starea verificată în cod și cu cine o ține — e în
[docs/lansare.md](docs/lansare.md).
