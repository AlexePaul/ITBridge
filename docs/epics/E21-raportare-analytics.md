# E21 · Raportare și analytics

**Status:** propus · **Pistă:** Business · **Depinde de:** E12, E15, E16 · **Blochează:** —

## Problemă

Platforma colectează date, dar nu răspunde la nicio întrebare de business.

`it-bridge-frontend/app/pages/admin/dashboard.vue` există, dar nu există niciun endpoint de agregare în backend — nicio
rută de statistici, niciun raport. Deci fiecare întrebare se rezolvă prin numărat manual în liste,
sau nu se rezolvă deloc.

Întrebări la care nu se poate răspunde astăzi:

- Câți copii activi sunt, pe locație și pe modul?
- Care e venitul lunar, și cum evoluează?
- Câți părinți au restanțe, și de cât timp?
- Ce grupe sunt sub capacitate, și cât ne costă asta?
- Câți copii nu s-au reînscris după ce au terminat un modul, și de ce?
- Care locație merge mai bine?
- Cât costă să aducem o familie nouă?
- Care e rata de prezență, și scade pe parcursul modulului?

Ultima e deosebit de utilă: prezența în scădere e cel mai bun predictor de abandon, cu câteva
săptămâni înainte să se întâmple. Datele există deja în `Attendance`; nimic nu le citește.

Cu două locații, întrebarea "cum merge?" nu mai are răspuns intuitiv.

## Rezultat

Un tablou de bord care răspunde la întrebările de conducere fără muncă manuală, și un set de
semnale care avertizează înainte ca o problemă să devină vizibilă în bani.

## În scop

- Tablou de bord operațional.
- Rapoarte financiare.
- Retenție și abandon.
- Ocupare și capacitate.
- Pâlnia de achiziție.
- Export pentru contabil.
- Semnale timpurii.

## În afara scopului

- Sănătatea tehnică a sistemului — vezi [E06](E06-observabilitate-operare.md). Aici e sănătatea
  școlii.
- Depozit de date sau unelte de business intelligence. La dimensiunea asta, rapoarte în aplicație,
  direct din Postgres.

## Story-uri

### S1 · Tablou de bord operațional

Prima pagină pentru admin: copii activi pe locație, grupe active, prezența săptămânii, facturi
neîncasate, probe programate, alerte. Filtrabil pe locație, comparabil cu perioada anterioară.

**Acceptanță:** răspunde la "cum stăm?" în zece secunde, fără alt clic.

### S2 · Rapoarte financiare

Venit facturat față de venit încasat, pe lună și pe modul, pe locație. Restanțe cu vechime. Venit
mediu pe familie. Evoluție în timp.

Distincția între facturat și încasat e esențială și lipsește complet astăzi: se poate factura foarte
bine și încasa prost.

**Acceptanță:** raportul se potrivește cu evidența contabilului, la leu.

### S3 · Retenție și abandon

Câți copii continuă la modulul următor, pe grupă, pe profesor, pe locație, pe modul. Motivele de
abandon, din [E11](E11-inscrieri-capacitate.md). Durata medie a relației cu o familie.

E cea mai importantă familie de indicatori din tot epicul. Într-o școală cu module, retenția
determină totul: e mult mai ieftin să păstrezi o familie decât să aduci una nouă.

**Acceptanță:** rata de reînscriere e vizibilă pe modul și pe profesor, cu evoluție în timp.

### S4 · Ocupare

Locuri ocupate față de capacitate, pe grupă, sală și locație. Grupele sub prag, cu venitul pierdut
estimat. Orele moarte în care sălile stau goale.

**Acceptanță:** răspunde la "putem deschide o grupă nouă, sau întâi le umplem pe cele existente?".

### S5 · Pâlnia

Indicatorii din [E20](E20-achizitie-lead.md), cu conversii între etape, pe sursă și pe locație, și
cost de achiziție dacă există cheltuială de marketing.

**Acceptanță:** se vede care canal aduce familii care rămân, nu doar familii.

### S6 · Export pentru contabil

Un export lunar în formatul cerut, cu facturi, plăți și storno, care nu cere reformatare manuală.

**Acceptanță:** contabilul confirmă că îl poate folosi direct.

### S7 · Semnale timpurii

Alerte pe tipare care prevestesc probleme: prezența unui copil în scădere trei ședințe la rând, o
grupă cu prezență generală în scădere, o familie cu două facturi restante, o grupă care coboară sub
pragul de rentabilitate.

Intervenția devine posibilă cât mai e ceva de făcut.

**Acceptanță:** o scădere de prezență generează alertă înainte de abandon, verificat retroactiv pe
datele istorice.

## Dependențe

[E12](E12-prezenta-orar.md) pentru prezență, [E15](E15-pricing-facturare.md) și
[E16](E16-plati-fiscal.md) pentru bani.

## Riscuri

**Rapoartele construite pe date incomplete induc în eroare mai rău decât lipsa lor.** Dacă prezența
nu se marchează consecvent, rata de prezență e ficțiune. Fiecare raport trebuie să arate pe ce date
se bazează și cât de complete sunt.

**Interogările de agregare pe tabele care cresc vor încetini.** La dimensiunea actuală nu e o
problemă, dar rapoartele trebuie scrise cu indici de la început, nu optimizate după ce încep să
doară.

**Prea mulți indicatori și niciunul nu e urmărit.** Mai bine cinci cifre citite săptămânal decât
cincizeci ignorate.

## Definition of done

Întrebările din secțiunea Problemă au toate răspuns, din interfață, fără muncă manuală. Rapoartele
financiare se potrivesc cu contabilitatea. Semnalele timpurii au prins măcar un caz real.

## Întrebări deschise

- Care sunt cele cinci cifre pe care le-ai vrea în fiecare luni dimineață? Restul e secundar.
- În ce format vrea contabilul exportul?
- Se compară locațiile între ele în mod deschis? Poate motiva, dar poate și crea tensiune între
  echipe.
