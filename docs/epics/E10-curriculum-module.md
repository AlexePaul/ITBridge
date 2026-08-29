# E10 · Curriculum și catalog de module

**Status:** propus · **Pistă:** Domeniu · **Depinde de:** E04 · **Blochează:** E11, E13, E14, E15

**Nu mai e blocat.** Programa scrisă încă nu există și poate să nu existe până la finalul vacanței.
Nu se așteaptă după ea: structura e cunoscută, iar decizia luată e să se construiască în jurul
conținutului lipsă — entitățile, ecranele de admin prin care se introduc modulele și lecțiile,
expunerea publică. Programa intră prin aceleași ecrane când e scrisă. Ce rămâne efectiv de așteptat
sunt exact două lucruri, enumerate în [Decizii luate](#decizii-luate).

## Problemă

Platforma nu știe **ce** predă școala. Nu există curs, nu există modul, nu există nivel, nu există
programă.

Grupa nu mai e problema. După [E08](E08-multi-locatie.md), `Group` are nume, sală (deci și locație),
capacitate și un interval de vârstă în `int` — vezi `apps/api/src/entities/group.entity.ts`. Ce
lipsește nu mai e descrierea grupei, ci conținutul ei: nivelul rămâne implicit în vârstă, iar ce se
predă efectiv nu e reprezentat nicăieri.

**E08 S3 s-a oprit exact aici.** Grupei îi mai lipsesc două câmpuri — nivelul din catalog și
profesorul principal — iar primul vine din acest epic. Comentariul de pe `minAge`
(`apps/api/src/entities/group.entity.ts:50-52`) confirmă direcția: `int` acum, cu perechea
posibil înlocuită de nivelul din catalog la E10. Motivul pentru care vârstele au rămas totuși
câmpuri e scris în [E08](E08-multi-locatie.md), S3 — legarea lor de catalog acum ar fi însemnat să
blocheze E08 de un epic blocat el însuși de conținut. Deci și E08 stă până pornește E10 sau
[E09](E09-personal-roluri.md) — iar E10 nu mai așteaptă programa, deci deblocarea vine de aici.

Asta blochează trei lucruri simultan:

**Facturarea.** [E15](E15-pricing-facturare.md) trece la 700 lei pe modul. Un "modul" nu există ca
entitate, deci nu are nici durată, nici dată de început, nici preț. Astăzi `Invoice` are
`@Unique(['parent', 'monthIssued'])`, adică presupune ferm facturare lunară.

**Progresul.** [E13](E13-progres-evaluare.md) vrea să arate ce a învățat un copil. Fără o listă de
competențe legate de o programă, "a învățat" nu e o afirmație verificabilă.

**Marketingul.** Cel mai important obiectiv declarat e ca site-ul să arate că se predă serios.
Un catalog public de module, cu ce se învață la fiecare, cu ce iese copilul la final, e exact
substanța pe care [E19](E19-seo-geo.md) o transformă în conținut indexabil și citabil. Fără el,
paginile de cursuri rămân descrieri generice.

## Rezultat

Există un catalog de cursuri și module, cu programă, competențe și rezultate. Grupele predau un
modul concret. Facturarea, progresul și site-ul public citesc din aceeași sursă.

## În scop

- Entitățile `Course`, `Module`, `Skill`, `Lesson`.
- Ecranele de admin prin care se introduc și se editează modulele, lecțiile și competențele.
- Legarea grupelor de modul.
- Trasee de învățare între module.
- Expunere publică a catalogului.

## În afara scopului

- Evaluarea individuală a copiilor — vezi [E13](E13-progres-evaluare.md).
- Prețuri — vezi [E15](E15-pricing-facturare.md). Aici se definește *ce* se vinde, acolo *cu cât*.

## Story-uri

### S1 · Curs și modul

`Course` e traseul lung: "Programare pentru copii 8-11 ani". `Module` e unitatea vândută și predată:
nume, curs, ordine, număr de ședințe, durata unei ședințe, interval de vârstă recomandat, cerințe
prealabile, descriere publică, rezultate așteptate.

**Acceptanță:** un admin creează un modul din interfață — curs, ordine, număr de ședințe, vârstă,
descriere — fără migrare și fără cod, iar grupele îl pot folosi. Introducerea modulelor reale e o
operațiune de conținut peste ecranul livrat aici, nu o condiție ca story-ul să fie gata.

### S2 · Lecții și competențe

`Lesson`: aparține unui modul, are ordine, titlu, obiective, materiale. `Skill`: competență
dobândită, legată de lecții și module, cu nivel.

Aici se așază și materialele de curs, dacă vrei ca profesorii să le găsească în platformă și nu pe
un drive.

**Acceptanță:** un modul are lecțiile listate în ordine, fiecare cu competențele asociate, iar
ordinea se schimbă din interfață. Se verifică pe un modul de test, cu titluri provizorii — lecțiile
reale vin odată cu programa.

### S3 · Grupa predă un modul

`Group` primește modulul curent și data de început. De aici rezultă automat data de sfârșit, numărul
de ședințe rămase, și — după [E15](E15-pricing-facturare.md) — ce se facturează.

**Acceptanță:** deschizi o grupă și vezi "Scratch Începători, modulul 2 din 4, ședința 5 din 12,
se încheie pe 12 decembrie".

### S4 · Trasee

Legături între module: ce urmează după ce. Folosit la reînscriere — un copil care termină un modul
primește sugestia naturală de continuare, ceea ce e și mecanismul principal de retenție.

**Acceptanță:** la finalul unui modul, sistemul propune continuarea, iar părintele o poate accepta
din portal.

### S5 · Catalog public

Paginile publice de cursuri se generează din catalog, nu din constantele scrise de mână în
`apps/web/shared/courses.ts`, de unde le citește azi `apps/web/app/pages/cursuri.vue`.
Fiecare modul are pagină proprie, cu programă, rezultate, vârstă, durată, preț, și locațiile unde
se predă.

Paginile per modul din [E19](E19-seo-geo.md), S4, sunt pasul următor, nu acesta, și rămân în urmă
intenționat: mecanismul se poate construi peste titluri provizorii, dar o pagină publicată peste ele
e conținut subțire — exact lucrul care coboară un domeniu în loc să-l urce. Se publică atunci când
fiecare modul are text real.

**Acceptanță:** o modificare în catalog se vede pe site fără schimbare de cod. Fiecare modul are URL
propriu, indexabil — publicat când are ce indexa.

## Dependențe

[E04](E04-migrari-date.md).

## Riscuri

**Catalogul e muncă de conținut, nu de programare — dar nu mai e blocaj.** Structura se face în
câteva zile; scrierea programei pentru fiecare modul, cu obiective și rezultate, ia mult mai mult și
nu poate fi delegată unui dezvoltator. Ce s-a schimbat e că cele două nu mai stau în serie:
entitățile, ecranele de admin și expunerea publică se construiesc acum, iar programa se introduce
prin ele când e scrisă.

Riscul rămas e altul, și e de disciplină: **un catalog gol arată la fel cu unul terminat.** Ecranele
merg, API-ul răspunde, testele trec — și nu e nimic înăuntru. De aceea acceptanța fiecărui story se
formulează pe date de test, iar „gata" se declară pe mecanism, nu pe conținut; iar publicarea
paginilor de modul e legată explicit de existența textului real, nu de cea a codului.

**Modelarea prea fină devine povară.** Dacă fiecare lecție cere zece câmpuri completate, nimeni nu
le va completa. Începe cu minimul care servește facturarea și site-ul public, și adaugă doar ce se
dovedește util.

## Definition of done

Fiecare grupă activă predă un modul din catalog. Site-ul public se generează din el.
[E15](E15-pricing-facturare.md) are pe ce să calculeze.

Se citește în două trepte, fiindcă epicul se livrează în două trepte. **Mecanismul e gata** când un
admin poate introduce un curs, modulele lui, lecțiile și competențele din interfață, poate lega o
grupă de un modul, iar catalogul public se generează din baza de date și nu din
`apps/web/shared/courses.ts`. **Catalogul e gata** când modulele reale sunt înăuntru — un pas de
conținut, făcut prin ecranele de mai sus, care nu cere nicio livrare de cod și nu se numără la
progresul acestui epic.

## Decizii luate

**Modulul urmează structura anului școlar românesc: 5 module pe an, de 6-8 săptămâni fiecare,
delimitate de vacanțe.** O ședință pe săptămână, deci 6-8 ședințe per modul, ~35 pe an școlar.

Consecința cea mai importantă e că **durata modulului e variabilă, iar prețul e fix** — vezi
[E15](E15-pricing-facturare.md). Deci `Module` are număr de ședințe *derivat din calendar*, nu
configurat manual.

Asta rezolvă elegant o problemă veche: lunile cu vacanță nu mai cer regula de trei simplă, pentru
că vacanțele *sunt* granițele modulelor, nu excepții de calculat înăuntrul lor.

Efectul asupra structurii: **calendarul școlar devine date de bază, nu o facilitate**.
[E12](E12-prezenta-orar.md), S2 — calendarul de vacanțe — nu mai e opțional și nici secundar: el
definește când începe și se termină fiecare modul, deci și ce se facturează. Cele două epicuri se
ating aici și merită implementate în aceeași perioadă.

Structura anuală, pentru referință:

| | Perioadă orientativă | Ședințe |
|---|---|---|
| Modul 1 | septembrie – octombrie | ~7 |
| Modul 2 | noiembrie – decembrie | ~7 |
| Modul 3 | ianuarie – februarie | ~6 |
| Modul 4 | martie – aprilie | ~7 |
| Modul 5 | mai – iunie | ~8 |

**E10 se construiește fără programa reală.** Structura de mai sus e tot ce trebuie știut ca să se
scrie entitățile, migrările, ecranele de admin prin care se introduc modulele, lecțiile și
competențele, și expunerea publică a catalogului. Conținutul intră prin aceleași ecrane, scris de
cine îl scrie, fără cod și fără migrare. Motivul e literal: programa poate întârzia până la finalul
vacanței, și nu are de ce să țină loc un epic întreg.

Cele șase niveluri din `apps/web/shared/courses.ts` au deja slug, interval de vârstă, descriere
scurtă și listă de subiecte predate, deci `Course` are de unde porni. Ce lipsește e nivelul de
dedesubt: care sunt cele 5 module ale fiecărui nivel, ce lecții are fiecare modul și ce competență
rezultă din fiecare lecție.

Ce **nu** se poate face până vine programa, exact două lucruri:

- **Seed-ul cu module reale.** `apps/api/src/seed/seed.ts` primește module de test, cu titluri
  provizorii, ca grupele, prezența și facturarea să aibă pe ce rula. Datele reale nu ajung în seed
  nici după aceea — locul lor e baza de producție, introdusă din interfață. Un seed care ar pretinde
  că e programa școlii ar deveni a doua sursă de adevăr, ca de fiecare dată.
- **Paginile per modul din [E19](E19-seo-geo.md), S4.** Sunt paginile cu intenție comercială clară,
  și tocmai de aceea au nevoie de text real: ce se învață, ce iese copilul la final. Peste titluri
  provizorii ar fi conținut subțire, indexat prost, și greu de reparat după prima trecere a
  crawler-ului. Mecanismul se construiește; publicarea așteaptă textul.

**Un copil urmează un singur modul odată.** Modelul actual spune deja asta — `Child.group` e o
singură grupă, nullable (`apps/api/src/entities/child.entity.ts:29-31`), iar o grupă predă un
singur modul — și rămâne așa. Motivul nu e tehnic: „e prea mult pentru copil să vină de două ori pe
săptămână". Vor exista părinți care cer altceva; răspunsul e nu.

Consecința pentru acest epic e că `Module` nu are nevoie de nicio relație directă cu `Child`, cu
atât mai puțin de una many-to-many: ce urmează un copil se citește prin grupa lui. Iar traseele de
la S4 sunt secvențiale prin construcție — ce vine după ce, nu ce se poate face în paralel.

## Întrebări deschise

- Datele exacte de început și sfârșit ale celor 5 module, pentru anul școlar curent și următorul.
  Nu blochează construcția, dar blochează prima factură: din ele rezultă când începe și se termină
  un modul, deci și ce se facturează. Sunt aceleași date cu calendarul de vacanțe din
  [E12](E12-prezenta-orar.md), S2.
- Care sunt modulele reale predate acum, pe nivel și vârstă? Rămâne deschisă ca **muncă de conținut,
  nu ca blocaj** — răspunsul se introduce prin ecranele de admin, nu prin cod.
- ~~Un copil poate urma două module în paralel?~~ **Nu**, și nici nu se face configurabil. Vezi
  [Decizii luate](#decizii-luate).
- ~~Ce se întâmplă cu un copil care se înscrie la mijlocul unui modul?~~ Se facturează **pro-rata pe
  ședințele rămase**, numărate din **calendarul modulului**, nu din prezența efectivă: ședințele
  rămase se știu în ziua înscrierii, prezența abia la final, iar o factură care ar aștepta prezența
  s-ar emite după ce s-a consumat tot ce facturează. Regula, cu rotunjirea și ordinea față de
  reducerea de frați, se scrie în [E15](E15-pricing-facturare.md) — aici doar se reține că `Module`
  trebuie să dea numărul de ședințe și data fiecăreia, altfel proporția nu se poate calcula.
