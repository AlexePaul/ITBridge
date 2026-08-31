# E09 · Personal și alocare

**Status:** **scos din MVP** · **Pistă:** Domeniu · **Depinde de:** E08 · **Blochează:** E08 S3, E11

> ## Scos din MVP
>
> **Nu există rol `TEACHER`: toți cei care se autentifică sunt admini.** Decizia e a școlii și e
> consecventă cu felul în care lucrează — o școală mică, unde cei care predau sunt și cei care
> administrează.
>
> Ce rămâne blocat de asta, și e în regulă să rămână: profesorul principal pe grupă
> ([E08](E08-multi-locatie.md) S3), disponibilitatea profesorilor din ecranul de formare a grupelor
> ([E11](E11-inscrieri-capacitate.md) S7), și interfața de profesor optimizată pentru telefon
> ([E18](E18-frontend-portal.md) S7). Toate trei sunt scrise ca livrate parțial, cu jumătatea care
> lipsește numită — nu ca goluri tăcute.
>
> Se reia dacă școala angajează pe cineva care predă fără să administreze. Până atunci, un rol în
> plus e o permisiune de întreținut fără nimeni care s-o folosească.

## Problemă

Nu există entitate de personal. Un profesor nu poate fi alocat unei grupe, nu are disponibilitate,
nu apare nicăieri în model. `apps/api/src/entities/group.entity.ts` are nume, zi, oră de început și
de sfârșit, sală, capacitate, interval de vârstă și `isActive` — și niciun câmp de profesor. Nicio
altă entitate din `apps/api/src/entities/` nu descrie o persoană care predă.

Consecința e concretă, nu teoretică: **[E08](E08-multi-locatie.md) S3 a rămas oprită exact aici.**
Grupa a primit nume, sală și capacitate, dar „profesor principal" a rămas nelivrat, fiindcă nu are
pe ce să se lege. Nimeni nu poate răspunde din platformă la „cine ține marți la 17:00 la Titan", nu
există ecranul cu programul zilei pentru omul care intră în sală, iar formarea grupelor din
[E11](E11-inscrieri-capacitate.md) nu are cum să țină cont de cine e liber când.

**Ce nu mai e o problemă: rolurile.** Versiunea anterioară a epicului susținea că profesorii cu cont
de admin sunt o problemă de confidențialitate. Astăzi nu e adevărat. Cei doi profesori
(`apps/web/shared/teachers.ts` — fișierul confirmă că sunt exact doi; că sunt și proprietarii școlii
e o decizie a patronului, nu ceva scris în cod) văd facturile și datele de contact ale părinților
pentru că sunt ale lor, nu pentru că lipsește un guard. Un rol restrâns pus peste doi oameni care
oricum au dreptul la tot nu protejează pe nimeni; adaugă doar o matrice de permisiuni de întreținut.
Argumentul rămâne valabil, dar pentru viitor — vezi
[Amânat, cu condiția de reluare](#amânat-cu-condiția-de-reluare).

`apps/api/src/enum/role.enum.ts` rămâne deci cu două valori, `PARENT` și `ADMIN`. Asta e decizia
luată, nu o restanță.

## Rezultat

Platforma știe cine predă ce, unde și când poate. Grupa are profesor, profesorul are program, iar
alocarea unei grupe noi pornește de la cine e liber, nu de la memoria cuiva.

## În scop

- Entitatea `Staff` și legarea ei de `User` și de `Group`.
- Profesor principal pe grupă, plus ecranul „grupele mele azi".
- Disponibilitate pe intervale, folosită la alocare.

## În afara scopului

- **Rolurile `TEACHER` și `LOCATION_MANAGER`, și restrângerea accesului pe locație.** Amânate
  explicit, cu condiție de reluare — vezi secțiunea dedicată mai jos.
- **Invitația pe email pentru personal.** Amânată în același loc, din același motiv.
- Salarizare și pontaj. Se poate discuta la [E21](E21-raportare-analytics.md), dacă apare nevoia de
  raportare pe ore.
- Detectarea conflictelor de orar între locații — vezi [Decizii luate](#decizii-luate).

## Story-uri

### S1 · Entitatea de personal

`Staff`: legat **opțional** de `User` — după tiparul existent `User`/`Profile`, ca să poți avea un
profesor în sistem înainte să aibă cont — nume, contact, specializări, status activ, dată de
angajare.

Fără câmp de locație. Orice profesor predă la orice locație (vezi
[Decizii luate](#decizii-luate)), deci o coloană `location_id` pe `Staff` ar fi o restricție pe care
n-o cere nimeni și pe care primul orar mixt ar trebui s-o ocolească.

Legarea de un cont existent se face din interfața de admin, ca la profiluri. Contul rămâne `ADMIN`
— `Staff` descrie ce face omul în școală, `Role` descrie ce are voie să atingă în aplicație, iar
cele două nu sunt același lucru nici azi, nici după ce apar roluri noi.

**Acceptanță:** ambii profesori actuali sunt în sistem, legați de conturile lor.

### S4 · Profesor pe grupă

`Group` primește profesor principal și, opțional, un ajutor. Un membru al personalului își vede
grupele pe un ecran propriu, cu programul zilei: ce grupe are azi, în ce sală, la ce locație, cu ce
copii.

E piesa pe care [E08](E08-multi-locatie.md) S3 o așteaptă ca să se închidă, și singura din epic
care deblochează altceva. Se face prima după S1.

Profesorul principal e nullable pe grupă: grupele existente nu au unul, iar migrarea nu are de unde
să-l inventeze. Se completează din interfață.

**Acceptanță:** un admin alocă un profesor unei grupe, iar acesta deschide aplicația și vede ce
grupe are azi, în ce sală, cu ce copii. E08 S3 se poate marca livrat.

### S6 · Disponibilitate

Fiecare membru al personalului are intervale în care poate preda, pe zi și oră. Fără dimensiunea de
locație, din același motiv ca la S1. Folosit la formarea grupelor în
[E11](E11-inscrieri-capacitate.md).

**Alocarea în afara disponibilității se semnalează, nu se blochează.** Disponibilitatea e o
declarație, nu un contract: cine o ține la zi e omul însuși, iar un formular care refuză salvarea pe
baza unei declarații vechi de trei luni transformă o comoditate în piedică. Avertismentul e util,
refuzul nu.

Verificarea „același profesor, două grupe simultan, la locații diferite" **nu intră aici** — e
amânată explicit, vezi [Decizii luate](#decizii-luate).

**Acceptanță:** alocarea unui profesor unei grupe în afara disponibilității lui declarate e
semnalată în interfață, iar salvarea rămâne posibilă.

## Amânat, cu condiția de reluare

Story-urile de mai jos rămân scrise, pentru că argumentul lor nu s-a schimbat — s-a schimbat doar
momentul. Nu se implementează acum.

**Condiția de reluare, pentru toate trei: primul profesor care nu e proprietar al școlii.** Până
atunci nu există persoană căreia să-i restrângi ceva. După aceea, toate trei se reiau odată — un rol
nou fără flux de invitație înseamnă tot promovare manuală în baza de date, iar o invitație fără
roluri trimite pe email acces complet la facturi, ceea ce e mai rău decât ce avem azi.

### S2 · Roluri noi — amânat

`ADMIN` — tot, ambele locații. `LOCATION_MANAGER` — tot, restrâns la locațiile lui.
`TEACHER` — grupele lui: copiii din ele, prezența, proiectele, progresul. Fără acces la facturi,
plăți sau date de contact ale părinților, dincolo de ce e strict necesar pentru curs.
`PARENT` — datele proprii, ca acum.

**Acceptanță, când se reia:** un profesor autentificat primește 403 pe `/invoices`, și vede la
`/children` doar copiii din grupele lui.

Enum-ul din `apps/api/src/enum/role.enum.ts` rămâne un enum tocmai ca adăugarea unei valori să fie
o linie plus guard-ele, nu o refacere. Nu se pune nimic în cod „pregătitor" pentru rolurile astea:
un `RolesGuard` care tratează cazuri inexistente e cod netestat care arată ca protecție.

### S3 · Restrângere pe locație — amânat

Tiparul de filtrare pe date din service, care astăzi filtrează după utilizator pentru părinți, s-ar
extinde cu filtrare după locație pentru coordonatori și profesori. Aplicat consecvent, ca în
`apps/api/src/modules/invoice/invoice.service.ts:92`.

Cade odată cu S2, fiindcă nu are cine să fie restrâns: singurele două roluri sunt `ADMIN`, care vede
ambele locații prin definiție, și `PARENT`, care e deja restrâns la propriile date. Selectorul de
locație din [E08](E08-multi-locatie.md) S4 rămâne ce e — o comoditate de filtrare pentru admin, nu o
graniță de securitate. **Diferența asta trebuie păstrată clară**: cine confundă selectorul cu o
permisiune va presupune, când apar rolurile, că restrângerea există deja.

### S5 · Invitație pentru personal — amânat

Un admin invită pe email, cu rol prestabilit. Destinatarul își setează parola printr-un link cu
termen de valabilitate. Promovarea manuală prin baza de date dispare.

Amânat, deși la prima vedere e independent de roluri. Motivul: fără roluri, singurul lucru pe care
îl poate trimite invitația e un cont de `ADMIN`. Adică un link pe email care dă acces la toate
facturile și la toate datele de contact ale tuturor familiilor — o suprafață de atac nouă, construită
pentru zero destinatari, fiindcă ambii oameni care ar primi-o au deja conturi. Promovarea manuală e
urâtă, dar se face o dată la câțiva ani și lasă urmă în baza de date.

Ce rămâne în scop în locul ei, la S1: legarea unui `Staff` de un `User` existent, din interfață.
Acoperă cazul real de azi fără să deschidă nimic.

## Dependențe

[E08](E08-multi-locatie.md). Profesorul pe grupă presupune că grupa are sală și locație, ceea ce e
livrat. Partea din E08 care așteaptă E09 e S3, deci relația e circulară la nivel de story și se
desface într-o singură ordine: E08 S1–S5 (livrate) → E09 S1 → E09 S4 → E08 S3 închis.

**Dependența blocantă de [E07](E07-securitate-gdpr.md) S3 a căzut.** Era acolo pentru că decizia
„profesorul vede datele de contact complete ale părinților din grupele lui" era apărabilă doar
însoțită de un jurnal de audit care să răspundă la „cine a avut acces la datele acestei familii".
Decizia aceea nu mai are obiect: profesorul e admin și vede tot oricum, nu prin excepția asta, ci
prin rol. Nu se lărgește niciun acces, deci nu se cere nicio urmă în plus. E07 S3 rămâne o idee bună
din alte motive, dar nu întârzie nimic din E09 — **și redevine blocantă în clipa în care se reia S2**,
fiindcă atunci accesul chiar se redefinește, iar un jurnal pornit după nu reconstituie accesele deja
făcute.

## Ce blochează, de fapt

Antetul a fost corectat. Ce era acolo, și ce a mai rămas adevărat:

- **[E11](E11-inscrieri-capacitate.md) — da.** Are nevoie de profesorul pe grupă (S4) și de
  disponibilitate (S6) ca să propună o grupă pentru un copil nou.
- **[E08](E08-multi-locatie.md) S3 — da.** Singurul lucru din E08 care mai lipsește, alături de
  nivelul din [E10](E10-curriculum-module.md).
- **[E12](E12-prezenta-orar.md) — nu.** Nu referă E09 nicăieri și depinde de E11, nu direct de
  aici. Prezența se marchează azi de un admin și va continua să se marcheze de un admin.
- **[E13](E13-progres-evaluare.md) — nu.** Depinde de E10 și E12.
- **[E14](E14-proiecte-elevi.md) — nu.** Aștepta rolul de profesor pentru autorul încărcării și
  pentru ecranul „ce grupă e în sală acum". Fluxul lui se schimbă: încărcarea vine de la un agent
  local, iar trimiterea o apasă un admin. Cine apasă e un `User` cu rol `ADMIN`, care există deja.

## Riscuri

**Un `Staff` fără roluri poate părea inutil și poate fi tăiat de cineva grăbit.** Nu e: e singurul
loc în care încape „cine predă grupei ăsteia" și „când poate preda", iar amândouă sunt cerute de
E08 și E11 independent de orice permisiune. Rolul e despre ce ai voie să vezi; `Staff` e despre cine
face treaba. Confundarea lor e exact motivul pentru care epicul ăsta a trebuit rescris.

**Când vor apărea rolurile, fiecare rol nou multiplică suprafața de testat.** Patru roluri peste
zeci de endpoint-uri înseamnă o matrice mare. Matricea de autorizare din
`apps/api/src/authorization.spec.ts` se enumeră singură pe handlere, deci partea de guard e
acoperită gratuit; ce trebuie scris de mână e efectul filtrării pe date, la nivel de integrare.

## Decizii luate

**Nu există rol de profesor. Toți sunt admin.** Cei doi oameni care predau sunt proprietarii școlii,
deci un rol restrâns nu i-ar proteja pe ei de nimic și n-ar proteja pe nimeni de ei. Enum-ul de
roluri rămâne extensibil și nimic din model nu presupune că vor fi mereu două valori — dar nu se
scrie cod pentru roluri care nu există. Condiția de reluare e în
[secțiunea de amânări](#amânat-cu-condiția-de-reluare).

**Ce cade odată cu ea:** decizia veche „profesorul vede datele de contact complete ale părinților
din grupele lui, cu trei limitări care o fac apărabilă" — acces doar la grupele proprii, doar pe
durata alocării, cu audit log și informarea părinților. Nu se aplică nimănui azi: profesorul e
admin, deci vede contactele oricum, iar limitările ar fi restricții asupra unui rol inexistent.
Decizia se reia **cuvânt cu cuvânt** odată cu S2, împreună cu dependența de E07 S3 — nu se pierde,
doar nu se aplică acum.

**Orice profesor poate preda la oricare locație.** Nu e legat de una, nici în model, nici în
interfață — de aceea `Staff` nu are câmp de locație și disponibilitatea nu are dimensiune de
locație. Legătura cu locul se face prin grupă: grupa are sală, sala are locație, iar profesorul are
grupa.

**Detectarea conflictelor e recunoscută și amânată explicit.** Aceeași persoană nu poate fi în două
locuri simultan, iar modelul de mai sus permite să fie alocată la două grupe care se suprapun, la
adrese diferite. Nu e o problemă acum: orarul e făcut de aceiași doi oameni care predau, deci
ciocnirea se vede înainte să fie salvată. Devine reală când numărul de profesori depășește numărul
de oameni care fac orarul. Verificarea, atunci, e o interogare pe grupele profesorului cu
suprapunere de zi și interval, semnalată la salvare — nu cere nicio schimbare de schemă față de ce
livrează S4 și S6, deci amânarea nu creează datorie.

**`Staff` e opțional legat de `User`, ca `Profile`.** Un colaborator poate exista în orar înainte să
aibă cont, și poate să nu aibă niciodată unul. Tiparul e deja în repo și `GET /users/without-profile`
arată cum arată fluxul de legare ulterioară.

## Definition of done

Fiecare grupă activă are un profesor principal. Fiecare membru al personalului își vede programul
zilei din aplicație. Disponibilitatea e declarată și e consultată la alocare. `Staff` se adaugă și
se leagă de un cont din interfață, fără intervenție în baza de date.

Rolurile nu sunt în definiția asta, intenționat. Epicul se închide fără ele.

## Întrebări deschise

- ~~Câți profesori sunt, și predau în ambele locații sau sunt legați de una?~~ **Doi, amândoi
  proprietari, amândoi predau la oricare locație.** Vezi [Decizii luate](#decizii-luate).
- ~~Există rol de recepție sau administrativ, distinct de coordonator de locație?~~ Nu se pune:
  nu există niciun rol nou. Întrebarea revine odată cu S2.
- Rămâne un ajutor pe grupă (`assistant`) o nevoie reală, sau grupele sunt mereu ținute de un singur
  om? S4 îl prevede opțional; dacă răspunsul e „mereu unul singur", câmpul se scoate înainte de
  migrare, nu după.
