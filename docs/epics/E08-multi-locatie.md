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
gradul de ocupare pe sedii, un profesor nu poate fi alocat unei săli, iar uploaderul de proiecte din
[E14](E14-proiecte-elevi.md) nu poate ști ce grupă e programată acum în ce sală.

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
- Detectarea conflictelor de orar și listele de așteptare — vezi [E11](E11-inscrieri-capacitate.md).
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
de nivel: legarea lor de catalog acum ar fi însemnat să blocheze E08 de un epic blocat el însuși de
conținut.

### S4 · Locația în interfață

Selector de locație în antetul zonei de admin, persistent între pagini. Toate listele — copii,
grupe, prezență, facturi, rapoarte — respectă selecția. Un mod "toate locațiile" pentru privirea de
ansamblu.

**Acceptanță:** cele 25 de pagini de admin respectă selectorul. Nicio listă nu amestecă locațiile
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
[E09](E09-personal-roluri.md). **Nimic din ce mai rămâne în E08 nu se poate face fără ele** — epicul
stă aici până când unul dintre cele două pornește.

Riscul din secțiunea de mai sus se închide fără muncă: [E04](E04-migrari-date.md) a stabilit că nu
există date de producție de păstrat, deci nu e nimic de corectat retroactiv. Migrarea le semnalează
oricum, dacă apar.

## Întrebări deschise

- ~~Care sunt numele și adresele exacte ale celor două locații?~~ Erau deja în
  `apps/web/shared/school.ts`, cu slug și coordonate. Migrarea și seed-ul folosesc exact aceleași
  valori.
- ~~De câte locuri e o sală?~~ **10, la ambele locații.** Migrarea creează o sală „Sala 1" de 10
  locuri per locație, iar seed-ul folosește aceeași valoare peste tot. E o valoare implicită, nu o
  regulă: capacitatea fiecărei săli se editează din `/admin/locations` (`PUT /rooms/:id`), fără
  migrare și fără cod, iar limita nouă se aplică imediat la crearea grupelor.
- Câte săli are de fapt fiecare locație rămâne de confirmat — migrarea presupune una. Se adaugă din
  aceeași pagină. Devine important la [E11](E11-inscrieri-capacitate.md), unde capacitatea sălii
  intră în regula de înscriere.
- Un copil poate fi înscris în grupe din locații diferite? Astăzi `Child.group` e o singură grupă,
  deci întrebarea nu se pune încă; devine reală în [E11](E11-inscrieri-capacitate.md).
- Prețurile diferă pe locație? Dacă da, [E15](E15-pricing-facturare.md) trebuie să știe de la
  început. `Location` nu are câmp de preț — dacă răspunsul e „da", acolo se adaugă.
