# E09 · Personal, roluri și permisiuni

**Status:** propus · **Pistă:** Domeniu · **Depinde de:** E08 · **Blochează:** E11, E12, E13, E14

## Problemă

Există exact două roluri, în `apps/api/src/enum/role.enum.ts`:

```ts
export enum Role { PARENT = 'PARENT', ADMIN = 'ADMIN' }
```

**Nu există rol de profesor.** Omul care ține cursul și marchează prezența ori nu are cont, ori are
cont de admin — adică vede toate facturile, toate datele de contact ale tuturor părinților, și poate
șterge orice. Cu două locații și mai mulți profesori, asta nu mai e o scurtătură acceptabilă, e o
problemă de confidențialitate.

Nu există nici entitate de personal. Un profesor nu poate fi alocat unei grupe, nu are disponibilitate,
nu are ore lucrate, nu apare nicăieri în model. `Group` nu are câmp de profesor.

În plus, `register` creează întotdeauna `PARENT`, iar promovarea la admin se face manual în baza de
date sau prin `PUT /users/:id`. Nu există flux de invitație pentru personal.

## Rezultat

Fiecare persoană din școală are contul potrivit, cu acces exact cât îi trebuie. Un profesor își vede
grupele și copiii, marchează prezența, încarcă proiecte — și nu vede nici facturi, nici date ale
copiilor din alte grupe.

## În scop

- Entitatea `Staff` și legarea de `Group`.
- Roluri noi: profesor, coordonator de locație, plus cele două existente.
- Restrângerea accesului pe locație.
- Flux de invitație pentru personal.
- Disponibilitate și alocare.

## În afara scopului

- Salarizare și pontaj. Se poate discuta la [E21](E21-raportare-analytics.md), dacă apare nevoia de
  raportare pe ore.

## Story-uri

### S1 · Entitatea de personal

`Staff`: legat opțional de `User` — după tiparul existent `User`/`Profile`, ca să poți avea un
profesor în sistem înainte să aibă cont — nume, contact, locații în care predă, specializări,
status activ, dată de angajare.

**Acceptanță:** toți profesorii actuali sunt în sistem, alocați locațiilor.

### S2 · Roluri noi

`ADMIN` — tot, ambele locații. `LOCATION_MANAGER` — tot, restrâns la locațiile lui.
`TEACHER` — grupele lui: copiii din ele, prezența, proiectele, progresul. Fără acces la facturi,
plăți sau date de contact ale părinților, dincolo de ce e strict necesar pentru curs.
`PARENT` — datele proprii, ca acum.

**Acceptanță:** un profesor autentificat primește 403 pe `/invoices`, și vede la `/children` doar
copiii din grupele lui.

### S3 · Restrângere pe locație

Tiparul de filtrare pe date din service, care astăzi filtrează după utilizator pentru părinți, se
extinde cu filtrare după locație pentru coordonatori și profesori. Aplicat consecvent, ca în
`apps/api/src/modules/invoice/invoice.service.ts:92`.

**Acceptanță:** auditul din [E05](E05-robustete-backend.md), S8 acoperă și dimensiunea de locație,
cu test pentru fiecare rol.

### S4 · Profesor pe grupă

`Group` primește profesor principal și, opțional, un ajutor. Un profesor își vede grupele pe un
ecran propriu, cu programul zilei.

**Acceptanță:** un profesor deschide aplicația și vede ce grupe are azi, în ce sală, cu ce copii.

### S5 · Invitație pentru personal

Un admin invită pe email, cu rol și locații prestabilite. Destinatarul își setează parola printr-un
link cu termen de valabilitate. Promovarea manuală prin baza de date dispare.

**Acceptanță:** un profesor nou are cont funcțional fără intervenție în baza de date.

### S6 · Disponibilitate

Fiecare membru al personalului are intervale în care poate preda, pe locație. Folosit la formarea
grupelor în [E11](E11-inscrieri-capacitate.md) și la detectarea conflictelor.

**Acceptanță:** alocarea unui profesor unei grupe în afara disponibilității lui e semnalată.

## Dependențe

[E08](E08-multi-locatie.md). Rolurile restrânse pe locație presupun că locația există.

[E07](E07-securitate-gdpr.md), S3 — jurnalul de audit. Nu blochează epicul întreg, dar blochează
S2: decizia din „Decizii luate", că profesorul vede datele de contact complete ale părinților din
grupele lui, e apărabilă doar cu jurnalul care o însoțește. Fără el nu există răspuns la „cine a
avut acces la datele acestei familii", iar limitarea rămâne o promisiune scrisă în docs, nu un
fapt verificabil. **Deci E07 S3 se livrează odată cu S2, nu după.** Un rol de profesor pus în
producție înaintea jurnalului lărgește accesul la date de contact fără să lase urmă — iar un jurnal
pornit mai târziu nu repară nimic retroactiv, fiindcă accesele deja făcute nu se reconstituie.

## Riscuri

**Fiecare rol nou multiplică suprafața de testat.** Patru roluri peste zeci de endpoint-uri
înseamnă o matrice mare. Testul parametrizat din [E03](E03-testare-ci.md), S4 devine esențial, nu
opțional.

**Profesorii folosesc astăzi conturi de admin.** Trecerea la rolul restrâns le va lua acces la
lucruri cu care s-au obișnuit. Merită anunțată și însoțită de ecranul din S4, ca schimbarea să fie
un câștig, nu o pierdere.

## Definition of done

Niciun profesor nu are cont de admin. Fiecare rol are matrice de permisiuni documentată și testată.
Personalul nou se adaugă din interfață.

## Decizii luate

**Profesorul vede datele de contact complete ale părinților din grupele lui.** Nu vede facturi,
plăți sau situația financiară.

E o alegere de comoditate operațională peste minimizarea datelor, deci S2 primește trei limitări
care o fac apărabilă fără să o anuleze:

- **Doar grupele proprii, doar cât durează alocarea.** Accesul se ridică automat când înscrierea
  copilului se încheie sau când profesorul nu mai predă acelei grupe. Nu există acces rezidual.
- **Vizualizarea datelor de contact intră în audit log** ([E07](E07-securitate-gdpr.md), S3).
  Nu ca să fie urmăriți profesorii, ci ca întrebarea „cine a avut acces la datele acestei familii"
  să aibă răspuns.
- **Informarea părinților** că profesorul are aceste date intră în politica de confidențialitate.

Merită reevaluat când echipa crește. Cu doi-trei profesori stabili, riscul e mic; cu zece și
fluctuație de personal, [E17](E17-comunicare-notificari.md) devine alternativa mai bună.

## Întrebări deschise

- Câți profesori sunt, și predau în ambele locații sau sunt legați de una?
- Există rol de recepție sau administrativ, distinct de coordonator de locație?
