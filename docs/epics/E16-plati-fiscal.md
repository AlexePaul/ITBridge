# E16 · Plăți online, încasări și facturare prin SmartBill

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
- **Nu există plată online.** Totul e numerar sau transfer, înregistrat manual de un admin.
- **Nu există chitanță.** Părintele nu primește nicio confirmare automată.
- **Nu există urmărirea restanțelor.** `InvoiceStatus.OVERDUE` există în enum, dar nimic nu îl
  setează.

Pe partea fiscală, platforma generează astăzi PDF-uri cu PDFKit și le urcă în S3 — documente care
**nu sunt facturi în sens fiscal**: fără serie și număr gestionate corect, fără date de emitent,
fără TVA, fără nicio legătură cu ANAF.

## Decizie: SmartBill e sistemul de evidență fiscală

Platforma **nu emite facturi**. Calculează ce se datorează și cere SmartBill să emită documentul.

Împărțirea responsabilităților, care ar trebui respectată strict:

| | Platforma | SmartBill |
|---|---|---|
| Ce se datorează, cui, pentru ce modul | ✓ | |
| Planuri de plată, tranșe, scadențe | ✓ | |
| Afișare pentru părinte, istoric, portal | ✓ | |
| Serie și număr de factură | | ✓ |
| PDF-ul fiscal | | ✓ |
| TVA și date de emitent | | ✓ |
| Transmitere în SPV pentru e-Factura | | ✓ |
| Evidența contabilă și exportul | | ✓ |

Platforma păstrează propria entitate `Invoice` — are nevoie de ea pentru portal, tranșe și
rapoarte — dar aceasta stochează **referința** către documentul SmartBill: serie, număr, id și
link la PDF. Sursa de adevăr fiscală e la ei.

Ce iese din scop față de forma inițială a epicului: gestionarea seriilor și numerelor, calculul
TVA, integrarea directă cu ANAF, și generarea PDF-ului de factură. Toate sunt rezolvate de SmartBill.

## Ce trebuie știut despre API

Verificat în [documentația lor](https://api.smartbill.ro/) și în
[ghidul de integrare](https://ajutor.smartbill.ro/article/196-integrare-api):

- **Cere abonament Facturare Platinum.** E o constrângere comercială, nu tehnică, și trebuie
  confirmată **înainte** de orice altceva din acest epic.
- **REST, JSON, HTTP Basic Auth** cu email plus token. Endpoint de forma `/SBORO/api/invoice`.
  V1 pentru facturare curentă, V3 pentru funcții mai noi.
- **Limită de 3 apeluri pe secundă.** Depășirea blochează accesul 10 minute. Determină direct
  designul emiterii în masă — vezi S3.
- Operații disponibile: emitere de facturi, ștergere și anulare, acces la PDF, proforme
  convertibile în facturi, **încasări pe o factură** (deci plata parțială e suportată nativ),
  trimitere de documente pe email, gestiunea clienților și produselor.
- **e-Factura:** cu modulul activ, SmartBill trimite XML-ul în SPV după emitere. Nu gestionăm
  nici XML, nici semnături, nici termene.
- Suportul pentru API se face **doar pe email**, la `vreauapi@smartbill.ro`. Merită luat în calcul
  la estimare: o întrebare de integrare nu se rezolvă în cinci minute.

## În scop

- Refacerea modelului de plată.
- Integrarea cu SmartBill pentru emitere și încasări.
- Plată online cu card.
- Chitanțe și confirmări automate.
- Urmărirea restanțelor cu memento-uri.
- Reconciliere.

## În afara scopului

- Prețuri și structura facturii — vezi [E15](E15-pricing-facturare.md).
- Tot ce preia SmartBill: numerotare, TVA, e-Factura, PDF fiscal, export contabil.

## Story-uri

### S0 · Verificarea premisei

Înainte de orice cod: se confirmă că abonamentul permite acces API, se obține tokenul, și se face
o emitere de test într-un mediu de probă. Dacă abonamentul actual nu e Platinum, costul upgrade-ului
intră în decizie acum, nu după ce s-a construit integrarea.

**Acceptanță:** o factură de test emisă prin API apare în contul SmartBill, cu serie și număr
corecte.

### S1 · Modelul de plată refăcut

`Payment` devine: factură, **sumă**, dată, metodă, referință externă, referință SmartBill a
încasării, stare (`inițiată`, `reușită`, `eșuată`, `stornată`), cine a înregistrat-o, observații.
Relația cu `Invoice` devine **mulți-la-unu**.

`Invoice` primește câmpurile de legătură cu SmartBill: serie, număr, id document, link PDF, stare
de sincronizare.

Starea facturii se derivă din suma plăților reușite față de total — nu se setează manual.

**Acceptanță:** o factură de 700 lei cu două plăți de 350 e `plătită`. Cu una singură, e
`parțial plătită`, cu restul afișat.

### S2 · Emiterea prin SmartBill

La confirmarea emiterii din [E15](E15-pricing-facturare.md) S6, platforma trimite documentul către
SmartBill și stochează referința primită. PDF-ul nu se mai generează local.

Tratarea eșecurilor contează mai mult decât cazul fericit: o factură care a eșuat la SmartBill nu
trebuie să rămână „emisă" în platformă, iar o reîncercare nu trebuie să producă document dublu.
Deci fiecare emitere are cheie de idempotență proprie și stare de sincronizare explicită.

**Acceptanță:** o eroare de rețea la mijlocul emiterii nu produce nici factură fantomă în
platformă, nici document dublu în SmartBill.

### S3 · Emiterea în masă, temperată

Cu 3 apeluri pe secundă și blocare de 10 minute la depășire, emiterea pentru ~100 de familii **nu
poate fi o buclă**. Se face prin coadă, cu limitare sub prag, reîncercare cu pauză crescătoare, și
progres vizibil în interfață.

La 3 pe secundă, 100 de facturi înseamnă minim ~34 de secunde. Cu marjă de siguranță, se planifică
2 pe secundă.

**Acceptanță:** emiterea pentru 100 de familii se termină fără blocare de acces și raportează
individual ce a eșuat.

### S4 · Plată online

Integrare cu un procesator care suportă piața românească — Netopia, EuPlatesc, sau Stripe.
Părintele plătește din portal, dintr-o factură sau o tranșă. La confirmare, plata se înregistrează
în platformă **și** ca încasare pe factura din SmartBill.

Confirmarea vine prin webhook, tratat **idempotent**: același eveniment livrat de două ori nu
înregistrează două plăți. E cea mai frecventă sursă de bug la integrările de plăți.

**Acceptanță:** o plată reușită actualizează factura în sub zece secunde, în ambele sisteme. Un
webhook duplicat nu produce efect dublu.

### S5 · Încasări manuale

Numerarul și transferul se înregistrează de admin în platformă, care propagă încasarea în SmartBill.
Un singur loc de introducere, nu două.

**Acceptanță:** o încasare introdusă în platformă apare în SmartBill fără intervenție.

### S6 · Chitanțe și confirmări

SmartBill emite documentul; platforma trimite confirmarea către părinte prin
[E17](E17-comunicare-notificari.md), cu link către PDF. Trimiterea se poate face și direct de
SmartBill, dar prin E17 rămâne evidența livrării într-un singur loc.

**Acceptanță:** părintele primește confirmarea în aceeași zi, fără intervenție.

### S7 · Restanțe

Un job marchează facturile depășite ca restante și trimite memento-uri după un calendar
configurabil: cu trei zile înainte de scadență, în ziua scadenței, apoi la intervale. Adminul are o
listă a restanțelor, pe locație, cu vechime.

Tonul contează: sunt părinți, nu debitori. Primul memento e o amintire, nu o somație.

**Acceptanță:** nicio factură restantă nu trece neobservată. Memento-urile se opresc imediat la
încasare.

### S8 · Reconciliere și verificare

Import de extras bancar cu potrivire automată după sumă, dată și referință; ce nu se potrivește
ajunge într-o coadă pentru decizie umană.

Separat, o verificare periodică între platformă și SmartBill: orice factură cu stări divergente
între cele două sisteme e semnalată. Cu două surse de adevăr parțiale, divergența e inevitabilă;
important e să fie vizibilă.

**Acceptanță:** peste 80% dintre transferuri se potrivesc automat. Divergențele dintre sisteme apar
într-un raport, nu într-o surpriză la finalul lunii.

## Dependențe

[E15](E15-pricing-facturare.md). Nu se poate emite corect ce nu e calculat corect.

## Riscuri

**Abonamentul Platinum e o premisă, nu un detaliu.** Dacă nu e disponibil, tot epicul își schimbă
forma și partea de conformitate fiscală revine în scop. De aceea S0 e primul.

**Două sisteme cu stări proprii vor diverge.** Platforma crede că factura e plătită, SmartBill nu,
sau invers. S8 nu e o rafinare, e mecanismul care face divergența vizibilă înainte să devină
problemă contabilă.

**Limita de 3 apeluri pe secundă e ușor de depășit accidental.** O sincronizare de fundal pornită
în paralel cu o emitere în masă blochează accesul zece minute. Toate apelurile trebuie să treacă
prin aceeași coadă temperată, nu doar cele din S3.

**Plățile online cer manipulare atentă a erorilor.** Un părinte căruia i s-au luat banii fără ca
factura să se marcheze plătită e un incident, nu un bug.

**Datele de card nu ating niciodată platforma.** Toată colectarea se face în interfața
procesatorului.

## Definition of done

Facturile se emit prin SmartBill, cu referința stocată în platformă. Un părinte poate plăti online
și primește confirmare automat. Încasările se propagă într-un singur sens, fără dublă introducere.
Divergențele între sisteme sunt vizibile.

## Întrebări deschise

- **Abonamentul actual permite acces API?** Prima verificare, blochează tot restul.
- **Cum se reprezintă fiscal cele două tranșe?** O factură de 700 cu două încasări de 350 e varianta
  mai curată și e suportată nativ. Alternativa — două facturi de 350 — înseamnă două documente
  fiscale pentru un singur modul. De confirmat cu contabilul.
- **Merită folosite proformele?** SmartBill le convertește în factură la plată. Ar putea fi potrivit
  pentru tranșa a doua, dar adaugă un tip de document în plus.
- Care e forma juridică a școlii și regimul de TVA? Se configurează în SmartBill, dar trebuie știut.
- Ce procesator de plăți? Depinde de comisioane și de suportul pentru plăți recurente.
- Plățile recurente automate sunt de dorit pentru tranșa a doua, sau părinții preferă manual?
