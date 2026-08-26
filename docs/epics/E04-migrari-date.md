# E04 · Migrări și integritatea datelor

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E02 · **Blochează:** E05, E07, E08, E10

## Problemă

`app.module.ts` configurează TypeORM cu `synchronize: true`. La fiecare pornire, TypeORM compară
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
  *mecanismul*; celelalte îl folosesc.

## Story-uri

### S1 · Migrarea de bază

`synchronize` devine `false`. Se generează o migrare inițială care reproduce exact schema curentă,
verificată pe o bază goală și comparată cu un dump real.

**Acceptanță:** bază goală plus migrări produce o schemă identică cu cea generată azi de
`synchronize`, verificat cu `typeorm schema:log`, care nu trebuie să raporteze nicio diferență.

### S2 · Migrările în deploy

Migrările rulează automat înainte ca versiunea nouă să primească trafic, și opresc deploy-ul dacă
eșuează. În fluxul PM2 din [E01](E01-infrastructura-medii.md), asta înseamnă între `build` și
`reload`.

**Acceptanță:** un deploy cu migrare eșuată lasă versiunea veche în funcțiune.

### S3 · Seed pentru dezvoltare

O comandă populează baza locală cu: un admin, ambele locații cu sălile lor, profesori, părinți cu
copii, grupe pe tot programul săptămânal, prezențe pe două luni în urmă, facturi în toate stările.
Suficient cât ecranele de admin să arate ca în realitate, nu goale.

**Acceptanță:** `pnpm seed` pe o bază curată, iar dashboard-ul de admin arată date plauzibile.

### S4 · Backup și restaurare

Backup zilnic automat, retenție 30 de zile, stocare în altă parte decât VPS-ul. Procedura de
restaurare e scrisă și **executată o dată**, cu durata măsurată și notată.

**Acceptanță:** există un document cu pașii de restaurare și data ultimei probe reale. Dacă data e
mai veche de șase luni, se repetă.

### S5 · Retenție

Politică scrisă pentru ce se șterge și când: prezențe vechi, facturi (obligație legală de
păstrare), proiecte ale copiilor, conturi inactive. Implementată ca job programat, aliniată cu
[E07](E07-securitate-gdpr.md).

**Acceptanță:** politica e documentată, implementată și verificabilă.

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

## Întrebări deschise

- Există date de producție de păstrat, sau baza se poate reconstrui de la zero? Răspunsul schimbă
  complet efortul de la S1.
- Cât păstrăm facturile? Obligația contabilă în România e de regulă zece ani — de confirmat cu
  contabilul, pentru că intră în conflict direct cu dreptul la ștergere din GDPR.
