# E04 · Migrări și integritatea datelor

**Status:** în lucru · **Pistă:** Fundație · **Depinde de:** E02 · **Blochează:** E05, E07, E08, E10

## Problemă

`it-bridge-backend/src/app.module.ts` (calea de atunci; azi `apps/api/src/app.module.ts`)
configurează TypeORM cu `synchronize: true`. La fiecare pornire, TypeORM compară
entitățile din cod cu schema din baza de date și o alterează ca să se potrivească. În dezvoltare e
comod. Pe date reale e un mecanism de pierdere de date: o redenumire de coloană devine `DROP COLUMN`
urmat de `ADD COLUMN`, în tăcere, fără confirmare și fără cale de întoarcere.

Nu există migrări, deci nu există istoric al schemei, nici mod de a reproduce o stare anterioară,
nici mod de a aplica o schimbare controlat.

**Șapte epic-uri din acest plan schimbă schema.** Fără migrări, fiecare e o operație pe cord deschis.

Separat, modelul curent are câteva constrângeri care sunt greșite indiferent de migrări, și pe care
epic-urile ulterioare le vor lovi frontal:

- `Group` are `@Unique(['weekday', 'startTime'])` — global, deci două locații nu pot avea cursuri
  în același interval. Vezi [E08](E08-multi-locatie.md).
- `Invoice` are `@Unique(['parent', 'monthIssued'])` — presupune facturare lunară, incompatibil cu
  facturarea pe modul. Vezi [E15](E15-pricing-facturare.md).
- `Payment` **nu are coloană de sumă.** Are `method` și `date`, și e legat 1:1 de `Invoice`. Deci o
  plată parțială nu poate fi reprezentată deloc. Vezi [E16](E16-plati-fiscal.md).
- `Child.createdAt` e `type: 'date'` cu `default: CURRENT_TIMESTAMP` — tip greșit pentru intenție.

## Rezultat

Schema evoluează prin migrări versionate, revizuite în PR, aplicate explicit la deploy, reversibile.
Există un mod repetabil de a obține o bază locală cu date realiste, în sub un minut.

## În scop

- Oprirea `synchronize`, generarea migrării de bază din schema curentă.
- Runner de migrări în procesul de deploy, înaintea repornirii PM2.
- Script de seed pentru dezvoltare.
- Backup automat și o procedură de restaurare **testată măcar o dată**.
- Politică de retenție pe datele care expiră.
- Corectarea tipurilor și constrângerilor evident greșite din lista de mai sus, unde nu depind de
  un epic ulterior.

## În afara scopului

- Schimbările de model cerute de multi-locație, curriculum sau facturare. Acest epic livrează
  _mecanismul_; celelalte îl folosesc.

## Story-uri

### S1 · Migrarea de bază

`synchronize` devine `false`. Se generează o migrare inițială care reproduce exact schema curentă,
verificată pe o bază goală și comparată cu un dump real.

**Acceptanță:** bază goală plus migrări produce o schemă identică cu cea generată azi de
`synchronize`, verificat cu `typeorm schema:log`, care nu trebuie să raporteze nicio diferență.

**Livrat, cu acceptanța verificată literal:** pe o bază goală, `migration:run` urmat de
`schema:log` răspunde _„Your schema is up to date - there are no queries to be executed by schema
synchronization."_

Configurația a fost scoasă din `app.module.ts` într-un `src/data-source.ts` citit și de aplicație,
și de CLI-ul TypeORM. Dacă cele două ar avea surse diferite, o migrare generată local ar înceta să
corespundă cu ce așteaptă aplicația la boot — exact eșecul pe care fișierul îl previne.

`migrationsRun` e `false` intenționat: migrările se rulează explicit în deploy, nu la pornire. La
pornire, o migrare eșuată ar lăsa procesul să se restarteze în buclă în loc să oprească deploy-ul.

**Corectat și tipul greșit din listă:** `Child.createdAt` era `type: 'date'` — deci trunchiat la zi
— cu `default: CURRENT_TIMESTAMP`. Devine `@CreateDateColumn({ type: 'timestamptz' })`, care spune
ce voia să spună și păstrează ora. Celelalte trei constrângeri din listă rămân: depind de
[E08](E08-multi-locatie.md), [E15](E15-pricing-facturare.md) și [E16](E16-plati-fiscal.md).

### S2 · Migrările în deploy

Migrările rulează automat înainte ca versiunea nouă să primească trafic, și opresc deploy-ul dacă
eșuează. În fluxul PM2 din [E01](E01-infrastructura-medii.md), asta înseamnă între `build` și
`reload`.

**Acceptanță:** un deploy cu migrare eșuată lasă versiunea veche în funcțiune.

**Livrat parțial — partea care nu depinde de EC2.**

Comenzile există (`migration:run`, `migration:revert`, `migration:generate`), iar `migrationsRun`
e oprit tocmai ca ele să fie rulate explicit, între `build` și `pm2 reload`. Cablarea în workflow-ul
de deploy așteaptă [E01](E01-infrastructura-medii.md), S4, care așteaptă instanța.

**În schimb a intrat ceva ce epicul nu cerea, dar care s-a dovedit necesar:** `check:schema`, rulat
în CI pe fiecare PR. Cât timp mergea `synchronize`, o entitate schimbată fără migrare se repara
singură la boot. Acum nu se mai repară, dar nici nu se plânge: totul compilează, testele trec pe
schema veche, iar aplicația cade abia în producție, la prima interogare care atinge coloana nouă.
Verificarea construiește o bază de unică folosință din migrări și întreabă TypeORM dacă ar mai avea
ceva de schimbat.

Verificat că prinde: cu o coloană adăugată pe `Group` fără migrare, iese cu cod 1 și tipărește
`ALTER TABLE "groups" ADD "driftProbe" character varying(50)`, plus comanda de generare.

### S3 · Seed pentru dezvoltare

O comandă populează baza locală cu: un admin, ambele locații cu sălile lor, profesori, părinți cu
copii, grupe pe tot programul săptămânal, prezențe pe două luni în urmă, facturi în toate stările.
Suficient cât ecranele de admin să arate ca în realitate, nu goale.

**Acceptanță:** `pnpm seed` pe o bază curată, iar dashboard-ul de admin arată date plauzibile.

**Livrat.** Un admin, nouă grupe acoperind luni–sâmbătă, unsprezece părinți, paisprezece copii,
prezențe pe două luni în urmă, treizeci de facturi în toate cele trei stări, cu plăți pe cele
achitate, plus reduceri.

**Ancorat la ziua de azi, nu la o constantă.** `SEED_TODAY` era `2026-03-16`, ceea ce făcea seed-ul
reproductibil și școala moartă: tot ce scrie atârnă de ziua aia — cele opt săptămâni de prezență din
urmă, orizontul de orar din față, lunile care au facturi. La șase luni după, o bază proaspăt
populată se deschidea pe „Nicio oră azi", cea mai nouă factură era veche de jumătate de an, iar
mementourile de restanță n-aveau ce aminti. Implicitul e acum ziua curentă;
`SEED_TODAY=2026-03-16 pnpm seed` o fixează la loc pentru cine vrea două rulări identice, iar o
valoare care nu e o dată e refuzată la pornire în loc să fie ignorată.

Din același motiv grupele s-au întins pe **șase zile**, nu patru: cu program doar luni–joi, cine
popula baza vineri, sâmbătă sau duminică vedea tabloul de bord gol, iar ecranul de catalog, raportul
de ședințe nemarcate și mementoul de la 10:00 n-aveau pe ce lucra. Duminica rămâne liberă — o școală
care predă șapte zile din șapte ar fi varianta neverosimilă.

**Șase tabele care rămâneau goale sunt acum populate**, fiindcă șase ecrane se deschideau pe nimic
și „nu s-a întâmplat nimic aici niciodată" se citește ca o defecțiune, nu ca o bază nouă: lead-uri
**câte unul pe fiecare dintre cele șase stări** (patru dintre ele nu se scriu de la niciun ecran,
deci un seed care punea doar `new` ascundea exact ce numără raportul de pâlnie), plus unul marcat
`noSeats`; două anunțuri, unul tranzacțional și unul de marketing cu refuzuri numărate pe anunț;
outbox în **toate cele patru stări**, inclusiv rândul `undeliverable` fără adresă — ecranul de
livrări există ca să arate că un părinte n-a fost sărit tăcut, iar un seed doar cu succese l-ar fi
arătat făcând treaba, niciodată treaba pentru care există; două anunțuri de absență, unul în termen
și unul după începerea orei; trei credite de recuperare — unul liber, unul programat pe o oră
viitoare, unul expirat, fiindcă „expirat" nu e o coloană, e calendarul care s-a mișcat; și două
șabloane de email editate, ca editorul să aibă cu ce compara.

Câteva alegeri deliberate, ca ecranele să arate ca realitatea și nu ca un caz fericit:

- **Un părinte din trei nu are cont**, iar două conturi n-au profil deloc. Fluxul
  `GET /users/without-profile` și legarea ulterioară au ce afișa.
- **Doi copii rămân nerepartizați**, deci ecranul „copii fără grupă" nu e gol.
- **O familie are trei copii**, ca bug-ul de preț documentat în [E03](E03-testare-ci.md) să fie
  reproductibil de mână, nu doar într-un test.

Data de referință e fixă, nu `new Date()`, deci două rulări dau aceeași bază. Seed-ul golește tot
înainte — e idempotent — și **refuză să pornească pe altceva decât localhost** fără
`SEED_ALLOW_NON_LOCAL=1`, fiindcă altfel e o comandă care șterge o bază de producție.

Verificat capăt-la-capăt: bază goală → migrări → seed → aplicația pornită din `dist` → login ca
admin → `GET /children` întoarce 14, `GET /invoices` întoarce 30 cu
`{pending: 10, overdue: 4, paid: 16}`.

Locațiile și sălile din formularea originală a story-ului lipsesc: modelul nu are încă noțiunea de
locație, ea intră în [E08](E08-multi-locatie.md).

### S4 · Backup și restaurare

Backup zilnic automat, retenție 30 de zile, stocare în altă parte decât VPS-ul. Procedura de
restaurare e scrisă și **executată o dată**, cu durata măsurată și notată.

**Acceptanță:** există un document cu pașii de restaurare și data ultimei probe reale. Dacă data e
mai veche de șase luni, se repetă.

**Neînceput, și blocat pe infrastructură.** Backup-ul cere instanța EC2 și bucket-ul S3 din
[E01](E01-infrastructura-medii.md), S4. Mai important, acceptanța cere o **probă reală de
restaurare, cu durata măsurată** — un document scris fără ea ar fi exact genul de siguranță
imaginară pe care epicul o respinge. Se face când există ce restaura, pe ce restaura.

### S5 · Retenție

Politică scrisă pentru ce se șterge și când: prezențe vechi, facturi (obligație legală de
păstrare), proiecte ale copiilor, conturi inactive. Implementată ca job programat, aliniată cu
[E07](E07-securitate-gdpr.md).

**Acceptanță:** politica e documentată, implementată și verificabilă.

**Neînceput, dar nu mai e blocat pe contabil.**

**Decizia școlii: documentul fiscal stă în SmartBill, nu la noi.** Platforma nu păstrează PDF-ul
facturii ca arhivă — SmartBill e cel care are obligația de păstrare și instrumentele pentru ea. Ce
ține platforma e _evidența_: rândul din `invoices`, cu suma, luna, starea și plata, care e ce
răspunde la „ce a plătit familia asta în martie" fără să fie un document fiscal.

Consecința pentru retenție e că întrebarea grea a dispărut. Nu mai trebuie să știm câți ani se
păstrează o factură, fiindcă nu noi o păstrăm.

**Restul se rezolvă prin ștergere logică pe contul familiei, aplicată de un admin în momentul
retragerii.** Un cont, copiii lui, prezențele, proiectele și tot ce atârnă de ele trec într-o stare
„retras" în loc să dispară; nu există job care să șteargă ceva de la sine. Motivul e că retragerea
e un fapt pe care școala îl **știe** — familia anunță, sau pur și simplu nu mai vine și cineva
constată — iar un job care ar deduce singur „inactiv de N luni" ar șterge exact familia care a luat
o pauză de o vacanță.

**Ștergerea logică nu e ștergere, și e important să nu se creadă că e.** Ea dă școlii o stare
reversibilă și un ecran curat; ce **nu** răspunde e „și când dispar efectiv datele", care e chiar
întrebarea de retenție. Aia are nevoie de un termen scris undeva unde familia l-a văzut — de asta
politica asta atârnă de termenii și condițiile din [E22](E22-termeni-si-date.md), și de asta E22 e
ultimul epic: termenii descriu ce face platforma, deci se scriu după ce platforma nu-și mai schimbă
forma.

Împărțirea cu [E07](E07-securitate-gdpr.md) rămâne curată: aici stă **mecanismul** — starea
„retras", ce o declanșează, ce se mai poate citi după ea; acolo, la S4, stau **drepturile** —
exportul și ștergerea cerute de o familie, care taie prin orice stare logică și chiar șterg.

Consecința pentru cod e mai concretă și e la [E16](E16-plati-fiscal.md): **azi generăm PDF-uri cu
PDFKit și le urcăm în S3**, fiindcă până la SmartBill ele sunt singurul document care există. În
ziua în care SmartBill emite, generarea locală se scoate, iar linkul de descărcare din portal
trimite către documentul lui. Până atunci PDF-ul nostru rămâne, ca să nu rămână familia fără nimic.

## Dependențe

[E02](E02-monorepo-tooling.md), pentru comenzile de la rădăcină.

## Riscuri

**Migrarea de bază poate să nu reproducă fidel ce a construit `synchronize`.** Ani de auto-alterare
lasă artefacte: indici lipsă, constrângeri denumite altfel, tipuri ușor diferite. Comparația
trebuie făcută cu un dump real din producție, coloană cu coloană — nu doar cu schema regenerată.

**Odată oprit `synchronize`, orice schimbare de entitate fără migrare rupe aplicația la pornire.**
E costul corect, dar schimbă obiceiul de lucru.

## Definition of done

`synchronize: false` în toate mediile. Fiecare schimbare de schemă trece prin migrare revizuită.
Restaurarea din backup a fost probată, nu doar documentată.

## Decizii luate

**Nu există date de producție de păstrat — baza se reconstruiește de la zero.**

Cel mai bun caz posibil, și simplifică semnificativ mai multe epic-uri:

- **S1 devine trivial.** Migrarea de bază se generează din entități și se verifică pe o bază
  goală. Nu mai e nevoie de comparație coloană cu coloană cu un dump de producție, deci riscul
  principal al acestui epic dispare.
- **Schimbările de schemă din [E08](E08-multi-locatie.md), [E10](E10-curriculum-module.md),
  [E11](E11-inscrieri-capacitate.md) și [E15](E15-pricing-facturare.md) nu mai au constrângere de
  istoric.** Se poate proiecta modelul corect de la început, fără compromisuri de compatibilitate.
- **[E11](E11-inscrieri-capacitate.md), S1 și [E12](E12-prezenta-orar.md), S1 pierd etapa de
  reconstrucție** a înscrierilor și ședințelor istorice din prezențe.
- **Seed-ul din S3 devine mai important**, pentru că e singura sursă de date realiste pentru
  dezvoltare și demonstrații.

**Backup-urile merg în S3**, nu pe instanța EC2 — un backup pe același disc cu baza de date nu e
backup.

## Ce a ieșit la iveală când aplicația a rulat prima oară pe date

Seed-ul e prima ocazie în care aplicația a rulat pe altceva decât o bază goală. Trecerea prin
fluxurile reale, cu un admin și un părinte autentificați, a scos patru lucruri. Toate citirile și
scrierile de bază funcționează; astea sunt excepțiile.

**`GET /users/without-profile` întorcea listă goală, întotdeauna.** Interogarea folosea
`user.id NOT IN (SELECT profile.user_id FROM profiles)`. Coloana e nullable, iar în SQL
`x NOT IN (1, 2, NULL)` se evaluează la NULL, nu la adevărat — deci din clipa în care exista un
singur profil fără cont, endpoint-ul nu mai returna nimic. Iar profilurile fără cont sunt exact
motivul pentru care există fluxul. Rescris cu `NOT EXISTS`. Verificat pe seed: întoarce cele două
conturi nelegate.

**Emiterea de facturi nu era atomică.** `createInvoice` salva rândul, apoi genera PDF-ul și îl
încărca în S3. Cu S3 indisponibil, factura rămânea în baza de date, apelantul primea 500 și
reîncerca, iar reîncercarea lovea `@Unique(['parent', 'monthIssued'])` — deci un singur eșec de
rețea bloca definitiv facturarea pentru acel părinte și acea lună, până când ștergea cineva rândul
de mână. Reprodus și confirmat pe aplicația reală. Acum rândul și încărcarea sunt într-o
tranzacție: verificat că un upload eșuat lasă zero facturi în urmă.

**Calculul de preț produce sume negative în răspunsuri reale, nu doar în teste.**
`POST /invoices/preview` pentru familia cu trei copii, cu o reducere de 25, întoarce
`{"parentId": 2, "amount": -25}`. Bug-ul era deja documentat în [E03](E03-testare-ci.md); acum are
și o dovadă din API. Rămâne al lui [E15](E15-pricing-facturare.md), care stabilește prețul corect.

**Lipsa configurației S3 apare ca `500 Internal server error`.** `AWS_S3_BUCKET` e verificată abia
la prima încărcare, deși mesajul din `S3Service.onModuleInit` pretinde că cere trei variabile.
Nereparat intenționat: dacă bucket-ul devine obligatoriu la pornire, `pnpm dev` cade pentru oricine
n-are AWS, iar asta e o decizie de produs — poate aplicația să pornească fără S3? — nu una tehnică.

## MinIO, ca S3-ul să poată fi exercitat local

Nu era în scopul epicului și niciun epic nu-l revendica: [E14](E14-proiecte-elevi.md) presupune că
„infrastructura de S3 există și funcționează", [E07](E07-securitate-gdpr.md) acoperă doar
credențialele de producție, iar [E06](E06-observabilitate-operare.md) îl pomenește ca scenariu de
runbook. A intrat aici fiindcă tranzacția de mai sus era verificabilă doar pe direcția de eșec: fără
un bucket, emiterea unei facturi dă 500 local, deci calea de succes nu rulase niciodată.

MinIO vorbește API-ul S3, deci calea de cod e cea reală — același SDK, aceleași `PutObject` și
`GetObject`, doar alt endpoint. E infrastructură locală, exact ca Postgres, deci intră în
`docker-compose.yml` fără să contrazică decizia din [E01](E01-infrastructura-medii.md).

`invoice-pdf.e2e-spec.ts` e acum singura suită care nu mock-uiește nici S3, nici PDFKit. A scos la
iveală încă două lucruri care nu funcționaseră niciodată:

**PDF-ul nu se putea genera sub jest.** `pdf.service.ts` încărca pdfkit cu `await import()`, iar VM-ul
CJS al lui jest refuză importurile dinamice fără `--experimental-vm-modules`. Import static acum;
pdfkit e oricum CommonJS.

**Fonturile se încărcau din `process.cwd()/src/assets`.** Mergea doar fiindcă `src/` stă lângă `dist/`
într-o clonă — un deploy care livrează doar `dist`, sau o pornire din alt director de lucru, ar fi
produs PDF-uri fără fonturi. Rezolvate acum relativ la `__dirname`, iar `nest-cli.json` copiază
asset-urile în `dist`. Verificat pornind aplicația din `/tmp`: PDF de 58 KB, cu ambele fonturi Roboto
incorporate ca subseturi, ceea ce se întâmplă doar dacă s-au desenat efectiv glife.

Prima factură emisă cap-coadă din istoria proiectului, de altfel.

## Ce rămâne

| Story                     | Stare            | Blocat de                      |
| ------------------------- | ---------------- | ------------------------------ |
| S1 · Migrarea de bază     | ✅ livrat        | —                              |
| S2 · Migrările în deploy  | ✅ cât se poate  | —                              |
| S3 · Seed                 | ✅ livrat        | —                              |
| S4 · Backup și restaurare | amânat           | instanța EC2 și bucket-ul S3   |
| S5 · Retenție             | amânat deliberat | se reia la final, vezi mai jos |

**S2 se închide aici.** Nu a existat niciodată vreun deploy, deci nu există un pipeline în care să
se cableze migrările. Ce ține de repo e livrat: comenzile, `migrationsRun: false` ca ele să fie
rulate explicit, și garda de CI care prinde entitățile divergente. Pasul de `migration:run` între
`build` și `pm2 reload` se scrie odată cu pipeline-ul însuși, în [E01](E01-infrastructura-medii.md),
S4 — ca o linie, nu ca un story.

**S5 e amânat deliberat, nu blocat din neglijență.** Retenția facturilor cere răspunsul
contabilului, iar politica atinge oricum [E07](E07-securitate-gdpr.md). Se reia la finalul valului
de fundație, când există și restul contextului de GDPR.

## Întrebări deschise

- Cât păstrăm facturile? Obligația contabilă în România e de regulă zece ani — de confirmat cu
  contabilul, pentru că intră în conflict direct cu dreptul la ștergere din GDPR. **Blochează S5**,
  și nu e o întrebare la care pot răspunde eu.
