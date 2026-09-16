# E08 · Multi-locație și săli

**Status:** în lucru · **Pistă:** Domeniu · **Depinde de:** E04 · **Blochează:** E09, E11, E14, E19

## Problemă

Școala are două locații. Platforma nu are noțiunea de locație. O căutare în tot backend-ul după
`location`, `room`, `capacity` sau echivalente returnează zero rezultate.

Nu e o simplă lipsă de câmp. `Group` are:

```ts
@Unique(['weekday', 'startTime'])
```

Adică **nu pot exista două grupe în același interval orar, în toată școala.** În ziua în care ambele
locații au curs marți la 17:00, a doua nu poate fi introdusă. Cel mai probabil lucrul ăsta e deja
ocolit cu ore artificial decalate, ceea ce înseamnă că orarul afișat și datele de prezență sunt deja
aproximative.

Mai departe, `Group` nu are nici nume, nici capacitate, nici profesor, nici sală. Are doar zi, oră
de început, oră de sfârșit, interval de vârstă și un flag `isActive`. Nu poți spune "grupa
Scratch Începători, sala 2, Titan, maxim 10 copii, profesor Ana".

Fără locație, nimic din ce urmează nu e corect: nu știi unde e programat un copil, nu poți raporta
gradul de ocupare pe sedii și nu poți aloca un profesor unei săli.

## Rezultat

Locația e o dimensiune de primă clasă. Fiecare grupă, sală, profesor, prezență și raport știe unde
se întâmplă. Adăugarea unei a treia locații e o operațiune de configurare, nu de dezvoltare.

## În scop

- Entitățile `Location` și `Room`.
- Legarea `Group` de sală, cu constrângeri corectate.
- Capacitate și nume pe grupă.
- Selector de locație în interfața de admin, cu filtrare peste tot.
- Backfill al datelor existente către locația implicită.

## În afara scopului

- Permisiuni pe locație — vezi [E09](E09-personal-roluri.md).
- Listele de așteptare și regula de capacitate aplicată la înscriere — vezi
  [E11](E11-inscrieri-capacitate.md).
- Detectarea conflictelor de orar, care nu e un singur subiect și nu stă într-un singur epic.
  Conflictul de **sală** e deja rezolvat aici, de constrângerea unică din S2: aceeași sală, aceeași
  zi, aceeași oră de început nu se poate rezerva de două ori. Conflictul de **profesor** între
  locații — aceeași persoană alocată la două grupe care se suprapun, la adrese diferite — e
  revendicat și amânat explicit în [E09](E09-personal-roluri.md), fiindcă orarul e făcut azi de
  aceiași doi oameni care predau. Suprapunerea de orar între două grupe ale **aceluiași copil** nu
  mai e un caz posibil: un copil e într-o singură grupă, vezi
  [E11](E11-inscrieri-capacitate.md) D6.
- Paginile publice per locație — vezi [E19](E19-seo-geo.md).

## Story-uri

### S1 · Entitățile de locație și sală

`Location`: nume, slug, adresă, oraș, coordonate, telefon, email, program, status activ. Slug-ul și
coordonatele sunt pentru [E19](E19-seo-geo.md), deci merită de la început.

`Room`: nume, locație, capacitate, dotare (număr de calculatoare, tablă, proiector), status activ.

**Acceptanță:** ambele locații reale sunt în baza de date, cu sălile lor.

**Livrat.** `apps/api/src/entities/location.entity.ts` și `room.entity.ts`, cu module CRUD
(`/locations`, `/rooms`) — citire pentru orice utilizator autentificat, scriere doar pentru admin.
Ambele sunt configurabile integral din `/admin/locations`: locațiile prin formular, sălile prin
editare pe loc (nume, locuri, calculatoare, stare).
Migrarea `LocationsAndRooms` inserează cele două adrese reale, cu aceleași valori ca
`apps/web/shared/school.ts`, ca baza de date, paginile publice, JSON-LD-ul și sitemap-ul să spună
același lucru.

`openingHours` e `null` implicit și înseamnă „se aplică programul școlii" — amândouă locațiile sunt
așa azi, iar o copie a programului comun pe fiecare rând ar fi a doua sursă de adevăr pe care n-o
ține nimeni în pas.

### S2 · Corectarea constrângerii de unicitate

`@Unique(['weekday', 'startTime'])` devine `@Unique(['room', 'weekday', 'startTime'])`. Aceeași sală
nu poate găzdui două grupe simultan; săli diferite pot.

Migrarea trebuie să detecteze mai întâi dacă există grupe cu ore decalate artificial ca să ocolească
vechea constrângere, și să le semnaleze pentru corectare manuală.

**Acceptanță:** două grupe marți la 17:00, în săli diferite, se salvează fără eroare. Aceeași sală,
același interval — respins cu mesaj util.

**Livrat.** Constrângerea e acum `UQ_groups_room_weekday_start`. Migrarea raportează, **înainte** să
o schimbe, perechile de grupe din aceeași zi care încep la mai puțin de 30 de minute distanță — după
ce vechea constrângere dispare, decalajul devine legal și nu mai există niciun semn că a fost o
ocolire.

Mesajul util cere mai mult decât constrângerea: o violare de unicitate ajunge la client ca „există
deja o înregistrare cu aceste date", care nu spune ce s-a ciocnit. Serviciul verifică întâi și
răspunde cu numele grupei care ocupă intervalul, sub codul `GROUP_SLOT_TAKEN`. Ca să poată face
asta, `AllExceptionsFilter` lasă acum serviciul să-și numească propriul cod de eroare — vezi
[Decizii luate](#decizii-luate).

### S3 · Grupa devine descriptibilă

`Group` primește: nume, sală (deci implicit locație), capacitate maximă, nivel — legat de catalogul
din [E10](E10-curriculum-module.md) — și profesor principal, după [E09](E09-personal-roluri.md).

Câmpurile `minAge` și `maxAge` sunt astăzi `decimal`, ceea ce e ciudat pentru vârste. Devin
întregi, sau sunt înlocuite de nivelul din catalog, dacă vârsta e o consecință a nivelului și nu
un criteriu independent.

**Acceptanță:** un admin creează "Scratch Începători · Titan · Sala 2 · marți 17:00 · max 10".

**Livrat parțial.** `Group` are acum `name`, `room` (obligatoriu, deci și locație), `capacity`, iar
`minAge`/`maxAge` sunt `int`. Capacitatea grupei nu poate depăși capacitatea sălii —
`GROUP_OVER_ROOM_CAPACITY`.

**Rămân nivelul și profesorul principal**, fiindcă vin din [E10](E10-curriculum-module.md) și
[E09](E09-personal-roluri.md), amândouă neîncepute. Vârstele au rămas câmpuri, nu au fost înlocuite
de nivel: la momentul livrării, legarea lor de catalog ar fi însemnat să blocheze E08 de un epic
blocat el însuși de lipsa programei scrise.

**Închis pentru MVP.** Cele două câmpuri care lipsesc vin din două epicuri **scoase amândouă din
MVP**: nivelul din [E10](E10-curriculum-module.md), respins de patron, și profesorul principal din
[E09](E09-personal-roluri.md) S4, care nu are relevanță cât timp toți cei care se autentifică sunt
admini. Deci S3 nu mai așteaptă nimic ce se poate întâmpla înăuntrul MVP-ului: se reia odată cu
epicurile lor, dacă și când revin.

Ce are grupa azi — nume, sală, deci locație, capacitate aplicată, interval de vârstă — e suficient
pentru tot ce se sprijină pe ea: orarul, prezența, capacitatea la înscriere și facturarea.

**Motivul acela e istoric, dar concluzia s-a schimbat de două ori.** Întâi în bine: E10 nu mai
aștepta conținutul, fiindcă structura e cunoscută și decisă, deci s-ar fi putut construi în jurul
programei nescrise. Apoi în rău: [E10](E10-curriculum-module.md) **a ieșit din MVP**, respins de
patron — vezi [docs/epics/README.md](README.md), „Ordinea recomandată". Deci ce mai deblochează S3 e
un singur epic care poate porni, [E09](E09-personal-roluri.md) S4, pentru profesorul principal.
Nivelul nu mai vine de nicăieri în MVP, iar `minAge`/`maxAge` rămân `int` și rămân câmpuri — decizia
dacă nivelul le înlocuiește sau stă lângă ele se amână odată cu E10.

### S4 · Locația în interfață

Selector de locație în antetul zonei de admin, persistent între pagini. Toate listele — copii,
grupe, prezență, facturi, rapoarte — respectă selecția. Un mod "toate locațiile" pentru privirea de
ansamblu.

**Acceptanță:** ecranele de admin respectă selectorul. Nicio listă nu amestecă locațiile
fără să o spună.

**Livrat, cu o restrângere explicită a scopului.** Selectorul e în antetul zonei de admin
(`LocationSwitcher.vue`), selecția stă într-un cookie ca tokenurile — un ref se pierde la reload și
ar readuce tăcut adminul pe „toate locațiile", singura stare în care o listă chiar amestecă
adresele. Decizia „aparține selecției?" e într-un singur loc, `locationStore.matchesSelection`.

Filtrează: grupele, copiii (prin grupa lor), selectorul de grupă din prezență și căutarea de copii
din prezență. Fiecare pagină spune în subtitlu ce arată.

**Facturile și plățile nu filtrează, intenționat.** Sunt legate de părinte, nu de locație, iar un
părinte poate avea copii la amândouă adresele — un filtru pe locație acolo ar produce sume care nu
se adună la nimic real. Dacă apare cerința de raportare pe sedii, locul ei e
[E21](E21-raportare-analytics.md), pe copil sau pe grupă, nu pe factură.

Înregistrările fără locație — un copil încă nerepartizat — rămân vizibile în orice selecție. Sunt
nealocate, nu în altă parte, și sunt exact ce caută un admin când deschide lista.

Filtrul singur nu era de ajuns pentru „nicio listă nu amestecă locațiile fără să o spună": oriunde
apare o grupă, apare acum și unde se ține. Ecranul de prezență o numește în titlu („Prezența ·
Scratch Avansați / Marți, 16:00 – 17:30 · Drumul Taberei · Sala 2"), coloana „Grup" din lista de
copii poartă locația pe fiecare rând — în modul „toate locațiile" chiar amestecă adresele — iar fișa
unui părinte o arată per copil, fiindcă un părinte poate avea câte unul la fiecare adresă.

Pagina părintelui (`user/dashboard.vue`) nu afișează deloc grupa, doar un calendar de prezență, deci
nu are ce să spună ambiguu. Dacă ajunge să o afișeze, locația merge odată cu ea — dar asta e
[E18](E18-frontend-portal.md), nu E08.

### S5 · Migrarea datelor existente

Toate grupele existente sunt atribuite locației principale și unei săli implicite, cu semnalarea
celor care par să aparțină de fapt celeilalte locații.

**Acceptanță:** după migrare, nicio grupă nu e fără sală.

**Livrat.** Migrarea completează `name` (derivat din zi și oră), `room` (Drumul Taberei, locația mai
veche) și `capacity` (din sală) înainte să pună `NOT NULL`, și aruncă explicit dacă a rămas vreo
grupă fără sală — altfel `SET NOT NULL` ar pica fără să spună care rânduri au cauzat-o. Grupele
semnalate la S2 sunt raportate din nou, ca să fie clar că au fost puse toate la aceeași adresă și
că pot fi mutate din interfață.

## Dependențe

[E04](E04-migrari-date.md). Fără migrări, schimbarea unei constrângeri de unicitate pe date reale e
periculoasă.

## Riscuri

**Datele istorice sunt probabil deja compromise de vechea constrângere.** Dacă grupele au fost
decalate cu 15 minute ca să încapă, orarul din prezențe nu reflectă realitatea. Trebuie decis dacă
se corectează retroactiv sau se acceptă ca istoric imperfect, marcat ca atare.

**Locația atinge fiecare ecran de admin.** E o schimbare largă și puțin adâncă. Merită făcută
într-un singur efort concentrat, nu strecurată bucată cu bucată.

## Decizii luate

**Un serviciu își poate numi propriul cod de eroare.** `AllExceptionsFilter` derivă codul din statusul
HTTP, deci toate conflictele ieșeau ca `CONFLICT`, iar frontend-ul avea o singură propoziție
românească pentru toate: „există deja o înregistrare cu aceste date". Adevărată pentru fiecare și
utilă pentru niciuna — un admin care tocmai a suprapus două grupe în aceeași sală trebuie să afle
tocmai asta. Filtrul preferă acum `error`-ul pus explicit pe excepție.

Nu schimbă niciun cod existent: Nest completează `error` cu textul statusului („Conflict", „Not
Found"), iar normalizarea lui dă exact intrările din tabelul de dinainte. Codurile noi —
`GROUP_SLOT_TAKEN`, `GROUP_OVER_ROOM_CAPACITY`, `LOCATION_SLUG_TAKEN`, `LOCATION_HAS_ROOMS`,
`ROOM_NAME_TAKEN`, `ROOM_HAS_GROUPS` — au fiecare o propoziție în `useApiError.ts`.

**`isActive` e o regulă, nu o etichetă.** O sală închisă, sau una la o locație închisă, nu primește
grupe noi — `ROOM_INACTIVE`. Altfel flag-ul ar fi fost decorativ: interfața ar fi încetat să ofere
sala, iar API-ul ar fi acceptat-o în continuare, deci cele două ar fi însemnat lucruri diferite
prin același câmp.

Regula se aplică doar la **intrarea** într-o sală. O grupă deja acolo când sala se închide rămâne
editabilă — redenumirea și mutarea ei în altă parte sunt exact ce face adminul în continuare, iar un
formular blocat ar fi transformat dezactivarea într-o capcană. Din același motiv, selectorul din
antet păstrează locațiile inactive în listă, marcate: grupele și prezența lor există mai departe, iar
o locație care dispare în clipa dezactivării arată ca pierdere de date.

**Ștergerile sunt `RESTRICT`, verificate în serviciu.** O locație cu săli și o sală cu grupe nu se
șterg. Baza de date ar refuza oricum, dar ca eroare de driver ajunge la client un 500 generic;
întrebarea pusă întâi transformă refuzul într-un răspuns.

**O singură sală per locație, de 10 locuri, extensibilă din interfață.** E valoarea reală, nu o
presupunere de migrare: fiecare dintre cele două adrese are azi o sală. Migrarea
`1787909549491-LocationsAndRooms.ts` inserează „Sala 1" cu 10 locuri și 10 calculatoare per locație,
iar seed-ul folosește aceleași valori. Se consemnează ca decizie fiindcă nu schimbă nimic tehnic —
confirmă ce e deja în migrare și în `/admin/locations` — dar scoate numărul din zona de presupunere:
[E11](E11-inscrieri-capacitate.md) îl folosește ca plafon de înscriere, deci trebuie să fie un fapt
asumat, nu o valoare moștenită dintr-un `INSERT`.

Extensibilitatea e partea care contează: a doua sală, sau o capacitate mai mare, sunt operațiuni de
configurare — `POST /rooms`, `PUT /rooms/:id`, din aceeași pagină — fără migrare și fără cod, iar
limita nouă se aplică imediat la crearea grupelor prin `GROUP_OVER_ROOM_CAPACITY`. Aceeași decizie e
scrisă și în [E11](E11-inscrieri-capacitate.md) D7, împreună cu partea care ține de acolo: o lecție
de probă consumă unul dintre cele 10 locuri, deci nu există un al doilea număr pentru aceeași sală.

**Vârstele au devenit `int`.** Erau `decimal`, ceea ce cerea un transformer ca driverul să nu întoarcă
`"11"`, pentru o rezoluție de care nu a avut nimeni nevoie. Migrarea convertește cu `round()`, nu cu
un cast simplu, ca un 10.5 scris de vechiul cod să devină 11 în loc să oprească migrarea.

## Definition of done

Nicio entitate operațională nu e ambiguă în privința locului unde se întâmplă. A treia locație s-ar
adăuga din interfață, fără cod.

**Atins pentru grupe, săli și locații.** O a treia locație se adaugă din `/admin/locations`, cu
sălile ei, iar grupele se pot muta acolo — fără migrare și fără cod. Fiecare loc din interfață în
care apare o grupă spune și unde se ține.

Rămân nivelul și profesorul principal de la S3, care așteaptă [E10](E10-curriculum-module.md) și
[E09](E09-personal-roluri.md). **Nimic din ce mai rămâne în E08 nu se poate face fără ele** — iar
acum, cu E10 în afara MVP-ului, epicul stă aici până pornește E09. Cu profesorul principal pus,
singurul lucru care mai lipsește din S3 e nivelul, deci S3 se închide cât se poate închide și
nivelul revine odată cu E10.

Riscul din secțiunea de mai sus se închide fără muncă: [E04](E04-migrari-date.md) a stabilit că nu
există date de producție de păstrat, deci nu e nimic de corectat retroactiv. Migrarea le semnalează
oricum, dacă apar.

## Întrebări deschise

- ~~Care sunt numele și adresele exacte ale celor două locații?~~ Erau deja în
  `apps/web/shared/school.ts`, cu slug și coordonate. Migrarea și seed-ul folosesc exact aceleași
  valori.
- ~~De câte locuri e o sală?~~ **10, la ambele locații.** Migrarea creează o sală „Sala 1" de 10
  locuri per locație, iar seed-ul folosește aceeași valoare peste tot. E o valoare confirmată, nu
  presupusă — vezi [Decizii luate](#decizii-luate) —, dar nu e cimentată: capacitatea fiecărei săli
  se editează din `/admin/locations` (`PUT /rooms/:id`), fără migrare și fără cod, iar limita nouă se
  aplică imediat la crearea grupelor.
- ~~Câte săli are de fapt fiecare locație?~~ **Una, de 10 locuri, la fiecare.** Exact ce presupune
  migrarea, confirmat ca fapt — vezi [Decizii luate](#decizii-luate). A doua sală se adaugă din
  `/admin/locations` în ziua în care apare, fără migrare. Capacitatea sălii intră ca plafon în regula
  de înscriere din [E11](E11-inscrieri-capacitate.md) D7.
- ~~Un copil poate fi înscris în grupe din locații diferite?~~ **Nu**, fiindcă nu poate fi în două
  grupe deloc — [E11](E11-inscrieri-capacitate.md) D6. Motivul e al școlii și e despre copil: două
  drumuri pe săptămână sunt prea mult la vârsta asta. `Child.group` rămâne o singură referință, iar
  `Enrollment` păstrează istoricul cu invariantul „cel mult unul în vigoare".
- Prețurile diferă pe locație? Dacă da, [E15](E15-pricing-facturare.md) trebuie să știe de la
  început. `Location` nu are câmp de preț — dacă răspunsul e „da", acolo se adaugă.
