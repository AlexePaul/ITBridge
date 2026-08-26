# E16 · Plăți online, încasări și conformitate fiscală

**Status:** propus · **Pistă:** Bani · **Depinde de:** E15 · **Blochează:** E21

## Problemă

`Payment` are patru câmpuri: `id`, `invoice`, `method` cu valoarea implicită `'cash'`, și `date`.

**Nu are sumă.** Nu are referință de tranzacție, nu are stare, nu are cine a înregistrat-o. Relația
cu `Invoice` e unu-la-unu.

Consecințele:

- **Plata parțială e imposibilă de reprezentat.** Planul în două tranșe din
  [E15](E15-pricing-facturare.md) nu are unde să existe.
- **Nu se poate verifica nimic.** O plată nu poate fi confruntată cu un extras bancar, pentru că nu
  are nici sumă, nici referință.
- **Nu există plată online.** Totul e numerar sau transfer, înregistrat manual de un admin prin
  `POST /payments`.
- **Nu există chitanță.** Părintele nu primește nicio confirmare automată.
- **Nu există urmărirea restanțelor.** `InvoiceStatus.OVERDUE` există în enum, dar nimic nu îl
  setează. Nu există memento automat.

Pe partea fiscală, în România factura electronică prin sistemul ANAF RO e-Factura a devenit
obligatorie într-un calendar extins progresiv, iar pentru încasările de la persoane fizice există
reguli proprii de bon fiscal sau chitanță. Platforma nu are nimic în direcția asta — nici serie și
număr de factură gestionate corect, nici TVA, nici date fiscale ale emitentului.

## Rezultat

Un părinte plătește online în două clicuri și primește confirmare imediat. Fiecare încasare se
confruntă automat cu factura. Restanțele se urmăresc singure. Documentele fiscale sunt conforme.

## În scop

- Refacerea modelului de plată.
- Plată online cu card.
- Reconciliere și import de extras bancar.
- Chitanțe și confirmări automate.
- Urmărirea restanțelor cu memento-uri.
- Conformitate: serie și număr, TVA, date fiscale, e-Factura.

## În afara scopului

- Prețuri și structura facturii — vezi [E15](E15-pricing-facturare.md).
- Contabilitate propriu-zisă. Ținta e să exportăm curat către contabil, nu să înlocuim programul lui.

## Story-uri

### S1 · Modelul de plată refăcut

`Payment` devine: factură, **sumă**, dată, metodă, referință externă, stare (`inițiată`, `reușită`,
`eșuată`, `stornată`), cine a înregistrat-o, observații. Relația cu `Invoice` devine
**mulți-la-unu**: o factură are mai multe plăți.

Starea facturii se derivă din suma plăților reușite față de total.

**Acceptanță:** o factură de 700 lei cu două plăți de 350 e `plătită`. Cu una singură, e
`parțial plătită`, cu restul afișat.

### S2 · Plată online

Integrare cu un procesator care suportă piața românească — Netopia, EuPlatesc, sau Stripe dacă
acceptarea de carduri locale e suficientă. Părintele plătește din portal, dintr-o factură sau o
tranșă.

Confirmarea vine prin webhook, tratat **idempotent**: același eveniment livrat de două ori nu
înregistrează două plăți. E cea mai frecventă sursă de bug la integrările de plăți.

**Acceptanță:** o plată reușită actualizează factura în sub zece secunde. Un webhook duplicat nu
produce efect dublu.

### S3 · Reconciliere

Import de extras bancar, cu potrivire automată după sumă, dată și referință. Ce nu se potrivește
ajunge într-o coadă pentru decizie umană.

**Acceptanță:** peste 80% dintre transferuri se potrivesc automat.

### S4 · Chitanțe

Fiecare plată reușită generează o confirmare, trimisă automat prin
[E17](E17-comunicare-notificari.md) și disponibilă în portal.

**Acceptanță:** părintele primește confirmarea în aceeași zi, fără intervenție.

### S5 · Restanțe

Un job marchează facturile depășite ca restante și trimite memento-uri după un calendar configurabil:
cu trei zile înainte de scadență, în ziua scadenței, apoi la intervale. Adminul are o listă a
restanțelor, pe locație, cu vechime.

Tonul contează: sunt părinți, nu debitori. Primul memento e o amintire, nu o somație.

**Acceptanță:** nicio factură restantă nu trece neobservată. Memento-urile se opresc imediat la
încasare.

### S6 · Conformitate fiscală

Serie și număr de factură gestionate corect, fără găuri și fără duplicate, chiar la emitere
concurentă. Datele fiscale ale emitentului pe fiecare document. Tratarea TVA conform regimului
școlii. Evaluarea obligației de e-Factura și, dacă se aplică, integrarea cu ANAF. Export către
contabil într-un format pe care îl poate folosi.

**Acceptanță:** contabilul confirmă în scris că documentele sunt conforme și că exportul e utilizabil.

## Dependențe

[E15](E15-pricing-facturare.md). Nu se poate încasa corect ce nu e facturat corect.

## Riscuri

**Conformitatea fiscală nu e o decizie tehnică.** Regimul de TVA, obligația de e-Factura și forma
documentelor se confirmă cu contabilul înainte de a scrie cod. O implementare bine făcută după o
presupunere greșită e tot greșită.

**Plățile online cer manipulare atentă a erorilor.** Un părinte căruia i s-au luat banii fără ca
factura să se marcheze plătită e un incident, nu un bug. Idempotența și reconcilierea nu sunt
opționale.

**Datele de card nu ating niciodată platforma.** Toată colectarea se face în interfața procesatorului.

## Definition of done

Un părinte poate plăti online și primește confirmare automat. Fiecare încasare e reconciliată.
Restanțele se urmăresc singure. Contabilul a confirmat conformitatea.

## Întrebări deschise

- Care e forma juridică a școlii și regimul de TVA? Determină tot din S6.
- Ce procesator de plăți? Depinde de comisioane, de suportul pentru plăți recurente și de cât de
  greu e onboarding-ul.
- Plățile recurente automate sunt de dorit pentru tranșa a doua, sau părinții preferă să plătească
  manual?
- Se acceptă tichete sau vouchere de la angajatori?
