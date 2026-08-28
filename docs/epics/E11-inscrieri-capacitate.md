# E11 · Înscrieri, grupe și capacitate

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E08, E09, E10 · **Blochează:** E12, E15

## Problemă

Înscrierea unui copil într-o grupă e astăzi o singură operație brută:
`POST /children/:childId/groups/:groupId`, rezervată adminului
(`apps/api/src/modules/child/child.controller.ts:59`, `@Roles(Role.ADMIN)`), care doar setează o
cheie străină.

Ce lipsește:

- **Capacitate neaplicată.** `Group.capacity` există din [E08](E08-multi-locatie.md) — coloană
  `int`, cu `CHK_groups_capacity_positive` în `apps/api/src/entities/group.entity.ts` și validată
  server-side să nu depășească sala (`GroupService.assertFitsInRoom`, cod `GROUP_OVER_ROOM_CAPACITY`).
  Dar **nimic nu o verifică la înscriere**: `ChildService.assignChildToGroup`
  (`apps/api/src/modules/child/child.service.ts:105`) setează cheia străină indiferent de câți copii
  sunt deja acolo. Numărul maxim e declarat și nerespectat, ceea ce e mai rău decât să lipsească —
  adminul îl citește ca pe o garanție.
- **Istoric.** `Child.group` e o singură referință. Când un copil se mută dintr-o grupă în alta,
  legătura veche se pierde. Nu poți răspunde la "în ce grupă era în octombrie?", ceea ce e exact
  informația de care ai nevoie când verifici o factură contestată.
- **Perioadă.** Nu există dată de început și de sfârșit ale participării. Un copil e în grupă sau
  nu, atemporal.
- **Listă de așteptare.** O grupă plină nu are unde ține cererile.
- **Lecție de probă.** Nu există noțiunea, deși e mecanismul principal prin care un copil devine
  elev.
- **Compatibilitate.** Nimic nu verifică dacă vârsta copilului se potrivește cu intervalul grupei
  sau dacă are cerințele prealabile ale modulului din [E10](E10-curriculum-module.md).
- **Familia poate exista fără nicio dată de contact.** `RegisterDto`
  (`apps/api/src/modules/auth/dto/register.dto.ts`) cere exact două câmpuri, `username` și
  `password`. `AuthService.register` creează `User`-ul cu `role: Role.PARENT` și îi întoarce pe loc
  perechea de tokenuri — nu există confirmare de adresă și nu există stare de cont neaprobat, fiindcă
  `User` (`apps/api/src/entities/user.entity.ts`) nu are nici coloană de email, nici coloană de
  status. `Profile.email`, `Profile.phone` și `Profile.address` sunt toate `nullable`, iar în
  `CreateProfileDto` sunt toate `@IsOptional()`. Deci o familie cu înscriere activă poate exista fără
  nicio adresă unde să-i trimiți factura sau mementoul de restanță — iar lipsa nu se semnalează
  nicăieri.

Consecința pentru facturare: [E15](E15-pricing-facturare.md) trebuie să știe cine a fost înscris în
ce modul, în ce perioadă. Cu modelul actual, informația nu există.

## Rezultat

Înscrierea e o entitate cu durată, istoric și stare. Capacitatea e respectată. Fiecare familie
înscrisă are un cont verificat, cu date de contact și de facturare complete, aprobat de un admin. O
grupă plină pune cererea pe listă în loc să o piardă.

## În scop

- Entitatea `Enrollment`, cu perioadă și stare.
- Contul de părinte cu date complete la înregistrare, email confirmat și aprobare de admin.
- Contactul de urgență, ca dată de înscriere obligatorie.
- Capacitate și liste de așteptare.
- Lecții de probă.
- Transferuri între grupe și locații.
- Verificări de compatibilitate.
- Formarea de grupe noi.

## În afara scopului

- **Auto-înscrierea din portal.** Nu există flux prin care un părinte să-și pună singur copilul
  într-o grupă — vezi [Decizii luate](#decizii-luate), D2. Părintele își adaugă copiii
  (`POST /children` cere doar `AuthGuard`); repartizarea într-o grupă rămâne operațiune de admin.
- **Datele de sănătate, notele de incident și persoanele autorizate la preluare.** Ies complet din
  scop, explicit, ca să nu fie repropuse — vezi D4 în [Decizii luate](#decizii-luate). Singurul lucru
  păstrat din propunerea de siguranță a copilului e contactul de urgență din S2.
- Prețul înscrierii — vezi [E15](E15-pricing-facturare.md).
- Ce anume constituie „date de facturare" pentru o persoană fizică în fața SmartBill și a
  e-Facturii — vezi [E16](E16-plati-fiscal.md). Aici se scrie mecanismul, nu lista fiscală.
- Textul contractului de înscriere — se semnează pe hârtie, îl redactează un avocat. Platforma
  reține doar faptul că există, vezi [E07](E07-securitate-gdpr.md) S8.
- Funnel-ul public de achiziție — vezi [E20](E20-achizitie-lead.md). Aici e vorba de ce se întâmplă
  după ce cineva vrea un loc.

## Story-uri

### S1 · Entitatea de înscriere

`Enrollment`: copil, grupă, modul, dată de început, dată de sfârșit, stare (`probă`, `activă`,
`încheiată`, `abandonată`, `transferată`), motiv la ieșire. Înlocuiește legătura directă
`Child.group`, care rămâne cel mult ca proprietate derivată pentru compatibilitate.

Înscrierea o creează adminul, în toate stările. Nu există cale prin care un părinte autentificat să
scrie o `Enrollment` — vezi D2. Matricea din `apps/api/src/authorization.spec.ts` o va prinde
oricum: un handler nou fără `@Roles(Role.ADMIN)` apare acolo fără să scrie nimeni un test.

**Acceptanță:** "în ce grupă era copilul X pe 15 octombrie" are răspuns exact. Nu există istoric de
migrat — vezi [Decizii luate](#decizii-luate). Seed-ul produce înscrieri cu perioadă și stare, iar
interogarea de mai sus se verifică pe ele. Un `POST` de înscriere cu token de părinte răspunde 403.

### S2 · Contul de părinte: date complete, email confirmat, aprobat de admin

Astăzi `register` cere `username` și `password`, atât — `RegisterDto` are exact cele două câmpuri, cu
`@Length(1, 30)` și `@MinLength(6)`. Datele de contact se cer abia după autentificare, în ecranul
`/user/profile-setup` spre care împinge `apps/web/app/middleware/02.profile-setup.global.ts`, și
acolo sunt opționale: în `CreateProfileDto` doar `firstName` și `lastName` sunt obligatorii, iar
`email`, `phone` și `address` au `@EmptyToUndefined() @IsOptional()`. În entitate, `Profile.email`,
`Profile.phone` și `Profile.address` sunt toate `nullable`, iar `Profile.user` la fel.

Se schimbă trei lucruri, toate pe fluxul de înregistrare făcută de părinte:

1. **`register` cere datele complete.** Nume, prenume, email, telefon, adresă și contactul de
   urgență de mai jos intră în `RegisterDto`, obligatorii, și se scriu într-un `Profile` creat în
   aceeași tranzacție cu `User`-ul. Nu mai există fereastra dintre „cont creat" și „profil
   completat", deci nu mai există nici starea în care ecranul de setup e singurul lucru care ține
   datele. `address` e azi o singură coloană `varchar(255)`, text liber; dacă factura cere
   componente separate — stradă, oraș, județ, cod poștal — acolo se decide, în
   [E16](E16-plati-fiscal.md), nu aici.
2. **Emailul se confirmă printr-un link.** Adresa scrisă la înregistrare nu e adresa verificată. Se
   trimite un token cu expirare, iar contul rămâne neconfirmat până e deschis. Canalul de trimitere
   e cel din [E17](E17-comunicare-notificari.md) — fără el, story-ul nu se poate încheia, la fel ca
   S3. Confirmarea e ce transformă un câmp completat într-o adresă unde chiar ajunge o factură.
3. **Contul e inactiv până îl aprobă un admin.** `User` nu are azi nicio coloană de status, deci
   apare una, plus ecranul de aprobare. Un cont neaprobat se poate autentifica sau nu — decizia de
   implementare —, dar nu are copii înscriși și nu primește facturi. Aprobarea e a doua poartă,
   distinctă de confirmarea emailului: prima verifică adresa, a doua verifică familia.

**Fluxul în care adminul creează un profil fără date de contact rămâne neatins.** `Profile` fără
`user` și fără email e un flux intenționat al platformei, nu o scăpare: adminul introduce o familie
dintr-un telefon, iar `GET /users/without-profile`
(`apps/api/src/modules/user/user.controller.ts:25`, consumat de
`apps/web/app/composables/api/useUserApi.ts:13`) există tocmai pentru legarea ulterioară a contului.
Seed-ul îl exercită explicit — `apps/api/src/seed/seed.ts:179`, fiecare al treilea părinte e fără
cont. Ce se schimbă e **înregistrarea făcută de părinte**, nu crearea făcută de admin. Cele două
drumuri către un `Profile` rămân două, cu reguli diferite, fiindcă au surse de adevăr diferite:
într-unul datele le scrie familia, în celălalt le-a auzit cineva la telefon.

**Contactul de urgență** e un câmp în aceleași date de înscriere: nume, relația cu copilul, telefon.
E singurul lucru păstrat din propunerea de siguranță a copilului, fiindcă nu e informație medicală și
costă un câmp — cineva trebuie sunat dacă un copil pățește ceva la curs, iar numărul părintelui poate
suna în gol. Datele de sănătate, notele de incident și persoanele autorizate la preluare **nu** intră
odată cu el; sunt în [În afara scopului](#în-afara-scopului), explicit, ca să nu fie repropuse ca
„încă un câmp, tot acolo".

**Acceptanță:**

- `POST /auth/register` fără email, fără adresă sau fără contact de urgență răspunde 400, cu
  mesajul pe câmpul lipsă. Un `''` trimis de un input netastat e tot 400, nu 201 — deci pe câmpurile
  astea **nu** se pune `@EmptyToUndefined()`, spre deosebire de omoloagele lor din
  `CreateProfileDto`.
- După `register`, `Profile`-ul există deja, cu email, telefon, adresă și contact de urgență
  completate; nu mai e nevoie de trecerea prin `/user/profile-setup`.
- Contul e neconfirmat și neaprobat imediat după `register`. Deschiderea linkului îl trece în
  confirmat; aprobarea adminului îl trece în activ. Un copil nu poate fi înscris într-o grupă cât
  timp contul părintelui nu e activ.
- `POST /profiles` fără email, telefon și adresă, cu token de admin, răspunde în continuare 201 — și
  există un test care ține fluxul ăsta viu, ca să nu fie strâns din greșeală odată cu `register`.

### S3 · Capacitate și listă de așteptare

Capacitatea grupei există deja și e plafonată de sală — [E08](E08-multi-locatie.md) S3. Ce lipsește e
**aplicarea ei la înscriere**: depășirea se blochează, cu excepție explicită pentru admin, care lasă
urmă în audit log. O grupă plină acceptă înscrieri pe listă de așteptare, cu ordine și dată.

Pe listă ajung cererile adunate de admin — de la telefon, de la o probă, sau din
[E20](E20-achizitie-lead.md). Nu există formular prin care părintele să se pună singur pe listă;
vezi D2.

Când se eliberează un loc, primul de pe listă e notificat automat, prin
[E17](E17-comunicare-notificari.md), cu termen de răspuns. Fără canalul din E17 story-ul nu se poate
încheia — a doua jumătate a acceptanței e o notificare trimisă.

**Acceptanță:** înscrierea peste capacitate e refuzată cu mesaj util și ofertă de listă. Eliberarea
unui loc declanșează notificarea în sub un minut.

### S4 · Lecție de probă

O înscriere în starea `probă`, cu o singură ședință, care nu se facturează. La final, se transformă
în înscriere activă sau se închide, cu motiv înregistrat.

Rata de conversie de la probă la înscriere e una dintre cele mai importante cifre de business și
intră în [E21](E21-raportare-analytics.md).

Proba **nu** e momentul în care se cere adresa de email. Cu S2, familia are email confirmat înainte
să existe contul activ, deci înainte de orice probă — memento-ul de dinaintea probei are deja unde să
plece. Singurele familii fără adresă rămân cele introduse de admin la telefon, iar acolo lipsa se
completează înainte de prima factură, nu la trecerea probei în înscriere activă.

**Acceptanță:** o probă programată apare în lista profesorului, marcată distinct, și nu generează
factură.

### S5 · Transferuri

Mutarea unui copil în altă grupă, eventual în altă locație, închide înscrierea veche cu motivul
`transfer` și o deschide pe cea nouă, păstrând legătura. Efectul asupra facturii curente e calculat
și afișat înainte de confirmare.

**Acceptanță:** după transfer, istoricul arată ambele perioade, iar factura reflectă corect
schimbarea.

### S6 · Verificări de compatibilitate

La înscriere se verifică: vârsta față de intervalul grupei, cerințele prealabile ale modulului,
suprapunerea cu alte grupe ale aceluiași copil. Avertismente, nu blocaje — adminul poate trece peste,
motivat.

**Acceptanță:** înscrierea unui copil de 7 ani într-o grupă de 11-14 ani cere confirmare explicită.

### S7 · Formarea grupelor

Un ecran care arată cererile neasignate — de pe lista de așteptare și din
[E20](E20-achizitie-lead.md) — grupate pe vârstă, nivel și locație, ca să se vadă când s-au adunat
destui copii pentru o grupă nouă. Ține cont de disponibilitatea profesorilor din
[E09](E09-personal-roluri.md) și de sălile libere.

**Acceptanță:** răspunde la "am destui copii pentru o grupă nouă de Scratch la Titan?" fără muncă
manuală.

## Dependențe

[E08](E08-multi-locatie.md) pentru sală și capacitate, [E09](E09-personal-roluri.md) pentru profesor,
[E10](E10-curriculum-module.md) pentru modul.

**[E17](E17-comunicare-notificari.md) e necesar pentru S2 și S3.** La S2, linkul de confirmare a
emailului e un mesaj trimis; fără canal, contul nu poate fi confirmat, deci nici activat. La S3,
acceptanța cere ca eliberarea unui loc să declanșeze notificarea în sub un minut. Fără E17, S3 poate
livra cel mult lista de așteptare, nu și promisiunea făcută celui de pe ea — exact riscul de mai jos.
Același canal ține și mementoul de probă din [Decizii luate](#decizii-luate).

**[E16](E16-plati-fiscal.md) poate lărgi lista de câmpuri din S2**, dacă răspunsul contabilului e că
factura B2C cere mai mult decât nume, adresă și telefon. Lista minimă din S2 nu se blochează până
atunci — se adaugă un câmp, nu se rescrie fluxul.

## Riscuri

**Lista de așteptare creează o promisiune.** Dacă notificarea nu pleacă sau pleacă târziu, părintele
pierde locul și încrederea. Depinde direct de fiabilitatea din [E17](E17-comunicare-notificari.md).

**Două porți înainte de primul curs.** Confirmarea emailului și aprobarea adminului sunt, împreună,
două locuri în care o familie reală se poate opri: un link care ajunge în spam, un admin care nu
deschide ecranul de aprobare vineri seara. Ecranul de aprobare are nevoie de un semnal vizibil —
altfel D2 transformă o înscriere în tăcere.

## Definition of done

Fiecare participare a unui copil la o grupă are perioadă și stare. Capacitatea e respectată.
Transferurile păstrează istoricul. Nicio familie cu înscriere activă nu e fără email confirmat și
fără adresă.

## Decizii luate

**D1 · Contul de părinte are date complete de la înregistrare.** Emailul devine obligatoriu la
`register` și se confirmă printr-un link; la fel adresa poștală și restul datelor de facturare.
Motivul e practic, nu de igienă a datelor: azi `Profile.email` e `nullable` și `@IsOptional()`, iar
`register` cere doar username și parolă, deci o familie poate exista fără nicio adresă — iar
facturile și mementourile de restanță pleacă în gol, **tăcut**. Nimic nu semnalează că n-au fost
trimise, nici familiei, nici adminului. Regula atinge [E15](E15-pricing-facturare.md),
[E16](E16-plati-fiscal.md) și evidența de livrări din [E17](E17-comunicare-notificari.md).

Ce se schimbă e **înregistrarea făcută de părinte**. Fluxul în care un admin creează un `Profile`
fără date de contact rămâne exact cum e, fiindcă e drumul pe care intră majoritatea familiilor și
fiindcă `GET /users/without-profile` există tocmai pentru el.

**D2 · Fără auto-înscriere. Conturile se aprobă de un admin.** Nu există înscriere self-service din
portal, un cont nou de părinte e inactiv până când îl aprobă un admin, iar înscrierea unui copil
într-o grupă o face adminul. Motivul e că școala vrea să știe cine intră înainte să intre; efectul
secundar util e că nu apar grupe umplute de conturi de test și nici locuri blocate de cineva care
n-a vorbit niciodată cu școala.

Recomandarea de auto-înscriere cu confirmare, formulată aici ca întrebare deschisă, **cade**.

Consecința juridică e la fel de importantă: împreună cu D5 — contractul de înscriere se semnează
fizic —, D2 **elimină problema retragerii în 14 zile**. Nu mai există contract încheiat la distanță,
deci OUG 34/2014 nu se aplică, iar recomandările construite pe ea din [E15](E15-pricing-facturare.md)
și din [README](README.md) se scot. Se repune în discuție dacă apare vreodată înscriere sau plată
online fără contract pe hârtie — adică exact în ziua în care S2 ar căpăta un buton „plătește acum".

**D4 · Din propunerea de siguranță a copilului rămâne un singur câmp: contactul de urgență.**
Epicul dedicat se anulează. Contactul de urgență se păstrează fiindcă nu e dată de sănătate, costă un
câmp în datele de înscriere din S2 și răspunde la o întrebare care chiar apare — pe cine suni când
părintele nu răspunde. Datele de sănătate, notele de incident și persoanele autorizate la preluare
ies complet din scop, scrise explicit în [În afara scopului](#în-afara-scopului) tocmai ca să nu
reintre pe ușa din dos, câte un câmp o dată.

**Lecția de probă e gratuită.** Bariera minimă la intrare, cele mai multe programări.

Costul deciziei e neprezentarea: un loc blocat de cineva care nu mai vine. Două măsuri, care devin
obligatorii tocmai pentru că proba e gratuită:

- **Memento automat cu o zi înainte**, prin [E17](E17-comunicare-notificari.md). E singura măsură
  care reduce vizibil neprezentările când nu există miză financiară.
- **Plafon de probe simultane per grupă**, ca un curs să nu fie deraiat de patru copii noi
  deodată.

**Nu există date istorice de reconstruit** — vezi [E04](E04-migrari-date.md). S1 se simplifică:
`Enrollment` se construiește curat, fără aproximarea înscrierilor vechi din prezențe.

## Întrebări deschise

- Cât timp are cineva de pe lista de așteptare să confirme un loc eliberat?
- Un cont neconfirmat sau neaprobat se poate autentifica, sau primește 401 la login? Ambele variante
  respectă D2; diferă doar ce vede părintele — un portal gol cu un mesaj de așteptare, sau un ecran
  de login care refuză fără să explice de ce. Prima e mai onestă, a doua e mai puțin cod.
