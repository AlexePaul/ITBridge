# E10 · Curriculum și catalog de module

**Status:** propus · **Pistă:** Domeniu · **Depinde de:** E04 · **Blochează:** E11, E13, E14, E15

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
[E09](E09-personal-roluri.md).

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

**Acceptanță:** modulele reale predate acum sunt în catalog, cu numărul corect de ședințe.

### S2 · Lecții și competențe

`Lesson`: aparține unui modul, are ordine, titlu, obiective, materiale. `Skill`: competență
dobândită, legată de lecții și module, cu nivel.

Aici se așază și materialele de curs, dacă vrei ca profesorii să le găsească în platformă și nu pe
un drive.

**Acceptanță:** un modul are lecțiile listate în ordine, fiecare cu competențele asociate.

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

Paginile publice de cursuri se generează din catalog, nu din text scris de mână în `courses.vue`.
Fiecare modul are pagină proprie, cu programă, rezultate, vârstă, durată, preț, și locațiile unde
se predă.

**Acceptanță:** o modificare în catalog se vede pe site fără schimbare de cod. Fiecare modul are URL
propriu, indexabil.

## Dependențe

[E04](E04-migrari-date.md).

## Riscuri

**Catalogul e muncă de conținut, nu de programare.** Structura se face în câteva zile; scrierea
programei pentru fiecare modul, cu obiective și rezultate, ia mult mai mult și nu poate fi delegată
unui dezvoltator. E cel mai probabil punct de blocare al acestui epic.

**Modelarea prea fină devine povară.** Dacă fiecare lecție cere zece câmpuri completate, nimeni nu
le va completa. Începe cu minimul care servește facturarea și site-ul public, și adaugă doar ce se
dovedește util.

## Definition of done

Fiecare grupă activă predă un modul din catalog. Site-ul public se generează din el.
[E15](E15-pricing-facturare.md) are pe ce să calculeze.

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

## Întrebări deschise

- Datele exacte de început și sfârșit ale celor 5 module, pentru anul școlar curent și următorul.
- Care sunt modulele reale predate acum, pe nivel și vârstă?
- Un copil poate urma două module în paralel?
- Ce se întâmplă cu un copil care se înscrie la mijlocul unui modul?
