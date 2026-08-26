# E15 · Pricing și facturare v2

**Status:** propus · **Pistă:** Bani · **Depinde de:** E10, E11 · **Blochează:** E16, E21

## Problemă

Modelul de facturare actual e lunar, cu prețuri hardcodate, și are un bug care produce sume greșite.

În `invoice.service.ts:107`:

```ts
if (profile.children.length === 1) totalAmount = 350;
else if (profile.children.length === 2) totalAmount = 250 * profile.children.length;
```

**Nu există ramură pentru trei sau mai mulți copii.** `totalAmount` rămâne `0`, iar reducerile
aplicate imediat după îl duc pe negativ. O familie cu trei copii primește o factură de zero lei sau
mai puțin.

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

Și mai grav, în `payment.entity.ts`: **`Payment` nu are coloană de sumă.** Are `method`, `date`, și
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
- Reduceri cu tip și regulă.
- Regenerarea PDF-ului.
- Previzualizare înainte de emitere.

## În afara scopului

- Încasarea propriu-zisă și conformitatea fiscală — vezi [E16](E16-plati-fiscal.md).

## Story-uri

### S1 · Catalogul de prețuri

`Price`: modul din [E10](E10-curriculum-module.md), locație (opțional, dacă tarifele diferă),
valabil de la, valabil până la, sumă, monedă. Versionat, ca o schimbare de tarif să nu rescrie
istoricul facturilor deja emise.

Prețul e **pe modul, nu pe ședință**: 700 lei, indiferent dacă modulul are 6, 7 sau 8 ședințe.
Modelul nu trebuie să conțină niciun calcul per ședință — dacă apare unul, e semn că s-a strecurat
presupunerea greșită.

Constantele `350` și `250` dispar din cod.

**Acceptanță:** o schimbare de preț se face din interfață și nu afectează facturile emise anterior.
Două module de durate diferite din același curs produc aceeași sumă.

### S2 · Factura pe modul, cu linii

`Invoice` pierde `@Unique(['parent', 'monthIssued'])`. Primește: perioadă acoperită, plan de plată,
și linii.

`InvoiceLine`: înscriere din [E11](E11-inscrieri-capacitate.md), copil, modul, descriere, cantitate,
preț unitar, reducere aplicată, total. Suma facturii e suma liniilor, nu un număr calculat și uitat.

**Acceptanță:** o factură arată "Andrei · Scratch Începători · modul 2 · 700 lei" și "Maria ·
Robotică · modul 1 · 700 lei, reducere frați 15% · −105 lei". Totalul se verifică prin adunare.

### S3 · Planuri de plată

`PaymentPlan`: **integral (700 lei la înscriere)** sau **două tranșe egale (350 + 350)**, a doua
scadentă la mijlocul modulului. Aceeași sumă totală în ambele cazuri — plata integrală nu primește
reducere, iar tranșele nu primesc penalizare.

Mijlocul modulului se calculează din calendarul din [E10](E10-curriculum-module.md): la un modul
de 7 ședințe, scadența a doua cade după ședința 4. Modelul rămâne extensibil la trei sau mai multe
tranșe, fără schimbare de schemă.

Fiecare tranșă e o scadență cu sumă și dată proprie. Starea facturii devine derivată: `neplătită`,
`parțial plătită`, `plătită`, `restantă` — calculate din tranșe și din plățile din
[E16](E16-plati-fiscal.md), nu setate manual.

`InvoiceStatus` actual are `pending`, `paid`, `overdue` și nu poate exprima plata parțială.

**Acceptanță:** un părinte alege la înscriere plata în două tranșe; sistemul emite o factură cu două
scadențe și urmărește fiecare separat.

### S4 · Regula pentru mai mulți copii

**Primul copil plătește integral; fiecare frate suplimentar primește −25%.** Regula e o funcție
de rangul copilului în familie, nu o serie de ramuri `if`, deci bugul de la trei copii dispare prin
construcție.

| Copii | Calcul | Total / modul |
|---|---|---|
| 1 | 700 | **700** |
| 2 | 700 + 525 | **1225** |
| 3 | 700 + 525 + 525 | **1750** |
| 4 | 700 + 525 × 3 | **2275** |

Procentul e configurabil, ca și pragul de la care se aplică. Spre deosebire de regula veche — unde
apariția celui de-al doilea copil ieftinea retroactiv și primul copil, de la 350 la 250 — aici
primul copil plătește mereu întreg.

**Acceptanță:** teste pentru unu, doi, trei, patru și cinci copii, cu sumele din tabel. Nicio
combinație de copii și reduceri nu produce sumă zero sau negativă.

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

Generarea de facturi din `pdf.service.ts` se retrage. Serviciul rămâne în cod, cu fonturile Roboto
și logo-ul din `src/assets/`, pentru documentele **nefiscale** — certificatele din
[E13](E13-progres-evaluare.md) și rapoartele de progres.

Ce trebuie să arate identic sunt **factura din portal și cea din SmartBill**: aceleași linii,
aceleași sume, aceleași scadențe. Divergența dintre ele e exact ce urmărește
[E16](E16-plati-fiscal.md) S8.

**Acceptanță:** nicio factură nu mai e generată cu PDFKit. Factura din portal se potrivește la leu
cu documentul SmartBill.

## Dependențe

[E10](E10-curriculum-module.md) pentru ce e un modul, [E11](E11-inscrieri-capacitate.md) pentru cine
a fost înscris când. **[E03](E03-testare-ci.md) e obligatoriu** — e epicul unde o greșeală se
traduce direct în bani ceruți greșit.

## Riscuri

**Migrarea facturilor istorice.** Facturile vechi sunt lunare, fără linii. Trebuie păstrate ca atare,
citibile, marcate ca model vechi. Nu se recalculează retroactiv.

**Trecerea de la lună la modul schimbă fluxul de numerar.** Dacă modulele mai multor grupe încep în
aceeași săptămână, încasările se concentrează. Merită simulat înainte.

**Regulile de recuperare din [E12](E12-prezenta-orar.md) devin obligații contractuale.** Când
factura spune 12 ședințe, cele 12 ședințe sunt datorate. Cele două epicuri trebuie decise împreună.

## Definition of done

Niciun preț în cod. Fiecare factură are linii care se adună la total. Planurile în tranșe
funcționează. Nicio combinație de copii și reduceri nu produce o sumă absurdă.

## Decizii luate

| Decizie | Valoare |
|---|---|
| Unitate de facturare | Modulul școlar, 6-8 ședințe, ~5 pe an |
| Preț | **700 lei fix**, indiferent de durata modulului |
| Planuri de plată | Integral 700, sau 350 + 350 la mijlocul modulului |
| Reducere frați | **−25% de la al doilea copil în jos**, primul întreg |
| Abandon la mijloc | Fără returnare; tranșa a doua nu se mai încasează |

**Prețul fix pe durată variabilă e o decizie conștientă**, nu o scăpare. Ședința costă efectiv
117 lei într-un modul de 6 săptămâni și 87 într-unul de 8. Peste un an școlar se echilibrează —
~3500 lei pentru ~35 de ședințe, adică ~100 lei pe ședință — dar un părinte care intră exact la un
modul scurt plătește vizibil mai mult pe ședință. Merită anticipat în felul în care se comunică
prețul: **„700 lei pe modul", niciodată „x lei pe ședință"**, pentru că a doua formulare invită
exact la comparația care deranjează.

Pentru context, față de modelul vechi: 350 lei pe lună, cu ajustările manuale de vacanță, ieșea în
jur de 3150 lei pe an de copil. Modelul nou dă ~3500, deci **crește venitul cu ~11%** și, în plus,
elimină regula de trei simplă — vacanțele devin granițele modulelor, nu excepții de calculat.

**La abandon** (S8, de adăugat): dacă plata a fost în tranșe, a doua se anulează și factura se
închide la suma încasată. Dacă a fost integrală, nu se returnează nimic. Regula e simetrică și se
comunică la înscriere, nu la plecare.

## Întrebări deschise

- Prețul e același în ambele locații?
- Un copil înscris la mijlocul unui modul plătește integral, sau proporțional cu ședințele rămase?
  Cu preț fix pe modul, varianta consecventă e integral — dar e greu de vândut cuiva care prinde
  doar 3 din 7 ședințe.
