# E15 · Pricing și facturare v2

**Status:** propus · **Pistă:** Bani · **Depinde de:** E10, E11 · **Blochează:** E16, E21

## Problemă

Modelul de facturare actual e lunar, cu prețuri hardcodate, și are un bug care produce sume greșite.

În `apps/api/src/modules/invoice/invoice.service.ts:162`, în `calculateAmount`:

```ts
let totalAmount = 0;
if (profile.children.length === 1) totalAmount = 350;
else if (profile.children.length === 2) totalAmount = 250 * profile.children.length;
```

**Nu există ramură pentru trei sau mai mulți copii.** `totalAmount` rămâne `0`, iar reducerile
aplicate imediat după îl duc pe negativ. O familie cu trei copii primește o factură de zero lei sau
mai puțin.

Nici suma pentru doi copii nu e cea convenită. Regula e **350 pentru primul copil și 250 pentru
fiecare frate**, adică 600 de lei pe lună pentru doi. Codul îi trece pe amândoi la 250, scoate 500
și ieftinește retroactiv și primul copil.

Restul modelului e la fel de rigid:

- Prețurile sunt constante în cod. O schimbare de tarif cere deploy.
- `Invoice` are `@Unique(['parent', 'monthIssued'])` cu `monthIssued` de tip `varchar(7)`, adică
  `'2026-03'`. **Facturarea lunară e cusută în schemă.**
- Factura se emite pe părinte, nu pe copil sau pe înscriere. Nu poți spune ce s-a plătit pentru cine.
- Suma se calculează la emitere și se pierde apoi. Nu există detaliere pe linii, deci nici factura,
  nici PDF-ul nu pot arăta din ce se compune.
- Reducerile din `Discount` au doar `value`, fără tip. Nu se știe dacă e sumă fixă sau procent.
- Lunile cu vacanță se ajustau cu regula de trei simplă, manual.

Direcția nouă — **700 de lei pe modul**, plătibili integral sau în două tranșe — nu încape în acest
model. Nu e o schimbare de constantă, e o schimbare de unitate de facturare: de la lună la modul.

Și mai grav, în `apps/api/src/entities/payment.entity.ts`: **`Payment` nu are coloană de sumă.** Are `method`, `date`, și
o relație unu-la-unu cu `Invoice`. Deci **plata în două tranșe nu poate fi reprezentată deloc** —
nici măcar teoretic. Se rezolvă în [E16](E16-plati-fiscal.md), dar modelul de aici trebuie să o
presupună.

## Rezultat

Prețurile sunt configurabile. Unitatea de facturare e modulul. O factură are linii care explică din
ce se compune. Planurile de plată în tranșe sunt de primă clasă. Un părinte cu trei copii primește
suma corectă.

## În scop

- Catalog de prețuri configurabil, versionat.
- Facturare pe modul, cu linii detaliate.
- Planuri de plată: integral sau în tranșe.
- Reguli pentru mai mulți copii, corecte la orice număr.
- Înscrierea la mijlocul unui modul, cu plată proporțională.
- Reduceri cu tip și regulă.
- Regenerarea PDF-ului.
- Previzualizare înainte de emitere.
- Trecerea prețului de pe site-ul public de pe lună pe modul, odată cu catalogul.

## În afara scopului

- Încasarea propriu-zisă și conformitatea fiscală — vezi [E16](E16-plati-fiscal.md).

## Story-uri

### S1 · Catalogul de prețuri

`Price`: modul din [E10](E10-curriculum-module.md), locație (opțional, dacă tarifele diferă),
valabil de la, valabil până la, sumă, monedă. Versionat, ca o schimbare de tarif să nu rescrie
istoricul facturilor deja emise.

Prețul e **pe modul, nu pe ședință**: 700 lei, indiferent dacă modulul are 6, 7 sau 8 ședințe.
Catalogul nu capătă niciodată o coloană de preț pe ședință — dacă apare una, e semn că s-a strecurat
presupunerea greșită. Singurul loc în care suma se împarte la ședințe e înscrierea la mijlocul unui
modul, S8, iar acolo divizorul se calculează la fața locului, din durata modulului respectiv.

Constantele `350` și `250` dispar din cod.

**Acceptanță:** o schimbare de preț se face din interfață și nu afectează facturile emise anterior.
Două module de durate diferite din același curs produc aceeași sumă.

### S2 · Factura pe modul, cu linii

Fiindcă plata în tranșe produce **două facturi** (vezi S3), factura nu mai poate fi unitatea de
calcul — e rezultatul lui. Apare un nivel deasupra: `Billing`, nota de plată a unei familii pentru
un modul.

`Billing`: familie, modul, perioadă acoperită, linii, total, plan de plată ales. Aici se calculează
o singură dată prețul, reducerile pentru frați și eventualele alte reduceri.

`BillingLine`: înscriere din [E11](E11-inscrieri-capacitate.md), copil, modul, descriere, preț
unitar, reducere aplicată, total.

`Invoice` pierde `@Unique(['parent', 'monthIssued'])` și devine ce se emite efectiv: legată de un
`Billing`, cu index de tranșă (1 din 1, sau 1 din 2 și 2 din 2), sumă, scadență, și referința
SmartBill din [E16](E16-plati-fiscal.md). Liniile facturii se derivă din cele ale notei de plată,
proporțional cu tranșa.

O variantă mai ușoară, dacă vrei să eviți o entitate nouă: `Invoice` poartă un `billingGroupId`
comun plus indexul de tranșă, iar nota de plată e o vedere, nu un tabel. Funcționează, dar mută
calculul reducerilor într-un loc mai greu de verificat.

**Acceptanță:** o notă de plată pentru o familie cu doi copii arată „Andrei · Scratch Începători ·
modul 2 · 700 lei" și „Maria · Robotică · modul 1 · reducere frați −25% · 525 lei", total 1225.
Totalul se verifică prin adunare, iar suma facturilor emise din ea e exact 1225.

### S3 · Planuri de plată

Părintele alege la înscriere, iar alegerea determină **câte facturi se emit**:

| Plan           | Facturi | Sume (un copil)                             |
| -------------- | ------- | ------------------------------------------- |
| Integral       | 1       | 700 la înscriere                            |
| În două tranșe | 2       | 350 la înscriere, 350 la mijlocul modulului |

Aceeași sumă totală în ambele cazuri: plata integrală nu primește reducere, tranșele nu primesc
penalizare.

**Regula de împărțire nu e „350 + 350", ci „jumătate din total".** Cu reducerea pentru frați,
totalul unei familii cu doi copii e 1225, deci tranșele sunt 612,50 fiecare. Ca suma facturilor să
fie mereu exact totalul, restul de rotunjire se pune pe prima factură — o notă de 1225,01 produce
612,51 și 612,50, niciodată 612,505.

**A doua factură se emite la mijlocul modulului, nu la înscriere.** Presupunerea decurge direct din
regula de abandon: dacă un copil pleacă la jumătate, tranșa a doua pur și simplu nu se mai emite.
Alternativa — ambele facturi emise din start — ar cere stornarea unui document fiscal deja emis
de fiecare dată când cineva abandonează, ceea ce e mult mai neplăcut decât un job programat.

Costul acestei alegeri e că jobul de emitere devine critic: dacă nu rulează, nu se facturează.
Intră sub alertare în [E06](E06-observabilitate-operare.md).

Mijlocul modulului se calculează din calendarul din [E10](E10-curriculum-module.md): la un modul de
7 ședințe, a doua factură se emite după ședința 4.

Starea fiecărei facturi e derivată din plățile din [E16](E16-plati-fiscal.md), nu setată manual.
`InvoiceStatus` actual are `pending`, `paid`, `overdue`; cu o factură per tranșă, nu mai e nevoie
de o stare de plată parțială la nivel de factură — dar nota de plată o are, ca sumă a facturilor ei.

**Acceptanță:** un părinte care alege tranșe primește o factură la înscriere și una la mijlocul
modulului. Un copil care abandonează după prima nu primește a doua, și nu se stornează nimic.

### S4 · Regula pentru mai mulți copii

**Primul copil plătește integral; fiecare frate suplimentar primește −25%.** Regula e o funcție
de rangul copilului în familie, nu o serie de ramuri `if`, deci bugul de la trei copii dispare prin
construcție.

| Copii | Calcul          | Total / modul |
| ----- | --------------- | ------------- |
| 1     | 700             | **700**       |
| 2     | 700 + 525       | **1225**      |
| 3     | 700 + 525 + 525 | **1750**      |
| 4     | 700 + 525 × 3   | **2275**      |

Procentul e configurabil, ca și pragul de la care se aplică. Forma regulii o are deja modelul lunar
de azi — 350 pentru primul copil, 250 pentru fiecare frate — și tot ce se schimbă odată cu trecerea
la modul e unitatea, nu principiul. Ce dispare e ieftinirea retroactivă a primului copil, de la 350
la 250, pe care o face codul actual.

Site-ul public nu anunță niciun procent. Arată cele două sume una lângă alta — 700 de lei pe modul
pentru un copil, 1225 pentru doi — pentru că o sumă se verifică dintr-o privire, în timp ce un
procent cere cititorului să știe baza și să facă el scăderea. „−25%" și „al doilea copil plătește
525 de lei" sunt aceeași ofertă; a doua formulare nu are nevoie de nimic în plus ca să fie crezută.

**Trecerea site-ului public pe prețul de modul face parte din livrarea acestui epic** — niciun alt
story nu o acoperă, iar catalogul din S1 fără ea lasă școala cu două prețuri publicate simultan.
Sumele stau azi în `apps/web/shared/courses.ts:119-120`, ca `PRICE_ONE_CHILD = 350` și
`PRICE_TWO_CHILDREN = 600`, și sunt citite din șase locuri: pagina `cursuri.vue`, cele două pagini
de locație, `shared/seo.ts` (descrierile meta), `shared/structured-data.ts` (`priceRange` și nodul
`Offer`) și `server/routes/llms.txt.ts`. Nu e de ajuns să se schimbe cele două numere: unitatea e
scrisă separat, ca „lei pe lună" în texte și ca `unitText: "lună"`, `unitCode: "MON"` și
`category: "Subscription"` în JSON-LD, deci se schimbă și ea, în toate cele șase. Diferența calculată
în pagini rămâne validă ca formă — 1225 − 700 dă exact prețul fratelui, cum 600 − 350 îl dădea pe
cel de azi.

Până atunci **site-ul rămâne neatins: 350/600 pe lună e modelul în vigoare, deci afișarea e
corectă**, nu o restanță. Se schimbă în clipa în care catalogul din S1 începe să emită facturi pe
modul, nu mai devreme — un preț publicat înaintea celui facturat e o promisiune pe care școala încă
nu o poate onora.

**Acceptanță:** teste pentru unu, doi, trei, patru și cinci copii, cu sumele din tabel. Nicio
combinație de copii și reduceri nu produce sumă zero sau negativă. La final, nicio pagină publică,
niciun `Offer` și nicio descriere meta nu mai spune „pe lună", iar sumele afișate sunt cele pe care
le facturează catalogul.

### S5 · Reduceri cu tip

`Discount` primește tip (`fix` sau `procent`), scop (o linie, o factură, sau permanent pe familie),
condiții și perioadă de valabilitate. Reducerile nu pot duce totalul sub zero — regulă impusă în
model, nu prin verificare ulterioară.

**Acceptanță:** o reducere de 200% e respinsă. Cumulul de reduceri nu produce sume negative.

### S6 · Previzualizare și emitere în masă

`POST /invoices/preview` există deja. Se extinde: adminul vede toate facturile care ar fi emise
pentru un modul sau o perioadă, cu detaliere pe linii, verifică, apoi confirmă.

Emiterea se face în fundal, prin coada temperată din [E16](E16-plati-fiscal.md) S3 — nu într-o
cerere HTTP sincronă cum se întâmplă azi în `createInvoice`, care încarcă la S3 în buclă. Limita
SmartBill de 3 apeluri pe secundă face bucla imposibilă oricum.

**Acceptanță:** emiterea pentru 100 de familii nu blochează interfața, respectă limita de apeluri
și raportează individual ce a eșuat.

### S7 · PDF-ul nu se mai generează local

Documentul fiscal e emis de SmartBill, care produce și PDF-ul — vezi
[E16](E16-plati-fiscal.md). Platforma stochează referința și link-ul, nu generează nimic.

Generarea de facturi din `apps/api/src/modules/invoice/pdf.service.ts` se retrage. Serviciul rămâne
în cod, cu fonturile Roboto și logo-ul din `apps/api/src/assets/`, pentru documentele **nefiscale**
— certificatele din [E13](E13-progres-evaluare.md) și rapoartele de progres.

Ce trebuie să arate identic sunt **factura din portal și cea din SmartBill**: aceleași linii,
aceleași sume, aceleași scadențe. Divergența dintre ele e exact ce urmărește
[E16](E16-plati-fiscal.md) S8.

**Acceptanță:** nicio factură nu mai e generată cu PDFKit. Factura din portal se potrivește la leu
cu documentul SmartBill.

### S8 · Înscrierea la mijlocul unui modul

Un copil care intră după ce modulul a început plătește **proporțional cu ședințele rămase**, nu
prețul întreg. La un modul de 8 ședințe, cine intră după a patra plătește jumătate: 350 de lei. La
unul de 6, cine intră tot după a patra prinde două ședințe și plătește 700 × 2/6, adică 233.

Baza de calcul e **calendarul modulului din [E10](E10-curriculum-module.md), nu prezența efectivă**.
Ședințele rămase se numără o singură dată, la data înscrierii, și de acolo înainte suma e fixă —
altfel factura n-ar putea fi emisă decât după ce se termină modulul, adică după ce s-a consumat tot
ce se facturează. Absențele de după înscriere nu scad suma; ele se rezolvă prin recuperările din
[E12](E12-prezenta-orar.md), care sunt un instrument de retenție, nu o corecție de preț.

**Pro-rata scoate la vedere valoarea unei ședințe, iar ea diferă de la modul la modul.** 700 / 6 dă
116,67, 700 / 8 dă 87,50. Nu e o inconsecvență de reparat, e consecința directă a prețului fix din
S1: dacă ședința ar valora la fel peste tot, prețul modulului n-ar mai putea fi fix, ci ar deveni
număr de ședințe × tarif. Cine găsește mai târziu cele două numere diferite și e tentat să le
uniformizeze desface decizia de bază, nu repară un bug. Divizorul există **numai** pentru intrările
la mijloc.

Din același motiv, linia de pe factură se scrie tot în unități de modul — „Scratch Începători ·
modul 2 · jumătate de modul" —, nu „4 ședințe × 87,50". Regula de comunicare din
[Decizii luate](#decizii-luate) rămâne întreagă: prețul se spune pe modul, iar tariful pe ședință nu
se tipărește nicăieri, tocmai fiindcă invită la comparația care deranjează.

**Recomandări, fiecare cu motivul ei:**

- **Rotunjirea se face la leu, pe totalul liniei, nu pe prețul unitar.** 700 / 6 nu are reprezentare
  exactă în bani, iar dacă rotunjești unitarul și înmulțești pe urmă, eroarea se multiplică în total.
  Suma ajunge pe un document fiscal și e adesea plătită în numerar la sediu — un rest de bani pe care
  nu-l are nimeni în buzunar e o problemă la casă, nu o rafinare de precizie. Restul de rotunjire se
  tratează ca la S3: rămâne pe linie, iar totalul notei de plată e mereu exact suma liniilor ei.
- **Reducerea de frați se aplică după pro-rata, pe suma proporțională.** Pentru o reducere
  procentuală ordinea nu schimbă rezultatul, dar S5 admite și reduceri **fixe** — iar o reducere de
  100 de lei aplicată înaintea proporționării s-ar înjumătăți odată cu ea și ar valora 50. O sumă
  acordată în lei trebuie să rămână acea sumă, indiferent când intră copilul în modul.
- **Rangul copilului în familie se stabilește pe prețul întreg al modulului, înainte de pro-rata.**
  Altfel „primul copil", cel care plătește 700, ar fi cel care se nimerește să aibă suma mai mare
  după proporționare, iar o înscriere la mijloc ar rearanja tăcut ce plătește un frate înscris de
  luni de zile. Cine e primul nu are voie să depindă de data la care intră al doilea.
- **O înscriere pro-rata se facturează o singură dată, integral, nu în două tranșe.** Planul din S3
  presupune un modul care mai are un mijloc în față; la o intrare după ședința 4 din 8, jobul de
  tranșă a doua ori nu mai are pe ce să se declanșeze, ori se declanșează imediat după prima
  factură. În plus ar dubla documentele fiscale și apelurile SmartBill pentru o sumă de ordinul a
  350 de lei — vezi limita de 3 apeluri pe secundă din [E16](E16-plati-fiscal.md). Tranșele rămân
  pentru înscrierile făcute la începutul modulului.

**Acceptanță:** un copil înscris înaintea ședinței 5 dintr-un modul de 8 primește o factură de 350;
același copil, într-un modul de 6, primește 233. O familie cu un copil înscris de la început și unul
intrat la mijloc plătește 700 pentru primul și pro-rata minus 25% pentru al doilea, iar totalul e
suma liniilor, la leu. Nicio notă de plată pro-rata nu generează a doua tranșă.

## Dependențe

[E10](E10-curriculum-module.md) pentru ce e un modul, [E11](E11-inscrieri-capacitate.md) pentru cine
a fost înscris când. **[E03](E03-testare-ci.md) e obligatoriu** — e epicul unde o greșeală se
traduce direct în bani ceruți greșit.

## Riscuri

**Migrarea facturilor istorice.** Facturile vechi sunt lunare, fără linii. Trebuie păstrate ca atare,
citibile, marcate ca model vechi. Nu se recalculează retroactiv.

**Trecerea de la lună la modul schimbă fluxul de numerar.** Dacă modulele mai multor grupe încep în
aceeași săptămână, încasările se concentrează. Merită simulat înainte.

**Formularea facturii poate transforma recuperările în datorie.**
[E12](E12-prezenta-orar.md) a decis că recuperarea e un instrument de retenție, nu o datorie
contractuală, fiindcă părintele cumpără participarea la un modul, nu un număr garantat de ședințe.
Distincția ține exact cât timp niciun document nu numără ședințe: o linie scrisă „8 ședințe ×
87,50" promite opt, iar absența devine ceva ce se datorează înapoi. De aceea liniile se
scriu în unități de modul, inclusiv la pro-rata (S8). Cele două epicuri trebuie decise împreună.

## Definition of done

Niciun preț în cod. Fiecare factură are linii care se adună la total. Planurile în tranșe
funcționează. O înscriere la mijlocul unui modul produce o sumă proporțională, rotunjită la leu.
Nicio combinație de copii, reduceri și proporționări nu produce o sumă absurdă.

## Decizii luate

| Decizie              | Valoare                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Unitate de facturare | Modulul școlar, 6-8 ședințe, ~5 pe an                                                 |
| Preț                 | **700 lei fix**, indiferent de durata modulului                                       |
| Planuri de plată     | Integral (1 factură), sau două tranșe egale (2 facturi, a doua la mijlocul modulului) |
| Reducere frați       | **−25% de la al doilea copil în jos**, primul întreg                                  |
| Înscriere la mijloc  | **Pro-rata pe ședințele rămase**, rotunjit la leu, o singură factură — vezi S8        |
| Abandon la mijloc    | Fără returnare; a doua factură nu se mai emite                                        |

**Prețul fix pe durată variabilă e o decizie conștientă**, nu o scăpare. Ședința costă efectiv
117 lei într-un modul de 6 săptămâni și 87 într-unul de 8. Peste un an școlar se echilibrează —
~3500 lei pentru ~35 de ședințe, adică ~100 lei pe ședință — dar un părinte care intră exact la un
modul scurt plătește vizibil mai mult pe ședință. Merită anticipat în felul în care se comunică
prețul: **„700 lei pe modul", niciodată „x lei pe ședință"**, pentru că a doua formulare invită
exact la comparația care deranjează.

Pro-rata din S8 e singurul loc în care cele două numere devin vizibile pe o factură. Nu se
uniformizează — motivul complet e scris acolo, ca să nu fie „reparat" de cineva care le vede
alăturate și crede că a găsit o eroare.

Pentru context, față de modelul vechi: 350 lei pe lună, cu ajustările manuale de vacanță, ieșea în
jur de 3150 lei pe an de copil. Modelul nou dă ~3500, deci **crește venitul cu ~11%** și, în plus,
elimină regula de trei simplă — vacanțele devin granițele modulelor, nu excepții de calculat.

**La abandon**: dacă plata a fost în tranșe, a doua factură pur și simplu nu se
mai emite, iar nota de plată se închide la suma facturată. Dacă a fost integrală, nu se returnează
nimic. Fiindcă a doua factură se emite la mijlocul modulului și nu la înscriere, abandonul nu cere
stornarea niciunui document fiscal. Regula se comunică la înscriere, nu la plecare.

Nu mai există excepție. Recomandarea din auditul anterior — recunoașterea dreptului de retragere în
14 zile din OUG 34/2014, cu storno manual în SmartBill — **se scoate**, fiindcă și-a pierdut
obiectul: dreptul acela se naște dintr-un contract încheiat la distanță sau în afara spațiului
comercial, iar de acum nu se mai încheie niciunul. **Înscrierea o face adminul, nu părintele**, nu
există auto-înscriere din portal ([E11](E11-inscrieri-capacitate.md)), iar **contractul se semnează
fizic, la sediu** — platforma reține doar faptul că există unul semnat, cu data lui
([E07](E07-securitate-gdpr.md) S8). Fără contract la distanță nu există drept de la care să nu se
poată deroga, deci clauza de nereturnare nu mai e abuzivă, iar aici nu intră nici calculator de
returnare, nici conductă de stornare în [E16](E16-plati-fiscal.md).

Cele două fluxuri online care existau în discuție nu contrazic asta, și merită numite ca să nu fie
reluate ca obiecție: [E20](E20-achizitie-lead.md) S2 programează o lecție de probă **gratuită**,
deci nu încheie niciun contract și nu circulă niciun ban; plata online din
[E16](E16-plati-fiscal.md) S4 — între timp amânată, dar argumentul rămâne valabil în ziua în care se
reia — ar încasa o factură care decurge dintr-un contract deja semnat pe hârtie, deci ar **executa**
un contract existent, nu ar încheia unul nou.

Condiția în care se repune întrebarea, scrisă ca să fie recunoscută la timp: **dacă apare vreodată
o înscriere care se finalizează online, sau o încasare de la o familie fără contract pe hârtie.**
Ambele mută încheierea contractului în afara sediului, deci readuc termenul de 14 zile și, odată cu
el, un caz real de stornat. Ziua în care una dintre ele se propune, întrebarea se pune înainte de
implementare, nu după — și înainte ca [E07](E07-securitate-gdpr.md) S5 să publice termenii, fiindcă
acolo regula devine text publicat.

## Întrebări deschise

- ~~Retragerea în 14 zile la înscrierile online.~~ **Nu se mai pune.** Înscrierea o face adminul și
  contractul se semnează fizic, deci nu există contract încheiat la distanță. Motivul complet și
  condiția în care întrebarea revine, la [Decizii luate](#decizii-luate).
- Prețul e același în ambele locații?
- ~~Un copil înscris la mijlocul unui modul plătește integral, sau proporțional cu ședințele
  rămase?~~ **Proporțional**, pe ședințele rămase din modul, rotunjit la leu, într-o singură
  factură. Regula, exemplele și motivul pentru care asta nu contrazice prețul fix pe modul sunt la
  S8.
