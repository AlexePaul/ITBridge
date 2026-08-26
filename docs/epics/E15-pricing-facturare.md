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

Constantele `350` și `250` dispar din cod.

**Acceptanță:** o schimbare de preț se face din interfață și nu afectează facturile emise anterior.

### S2 · Factura pe modul, cu linii

`Invoice` pierde `@Unique(['parent', 'monthIssued'])`. Primește: perioadă acoperită, plan de plată,
și linii.

`InvoiceLine`: înscriere din [E11](E11-inscrieri-capacitate.md), copil, modul, descriere, cantitate,
preț unitar, reducere aplicată, total. Suma facturii e suma liniilor, nu un număr calculat și uitat.

**Acceptanță:** o factură arată "Andrei · Scratch Începători · modul 2 · 700 lei" și "Maria ·
Robotică · modul 1 · 700 lei, reducere frați 15% · −105 lei". Totalul se verifică prin adunare.

### S3 · Planuri de plată

`PaymentPlan`: integral, sau două tranșe cu scadențe — la început și la mijlocul modulului, cum ai
descris. Extensibil la trei sau mai multe, fără schimbare de model.

Fiecare tranșă e o scadență cu sumă și dată proprie. Starea facturii devine derivată: `neplătită`,
`parțial plătită`, `plătită`, `restantă` — calculate din tranșe și din plățile din
[E16](E16-plati-fiscal.md), nu setate manual.

`InvoiceStatus` actual are `pending`, `paid`, `overdue` și nu poate exprima plata parțială.

**Acceptanță:** un părinte alege la înscriere plata în două tranșe; sistemul emite o factură cu două
scadențe și urmărește fiecare separat.

### S4 · Regula pentru mai mulți copii

Regula devine explicită și configurabilă, definită ca reducere procentuală sau fixă per copil
suplimentar, aplicabilă la orice număr. Bugul de la trei copii dispare prin construcție, nu prin
adăugarea unei ramuri.

**Acceptanță:** teste pentru unu, doi, trei, patru și cinci copii. Nicio combinație nu produce sumă
zero sau negativă.

### S5 · Reduceri cu tip

`Discount` primește tip (`fix` sau `procent`), scop (o linie, o factură, sau permanent pe familie),
condiții și perioadă de valabilitate. Reducerile nu pot duce totalul sub zero — regulă impusă în
model, nu prin verificare ulterioară.

**Acceptanță:** o reducere de 200% e respinsă. Cumulul de reduceri nu produce sume negative.

### S6 · Previzualizare și emitere în masă

`POST /invoices/preview` există deja. Se extinde: adminul vede toate facturile care ar fi emise
pentru un modul sau o perioadă, cu detaliere pe linii, verifică, apoi confirmă.

Emiterea generează facturile și PDF-urile în fundal, cu progres vizibil, nu într-o cerere HTTP
sincronă cum se întâmplă azi în `createInvoice`, care încarcă la S3 în buclă.

**Acceptanță:** emiterea pentru 100 de familii nu blochează interfața și raportează ce a eșuat.

### S7 · PDF-ul

Refăcut pentru linii, tranșe, scadențe, ambele locații și datele fiscale corecte. Structura din
`pdf.service.ts` rămâne, conținutul se schimbă.

**Acceptanță:** PDF-ul arată exact ce arată factura din portal, inclusiv scadențele.

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

## Întrebări deschise

Sunt de discutat împreună, nu de presupus:

- **Câte ședințe are un modul și pe ce perioadă?** Fără asta, 700 de lei nu are numitor.
- Cele două tranșe sunt egale, sau prima e mai mare? La ce dată exactă scade a doua?
- Reducerea pentru frați e procentuală sau sumă fixă? Se aplică la fiecare copil sau doar de la al
  doilea în sus?
- Ce se întâmplă cu un copil care abandonează la jumătatea modulului? Se returnează, se creditează,
  sau nu?
- Prețul e același în ambele locații?
- Un copil înscris la mijlocul unui modul plătește proporțional?
