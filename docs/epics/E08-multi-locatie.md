# E08 · Multi-locație și săli

**Status:** propus · **Pistă:** Domeniu · **Depinde de:** E04 · **Blochează:** E09, E11, E14, E19

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
[E14](E14-proiecte-elevi.md) nu poate ști ce calculator din ce sală aparține cărei grupe.

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

### S2 · Corectarea constrângerii de unicitate

`@Unique(['weekday', 'startTime'])` devine `@Unique(['room', 'weekday', 'startTime'])`. Aceeași sală
nu poate găzdui două grupe simultan; săli diferite pot.

Migrarea trebuie să detecteze mai întâi dacă există grupe cu ore decalate artificial ca să ocolească
vechea constrângere, și să le semnaleze pentru corectare manuală.

**Acceptanță:** două grupe marți la 17:00, în săli diferite, se salvează fără eroare. Aceeași sală,
același interval — respins cu mesaj util.

### S3 · Grupa devine descriptibilă

`Group` primește: nume, sală (deci implicit locație), capacitate maximă, nivel — legat de catalogul
din [E10](E10-curriculum-module.md) — și profesor principal, după [E09](E09-personal-roluri.md).

Câmpurile `minAge` și `maxAge` sunt astăzi `decimal`, ceea ce e ciudat pentru vârste. Devin
întregi, sau sunt înlocuite de nivelul din catalog, dacă vârsta e o consecință a nivelului și nu
un criteriu independent.

**Acceptanță:** un admin creează "Scratch Începători · Titan · Sala 2 · marți 17:00 · max 10".

### S4 · Locația în interfață

Selector de locație în antetul zonei de admin, persistent între pagini. Toate listele — copii,
grupe, prezență, facturi, rapoarte — respectă selecția. Un mod "toate locațiile" pentru privirea de
ansamblu.

**Acceptanță:** cele 25 de pagini de admin respectă selectorul. Nicio listă nu amestecă locațiile
fără să o spună.

### S5 · Migrarea datelor existente

Toate grupele existente sunt atribuite locației principale și unei săli implicite, cu semnalarea
celor care par să aparțină de fapt celeilalte locații.

**Acceptanță:** după migrare, nicio grupă nu e fără sală.

## Dependențe

[E04](E04-migrari-date.md). Fără migrări, schimbarea unei constrângeri de unicitate pe date reale e
periculoasă.

## Riscuri

**Datele istorice sunt probabil deja compromise de vechea constrângere.** Dacă grupele au fost
decalate cu 15 minute ca să încapă, orarul din prezențe nu reflectă realitatea. Trebuie decis dacă
se corectează retroactiv sau se acceptă ca istoric imperfect, marcat ca atare.

**Locația atinge fiecare ecran de admin.** E o schimbare largă și puțin adâncă. Merită făcută
într-un singur efort concentrat, nu strecurată bucată cu bucată.

## Definition of done

Nicio entitate operațională nu e ambiguă în privința locului unde se întâmplă. A treia locație s-ar
adăuga din interfață, fără cod.

## Întrebări deschise

- Care sunt numele și adresele exacte ale celor două locații? Intră în [E19](E19-seo-geo.md) și în
  Google Business Profile, deci trebuie să fie exact aceleași peste tot.
- Un copil poate fi înscris în grupe din locații diferite? Presupun că da, dar schimbă interfața de
  înscriere.
- Prețurile diferă pe locație? Dacă da, [E15](E15-pricing-facturare.md) trebuie să știe de la început.
