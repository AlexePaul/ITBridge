# E11 · Înscrieri, grupe și capacitate

**Status:** **livrat** · **Pistă:** Operațiuni · **Depinde de:** E08, E09, E10 · **Blochează:** E12, E15

## Problemă

Înscrierea unui copil într-o grupă e astăzi o singură operație brută:
`POST /children/:childId/groups/:groupId`, rezervată adminului
(`apps/api/src/modules/child/child.controller.ts:59`, `@Roles(Role.ADMIN)`), care doar setează o
cheie străină.

Ce lipsește:

- ~~**Capacitate neaplicată.**~~ **Rezolvat de S3.** `Group.capacity` există din [E08](E08-multi-locatie.md) — coloană
  `int`, cu `CHK_groups_capacity_positive` în `apps/api/src/entities/group.entity.ts` și validată
  server-side să nu depășească sala (`GroupService.assertFitsInRoom`, cod `GROUP_OVER_ROOM_CAPACITY`).
  Dar **nimic nu o verifică la înscriere**: `ChildService.assignChildToGroup`
  (`apps/api/src/modules/child/child.service.ts:105`) setează cheia străină indiferent de câți copii
  sunt deja acolo. Numărul maxim e declarat și nerespectat, ceea ce e mai rău decât să lipsească —
  adminul îl citește ca pe o garanție.
- ~~**Istoric.**~~ **Rezolvat de S1.** `Child.group` e o singură referință. Când un copil se mută dintr-o grupă în alta,
  legătura veche se pierde. Nu poți răspunde la "în ce grupă era în octombrie?", ceea ce e exact
  informația de care ai nevoie când verifici o factură contestată.
- ~~**Perioadă.**~~ **Rezolvat de S1.** Nu există dată de început și de sfârșit ale participării. Un copil e în grupă sau
  nu, atemporal.
- ~~**Listă de așteptare.**~~ **Rezolvat de S3.** O grupă plină nu are unde ține cererile.
- **Lecție de probă.** Nu există noțiunea, deși e mecanismul principal prin care un copil devine
  elev.
- **Compatibilitate.** Nimic nu verifică dacă vârsta copilului se potrivește cu intervalul grupei
  sau dacă are cerințele prealabile ale modulului din [E10](E10-curriculum-module.md).
- ~~**Familia poate exista fără nicio dată de contact.**~~ **Rezolvat de S2.** Descrierea de mai jos
  e păstrată fiindcă explică de ce s-a construit ce s-a construit. `RegisterDto`
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

### S1 · Entitatea de înscriere — **LIVRAT**

> **Ce s-a construit.** `Enrollment`: copil, grupă, stare, perioadă, motiv la ieșire, plus data
> contractului semnat pe hârtie (D3). Fără coloană de modul — E10 a ieșit din scop, iar o coloană pe
> care nimic n-o scrie și nimic n-o citește se adaugă în ziua în care există un catalog.
>
> **Invariantul „o singură înscriere în vigoare" e index parțial, nu doar verificare în serviciu.**
> `UQ_enrollments_one_in_force` face imposibil ce `EnrollmentService` refuză politicos: serviciul
> verifică întâi ca refuzul să ajungă la client ca 409 cu motiv, dar doi admini care apasă în
> aceeași secundă nu sunt un caz pe care verificarea în aplicație îl poate acoperi. Un test de
> integrare încearcă inserarea prin SQL direct, ocolind serviciul, exact ca să dovedească asta.
>
> **`Child.group` rămâne, ca proprietate derivată** — exact ce permite story-ul. Șase interogări o
> citesc, două dintre ele relevante pentru securitate: filtrarea orarului pentru părinte și cine
> poate fi marcat prezent. Are un singur scriitor, `EnrollmentService`, care o scrie în aceeași
> tranzacție cu rândul care o justifică; un test de integrare verifică după fiecare operațiune că
> cele două spun același lucru. Rescrierea celor șase interogări în același PR care introduce
> entitatea ar fi înmulțit raza de explozie.
>
> `POST /children/:childId/groups/:groupId` și perechea ei de ștergere au rămas — sunt ce apelează
> deja ecranele — dar sunt acum o ușă subțire către `EnrollmentService`. Scoaterea din grupă
> **închide** înscrierea, nu o șterge: istoricul e tot rostul tabelului, iar un loc eliberat de un
> rând dispărut e un loc despre care nu știe nimeni.
>
> Migrarea creează câte o înscriere activă pentru fiecare copil care are deja o grupă. Fără ea,
> coloana derivată ar contrazice tabelul din prima dimineață. Istoric mai vechi nu se reconstruiește
> — D9.

`Enrollment`: copil, grupă, modul, dată de început, dată de sfârșit, stare (`probă`, `activă`,
`încheiată`, `abandonată`, `transferată`), motiv la ieșire. Înlocuiește legătura directă
`Child.group` (`apps/api/src/entities/child.entity.ts`, `ManyToOne` nullable către `Group`), care
rămâne cel mult ca proprietate derivată pentru compatibilitate.

**Un copil are cel mult o înscriere în vigoare la un moment dat** — D6. `Enrollment` adaugă timp și
istoric, nu simultaneitate: mai multe rânduri per copil înseamnă „a fost în grupa A până în martie,
în grupa B din aprilie", niciodată „e în amândouă acum". Regula se aplică la scriere, nu doar în
interfață, și numără și starea `probă`: un copil cu o probă programată nu poate primi a doua în altă
grupă. Fără verificarea asta, „o singură grupă" ar fi o convenție pe care primul admin grăbit o
încalcă fără să afle nimeni.

Înscrierea o creează adminul, în toate stările. Nu există cale prin care un părinte autentificat să
scrie o `Enrollment` — vezi D2. Matricea din `apps/api/src/authorization.spec.ts` o va prinde
oricum: un handler nou fără `@Roles(Role.ADMIN)` apare acolo fără să scrie nimeni un test.

**Acceptanță:** "în ce grupă era copilul X pe 15 octombrie" are răspuns exact. Nu există istoric de
migrat — vezi [Decizii luate](#decizii-luate), D9. Seed-ul produce înscrieri cu perioadă și stare, iar
interogarea de mai sus se verifică pe ele. Un `POST` de înscriere cu token de părinte răspunde 403.

### S2 · Contul de părinte: date complete, email confirmat, aprobat de admin — **LIVRAT**

> **Ce s-a construit.** `POST /auth/register` cere acum toate datele din D8 plus contactul de
> urgență și scrie `User` + `Profile` + tokenul de confirmare + două mesaje în outbox **într-o
> singură tranzacție**. Cele două porți sunt două coloane independente pe `User` —
> `emailConfirmedAt` și `approvalStatus` — iar „activ" e derivat din ele prin `isAccountActive`,
> nu stocat. Confirmarea trece prin `POST /auth/confirm-email` (public, tokenul e credențialul) și
> prin tabelul `email_confirmations`, care ține un SHA-256 al tokenului, niciodată tokenul, exact
> ca `sessions`. Adminul are `GET /users/pending`, `POST /users/:id/approve` și
> `POST /users/:id/reject`, plus ecranul `/admin/approvals`. Un copil nu poate fi repartizat într-o
> grupă cât timp contul familiei nu e activ — `PARENT_ACCOUNT_NOT_ACTIVE`, verificat în
> `ChildService.assignChildToGroup`.
>
> Migrarea `AccountGates` marchează drept confirmate și aprobate toate conturile care existau
> înainte. O poartă nouă aplicată retroactiv ar fi fost o schimbare de date deghizată în schimbare
> de schemă.
>
> **Ce nu s-a construit din acest story:** nimic. Ce a rămas din epic după S1, S2 și S3 e S4 (proba
> ca flux propriu, cu ședință și fără factură), S5 (transferuri), S6 (verificări de compatibilitate)
> și S7 (formarea grupelor).

> **Revizuire livrată: înregistrarea se împarte în doi pași.** Nu e o întoarcere la
> starea de dinainte de story, și distincția e tot ce contează aici.
>
> Ce a reparat S2 a fost un al doilea ecran **opțional**: `CreateProfileDto` cerea doar numele, iar
> emailul, telefonul și adresa erau `@IsOptional()`, deci o familie putea trăi la nesfârșit fără
> date de contact. Soluția aleasă atunci — mută tot în `register` — a rezolvat asta, dar a produs un
> formular de **zece câmpuri obligatorii** ca prim ecran, exact la momentul în care
> [E20](E20-achizitie-lead.md) cheltuiește un epic întreg coborând bariere. Un părinte care abandonează
> la câmpul opt nu e o familie cu date incomplete, e o familie pe care școala n-a văzut-o niciodată.
>
> Se împarte astfel: **`register` cere doar ce e nevoie ca să existe un cont** — nume, email,
> parolă —, iar restul se cere imediat după, pe `/user/profile-setup`, **la fel de obligatoriu ca
> azi**. Cele două lucruri care fac diferența față de starea de dinainte de S2:
>
> - **Al doilea pas nu se poate sări.** Middleware-ul îl impune, iar câmpurile de acolo rămân
>   obligatorii — inclusiv contactul de urgență, pe care ecranul de setup nu-l cere azi deloc. Aia e
>   și o inconsecvență vie: cele două uși către un `Profile` cer azi zece câmpuri și cinci.
> - **Condiția din middleware se schimbă din „n-are profil" în „profilul e incomplet".** Azi
>   `useProfileInitialization` ridică steagul doar când nu există niciun rând de `Profile`; cu
>   `register` scriind o coajă, aia n-ar mai fi niciodată adevărată și pasul doi n-ar porni nimănui.
>
> „Complet" se **derivă**, nu se stochează — aceeași regulă ca „activ" de mai sus, și din același
> motiv: o a treia coloană de stare ar fi liberă să contrazică rândul pe care îl descrie. Iar
> repartizarea unui copil cere de acum două lucruri, nu unul: contul activ (`PARENT_ACCOUNT_NOT_ACTIVE`)
> **și** profilul complet (`PARENT_PROFILE_INCOMPLETE`), fiindcă o școală nu ia un copil în sală fără
> un contact de urgență. Sunt două refuzuri diferite fiindcă se repară în două locuri diferite: unul
> așteaptă un admin, celălalt așteaptă părintele.
>
> Unicitatea se mută odată cu câmpurile: `assertContactDetailsAreFree` verifică azi emailul **și**
> telefonul la înregistrare; telefonul se verifică de acum la pasul doi, unde e tastat. E aceeași
> formă ca profilul-coajă scris de programarea la probă în [E20](E20-achizitie-lead.md) S2, care nu
> scrie nici email, nici telefon tocmai fiindcă acele coloane sunt unice.
>
> **Ce rămâne neatins:** cele două porți, `isAccountActive`, migrarea `AccountGates` și drumul
> adminului care introduce o familie de la telefon. Completarea profilului nu e o a treia poartă —
> e aceeași cerință de date pe care S2 a impus-o, cerută în două ecrane în loc de unul.

Până la acest story `register` cerea `username` și `password`, atât — `RegisterDto` avea exact cele
două câmpuri, cu `@Length(1, 30)` și `@MinLength(6)`. Datele de contact se cereau abia după
autentificare, în ecranul
`/user/profile-setup` spre care împinge `apps/web/app/middleware/02.profile-setup.global.ts`, și
acolo erau opționale: în `CreateProfileDto` doar `firstName` și `lastName` sunt obligatorii, iar
`email`, `phone` și `address` au `@EmptyToUndefined() @IsOptional()`. În entitate, `Profile.email`,
`Profile.phone` și `Profile.address` rămân `nullable`, iar `Profile.user` la fel — pentru celălalt
drum, cel al adminului.

S-au schimbat trei lucruri, toate pe fluxul de înregistrare făcută de părinte:

1. **`register` cere datele complete.** Nume, prenume, email, telefon, adresă și contactul de
   urgență de mai jos intră în `RegisterDto`, obligatorii, și se scriu într-un `Profile` creat în
   aceeași tranzacție cu `User`-ul. `RegisterDto` are azi exact `username` și `password`
   (`apps/api/src/modules/auth/dto/register.dto.ts`), deci toate câmpurile de mai sus sunt câmpuri
   noi. Nu mai există fereastra dintre „cont creat" și „profil completat", deci nu mai există nici
   starea în care ecranul de setup e singurul lucru care ține datele.

   **Lista e închisă și nu conține CNP** — vezi D8. Pentru factură, SmartBill cere numele și
   adresa; telefonul și emailul se cer fiindcă fără ele nu poți opera școala, nu fiindcă le-ar cere
   fiscul. `address` rămâne o singură coloană `varchar(255)`, text liber; dacă documentul cere
   componente separate — stradă, oraș, județ, cod poștal — asta e o schimbare de formă a aceluiași
   câmp și se decide în [E16](E16-plati-fiscal.md), nu o lărgire a listei.

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

**Acceptanță** — toate verificate în `apps/api/test/account-gates.e2e-spec.ts`:

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

### S3 · Capacitate și listă de așteptare — **LIVRAT**

> **Ce s-a construit.** Capacitatea se aplică la înscriere, și numărul care contează e
> **înscrierile în vigoare — active plus probe programate**, niciodată doar primele. Un test de
> integrare pune o grupă de două locuri cu un copil înscris și o probă și verifică refuzul, fiindcă
> ăsta e cazul care se pierde cel mai ușor.
>
> Excepția pentru admin există, cere un câmp explicit (`allowOverCapacity`) și **lasă un rând în
> jurnalul de audit**, pe grupa a cărei capacitate a fost depășită: „cine a pus al unsprezecelea
> copil în grupa 5, și când" se întreabă despre sală, nu despre o înscriere, iar răspunsul e un
> `GET /audit?entityType=Group&entityId=5`. `changes` poartă ocuparea care s-a mișcat, nota —
> capacitatea peste care a trecut, fiindcă un număr fără plafonul lângă el nu spune nimic. Rândul se
> scrie **în tranzacția înscrierii**, deci o urmă nu poate supraviețui unui loc care s-a dat înapoi.
>
> De aici a venit și schimbarea de semnătură pe care story-ul o amâna: `enrol` și `transfer` primesc
> acum un `Actor` — id **plus** numele copiat la scriere, fiindcă jurnalul nu are relație către
> `users` și o urmă care arată spre un cont șters pierde exact partea pe care o citește cineva —, iar
> `null` rămâne formularul public de probă, care n-are niciun cont în spate. Acela nu poate ajunge la
> excepție, fiindcă nimic public nu trimite `allowOverCapacity`; dacă vreodată va putea, nota o va
> spune. `warn`-ul din log rămâne și el: îl citește cine se uită la un deploy, rândul îl citește cine
> întreabă în martie.
>
> Lista de așteptare: `WaitlistEntry`, ordonată după momentul cererii, cu index parțial care
> împiedică o a doua cerere deschisă pentru același copil și aceeași grupă. Închiderea unei
> înscrieri oferă locul primului de pe listă **în aceeași tranzacție** și îi scrie emailul în outbox
> — o ofertă care supraviețuiește căderii procesului între cele două scrieri e singura variantă de
> „sub un minut" care ține. Un refuz sau o retragere a unei oferte trece locul mai departe imediat.
>
> **Termenul de răspuns e 48 de ore**, ca ipoteză de lucru, nu ca decizie a școlii — vezi
> [Întrebări deschise](#întrebări-deschise). E constantă în cod, nu setare, ca să fie o modificare
> despre care se discută.
>
> **Ofertele expirate se mătură acum**, prin `EnrollmentService.expireLapsedOffers`, chemat din
> oră în oră de `waitlist-expiry.job.ts`. Lipsa lui nu era o rafinare amânată, era un defect care nu
> se vedea de pe niciun ecran: `offerFreedSeat` se uită **numai** la cererile `WAITING`, deci o
> ofertă la care nu răspundea nimeni rămânea `OFFERED` la capul cozii și ținea scaunul la nesfârșit
> — grupa apărea plină, iar familia următoare nu era întrebată niciodată. Se repara doar din
> întâmplare: când se mai elibera un loc în aceeași grupă, sau când un admin scotea cererea de mână.
>
> Trei alegeri în măturare:
>
> - **Familia căreia i-a expirat oferta primește un mesaj.** Ultimul lucru pe care i l-a spus școala
>   a fost „ai un loc, confirmă până joi", iar asta a încetat să fie adevărat — aceeași socoteală
>   pentru care o oră reactivată are mesaj propriu la E12/S5. Nu ceartă pe nimeni și nu închide ușa:
>   cine era primul pe listă acum o oră e exact cine merită invitat să ceară din nou.
> - **O tranzacție per cerere**, nu una pe toată măturarea. Două locuri în două grupe sunt două
>   treburi fără legătură, iar o eroare la a doua n-are voie să anuleze ce i s-a spus deja primei
>   familii. Ce chiar merge împreună — expirarea și oferta către următorul — stă în aceeași
>   tranzacție.
> - **Din oră în oră, nu din minut în minut.** Fereastra e de 48 de ore; o ofertă care expiră la
>   14:03 și e măturată la 15:00 costă familia următoare cincizeci și șapte de minute dintr-un
>   termen de două zile.
>
> Ca toate job-urile de aici, nu se declanșează până nu rulează ceva (E01/S4) — dar e scris și
> testat, ceea ce e tot ce-l deosebește de un defect încă deschis.

Capacitatea grupei există deja și e plafonată de sală — [E08](E08-multi-locatie.md) S3. Ce lipsește e
**aplicarea ei la înscriere**: depășirea se blochează, cu excepție explicită pentru admin, care lasă
urmă în audit log. O grupă plină acceptă înscrieri pe listă de așteptare, cu ordine și dată.

**Regula de ocupare numără și probele.** O `Enrollment` în starea `probă` consumă un loc cât ține
proba, exact ca una activă — vezi D7. Deci o grupă de 10 cu 10 copii înscriși nu poate primi un copil
la probă, iar una cu 9 înscriși și o probă programată e plină. Motivul e fizic și nu se negociază: un
copil la probă stă pe un scaun, la un calculator, în aceeași sală. Numărul care contează la orice
verificare de capacitate e **înscrierile active plus probele programate care nu s-au consumat încă**,
niciodată doar primele.

Locul ținut de o probă se eliberează când proba se încheie — devine înscriere activă, caz în care
locul rămâne ocupat de aceeași familie, sau se închide cu motiv (S4), caz în care se eliberează și
declanșează notificarea către primul de pe lista de așteptare. O probă care nu se încheie niciodată
ține un loc la nesfârșit; de aceea lista „probe ținute, fără decizie" din
[E20](E20-achizitie-lead.md) S3 nu e doar o unealtă comercială, ci și mecanismul care ține
capacitatea onestă.

Pe listă ajung cererile adunate de admin — de la telefon, de la o probă, sau din
[E20](E20-achizitie-lead.md). Nu există formular prin care părintele să se pună singur pe listă;
vezi D2.

Când se eliberează un loc, primul de pe listă e notificat automat, prin
[E17](E17-comunicare-notificari.md), cu termen de răspuns. Fără canalul din E17 story-ul nu se poate
încheia — a doua jumătate a acceptanței e o notificare trimisă.

**Acceptanță:** înscrierea peste capacitate e refuzată cu mesaj util și ofertă de listă. Eliberarea
unui loc declanșează notificarea în sub un minut. O grupă de 10 cu 9 înscriși și o probă programată
refuză a doua probă, cu același mesaj ca la o înscriere peste capacitate — nu cu unul separat, fiindcă
nu e o limită separată.

### S4 · Lecție de probă — **LIVRAT**

> **Ce s-a construit.** Starea `TRIAL` exista din S1; ce lipsea era ce se întâmplă în jurul ei.
> Proba apare în catalogul grupei cu insignă distinctă, `PUT /enrollments/:id/resolve-trial` o
> transformă în înscriere sau o închide cu motiv, iar `GET /enrollments/trials/unresolved` e lista
> pe care o cere D5 — o probă pe care n-o închide nimeni ține un loc la nesfârșit.
>
> Confirmarea **păstrează același rând**, nu deschide altul: istoricul citește o perioadă continuă,
> nu două lipite, iar locul rămâne al aceleiași familii fără să treacă prin coadă.
>
> **Și facturarea s-a schimbat, fiindcă altfel proba nu era gratuită.** `calculateAmount` număra
> toți copiii din familie; acum numără doar înscrierile `ACTIVE`. Consecința e mai largă decât
> proba: **un copil care nu e în nicio grupă nu se mai facturează**, ceea ce era greșit dinainte să
> existe probele — prețul e pe copil care vine, iar familia unui copil nerepartizat plătea pentru
> el. Dacă școala vrea totuși să factureze o familie al cărei copil e între grupe o lună, aia e o
> decizie de preț și e a [E15](E15-pricing-facturare.md), nu o numărare tăcută de rânduri.

O înscriere în starea `probă`, cu o singură ședință, care nu se facturează. La final, se transformă
în înscriere activă sau se închide, cu motiv înregistrat.

**Gratuită nu înseamnă fără cost.** Proba ocupă un loc din cele ale sălii, ca orice înscriere — D7 —,
deci o grupă plină nu o poate primi, iar formularul public din [E20](E20-achizitie-lead.md) S2 nu are
voie să o ofere. Consecința pentru fluxul comercial e că oferta de probe e limitată de aceleași
scaune care limitează înscrierile: dacă toate grupele de o vârstă sunt pline, singurul lucru pe care
îl mai poate face pâlnia e lista de așteptare, nu încă o probă.

Rata de conversie de la probă la înscriere e una dintre cele mai importante cifre de business și
intră în [E21](E21-raportare-analytics.md).

Proba **nu** e momentul în care se cere adresa de email. Cu S2, familia are email confirmat înainte
să existe contul activ, deci înainte de orice probă — memento-ul de dinaintea probei are deja unde să
plece. Singurele familii fără adresă rămân cele introduse de admin la telefon, iar acolo lipsa se
completează înainte de prima factură, nu la trecerea probei în înscriere activă.

**Acceptanță:** o probă programată apare în lista de prezență a grupei, marcată distinct, și nu
generează factură. Numărul de locuri afișat pentru acea grupă scade cu unu în clipa programării.

### S5 · Transferuri — **LIVRAT**

> **Ce s-a construit.** `POST /enrollments/transfer`: închide vechea înscriere ca `TRANSFERRED` și
> o deschide pe cea nouă, într-o singură tranzacție. Starea trece mai departe — o probă care se mută
> rămâne probă, fiindcă altfel am înscrie o familie care încă nu s-a hotărât — și data contractului
> la fel, fiindcă e aceeași înscriere care continuă.
>
> **Locul eliberat se oferă cozii grupei vechi** — corectat la revizuirea din 25 septembrie 2026.
> Regula de aici spunea invers: „nu e liber, se dă acestui copil". Nu e adevărat despre niciun
> scaun: copilul stă acum în _cealaltă_ grupă, iar ecranul grupei vechi arăta `free: 1` lângă o
> listă pe care n-o anunța nimeni. Transferul ține acum ambele grupe, cea cu id-ul mai mic prima, și
> întreabă coada grupei vechi în aceeași tranzacție. Și decontează cererea pe care copilul o avea
> pentru grupa nouă: lăsată deschisă, o ofertă expira după două zile și îi scria unei familii care
> stătea deja în sală că locul ei a plecat la următoarea.
>
> **Efectul asupra facturii curente nu se afișează, fiindcă nu există.** Prețul e lunar și pe
> familie, nu pe grupă (vezi `pricing.ts`), deci un transfer între grupe nu schimbă suma cu nimic. În
> ziua în care [E15](E15-pricing-facturare.md) aduce prețul pe modul, aici e locul unde apare
> calculul.

Mutarea unui copil în altă grupă, eventual în altă locație, închide înscrierea veche cu motivul
`transfer` și o deschide pe cea nouă, păstrând legătura. Efectul asupra facturii curente e calculat
și afișat înainte de confirmare.

Transferul e **singurul** mod în care un copil își schimbă grupa, tocmai fiindcă D6 interzice a doua
înscriere în vigoare. Deci ordinea contează: se închide prima, se deschide a doua, într-o singură
tranzacție. Altfel fie apar două înscrise simultan, fie copilul rămâne fără niciuna dacă a doua
scriere pică — iar la capacitate, locul eliberat în grupa veche trebuie să se elibereze exact atunci,
nu mai devreme, ca să nu-l ia cineva de pe lista de așteptare într-un transfer care nu s-a încheiat.

**Acceptanță:** după transfer, istoricul arată ambele perioade, iar factura reflectă corect
schimbarea.

### S6 · Verificări de compatibilitate — **LIVRAT PARȚIAL**

> **Ce s-a construit.** Verificarea de vârstă față de `minAge` / `maxAge`, ca **avertisment care
> cere confirmare**: prima cerere e refuzată cu 409 `COMPATIBILITY_WARNINGS` și cu vârstele în
> mesaj, a doua, cu `acknowledgeWarnings: true`, trece. Două pași, nu o linie de log — „avertisment"
> trebuie să însemne ceva, iar un mesaj pe care nu-l citește nimeni e la fel cu nicio verificare.
>
> Confirmarea avertismentelor **nu** e o cale de acces peste capacitate: aia se verifică prima și
> refuză oricum. Un copil de zece ani și jumătate matur pentru 11-14 e o judecată de om; al
> unsprezecelea scaun într-o sală de zece nu e.
>
> **Ce lipsește: cerințele prealabile de modul.** E10 e în afara scopului, deci nu există catalog
> care să aibă cerințe. Se adaugă la aceeași listă în ziua în care există unul — forma e pregătită.
>
> **Acceptat de școală ca stare finală pentru MVP.** Verificarea de vârstă ca avertisment e tot ce
> trebuie cât timp nu există catalog: singura verificare tare de care depinde ceva — capacitatea —
> e la S3 și e tare. Story-ul nu mai e „parțial fiindcă e neterminat", ci „parțial fiindcă a doua
> jumătate aparține unui epic scos din MVP".

La înscriere se verifică vârsta față de intervalul grupei (`minAge` / `maxAge`, azi `int` pe
`Group`) și cerințele prealabile ale modulului din [E10](E10-curriculum-module.md). Avertismente, nu
blocaje — adminul poate trece peste, motivat.

**Suprapunerea de orar cu altă grupă a aceluiași copil a ieșit din listă.** Nu mai e un caz de
verificat, fiindcă nu mai e un caz posibil: D6 spune că un copil are o singură înscriere în vigoare,
iar regula e aplicată la S1. Ce rămâne blocaj tare, nu avertisment, e tot acolo — capacitatea, la S3.
Aici sunt doar lucrurile despre care un admin poate avea dreptate împotriva sistemului: un copil de
10 ani și jumătate matur pentru o grupă de 11-14 e o judecată de om, un al unsprezecelea scaun într-o
sală de zece nu e.

**Acceptanță:** înscrierea unui copil de 7 ani într-o grupă de 11-14 ani cere confirmare explicită.
Înscrierea lui într-o a doua grupă e refuzată, nu confirmabilă.

### S7 · Formarea grupelor — **LIVRAT PARȚIAL**

> **Ce s-a construit.** `/admin/formare`: copiii pe care nu i-a repartizat nimeni, grupați pe bandă
> de vârstă și pe locația cerută, cu cel mai mare grup primul. Cererea înseamnă listele de așteptare
> **plus** copiii fără nicio grupă — a doua jumătate contează, fiindcă un copil înregistrat și
> nerepartizat e cerere pe care n-a scris-o nimeni nicăieri. Pe același ecran stau și probele fără
> decizie, cu butoanele care le închid.
>
> **Ce lipsește: disponibilitatea profesorilor.** E [E09](E09-personal-roluri.md), și nu există rol
> `TEACHER`, deci nu există disponibilitate de citit. Sălile libere se văd pe `/admin/locations` și
> nu se dublează aici.

Un ecran care arată cererile neasignate — de pe lista de așteptare și din
[E20](E20-achizitie-lead.md) — grupate pe vârstă, nivel și locație, ca să se vadă când s-au adunat
destui copii pentru o grupă nouă. Ține cont de disponibilitatea profesorilor din
[E09](E09-personal-roluri.md) și de sălile libere.

**Acceptanță:** răspunde la "am destui copii pentru o grupă nouă de Scratch la Titan?" fără muncă
manuală.

### S8 · Parola uitată și parola schimbată — **LIVRAT**

Story-ul ăsta n-a existat în plan, și lipsa lui era chiar defectul: S2 a construit cele două porți
prin care un cont devine folosibil și n-a construit niciodată drumul înapoi pentru cine își uită
parola. Singura cale era biroul, la telefon, în program — pentru o platformă la care familiile intră
seara.

> **Ce s-a construit.** Trei rute: `POST /auth/forgot-password` și `POST /auth/reset-password`,
> amândouă publice fiindcă premisa e un părinte care **nu** se poate autentifica, iar o poartă ar fi
> un cerc; și `POST /auth/change-password`, după autentificare, care cere totuși parola actuală —
> `AuthGuard` onorează un token un sfert de oră fără să atingă `sessions`, deci un tab uitat deschis
> pe un calculator împărțit ajunge până acolo. În frontend: `/auth/forgot-password`,
> `/auth/reset-password`, linkul de sub butonul de autentificare și formularul din profilul de
> portal.
>
> Tabela `password_resets` e a treia din familia `sessions` / `email_confirmations` și se poartă la
> fel: **tokenul nu se stochează niciodată**, doar un SHA-256. Ce diferă față de linkul de
> confirmare — o oră în loc de patruzeci și opt, a doua cerere o omoară pe prima, niciun răspuns nu
> spune dacă adresa are cont, adresa e înghețată la emitere și recitită la folosire, porțile contului
> nu se consultă, iar toate sesiunile se revocă — e scris cu motivele în [CLAUDE.md](../../CLAUDE.md),
> lângă regulile porților din S2. Aici nu se repetă: o a doua copie a unei reguli e copia care
> divergează.
>
> **Ce n-are**: nicio întrebare de securitate, niciun cod pe SMS, nicio politică de complexitate
> peste lungimea minimă pe care o cere deja înregistrarea. Prima e o parolă mai slabă cu alt nume, a
> doua cere un al doilea furnizor, iar a treia mută costul pe familie fără să mute riscul.

**Acceptanță:** un părinte încuiat afară intră la loc în cont fără să sune la școală, iar linkul pe
care l-a folosit nu mai deschide nimic după aceea.

### Revizuirea din 25 septembrie 2026: locurile oferite listei

O revizuire a contabilității locurilor a pus o singură întrebare: pe ce drum ajunge o familie să
creadă că are un loc pe care nu-l are, sau să nu afle de unul pe care îl are? A găsit unsprezece
defecte, toate reproduse pe o bază reală. Cele despre listă sunt reparate aici, fiecare cu testul lui
care pică pe codul dinainte; orarul și probele au secțiunile lor, mai jos și în E12.

- **Un loc oferit nu era ținut.** Toate numărătorile scădeau înscrierile în vigoare și atât, deci cele
  48 de ore ale ofertei locul părea liber: formularul public îl vindea ca probă, un admin înscria alt
  copil în el, iar familia care spunea da găsea `GROUP_FULL`. Acum `occupancyOf` întoarce `held`, iar
  `free`, capacitatea și locurile pe ședință scad ofertele fără răspuns — mai puțin oferta copilului
  care se înscrie, care e chiar scaunul lui. Ecranul grupei spune câte locuri sunt oferite.
- **Același loc se oferea de două ori.** Două „închide" apăsate deodată citeau amândouă înscrierea în
  vigoare și eliberau amândouă locul; măturarea ofertelor expirate suprascria ca „expirat" un „nu"
  dat între timp. Scrierile sunt acum condiționate de starea citită, sub lacătul grupei, și nu fac
  nimic mai departe când n-au mișcat nimic.
- **Locuri eliberate pe care nu le oferea nimeni**: la transfer, la ștergerea unui copil, la
  ștergerea unei familii, la mărirea capacității. Iar o eliberare oferea un singur loc, oricâte erau
  libere. Acum fiecare ușă întreabă lista, iar lista primește câte un loc pentru fiecare scaun liber.
- **O grupă inactivă nu mai primește oferte** — acceptarea ar fi dat de `GROUP_INACTIVE` —, iar o
  familie fără adresă lasă un rând `undeliverable` în coadă, nu o linie de log.
- **`updateGroup` nu mai salvează lista de copii** a grupei: `save` pe o grupă încărcată cu ei rescria
  `children.group_id` după listă, deci o înscriere venită între citire și scriere rămânea fără grupă.
- **Ruta care scoate o cerere de pe listă primește doar `DECLINED`, `EXPIRED` sau `CANCELLED`.** Un
  `OFFERED` trimis de mână făcea o ofertă fără termen, pe care măturarea n-o expira niciodată.

### Revizuirea din 25 septembrie 2026: locurile unei ore și probele

Tot din aceeași revizuire, defectele despre o oră anume și despre probe — fiecare reprodus pe o bază
reală și reparat cu testul lui, care pică pe codul dinainte. Orarul are secțiunea lui în
[E12](E12-prezenta-orar.md), iar pâlnia în [E20](E20-achizitie-lead.md).

- **O oră mutată într-o sală mai mică număra locurile grupei.** O grupă de zece mutată într-o sală de
  doi era vândută pe `/proba` ca având opt locuri. Acum o oră are cel mai mic dintre locurile grupei
  și ale sălii în care e, iar mutarea sau recuperarea într-o sală în care nu încap copiii care vin e
  refuzată (`ROOM_TOO_SMALL`). Sala nu mai poate scădea sub o grupă care se ține în ea
  (`ROOM_SMALLER_THAN_GROUP`) — verificarea exista doar la crearea și mutarea grupei.
- **O înscriere nouă nu întreba de ore.** Al zecelea copil din zece intra în grupă cât joia avea un
  copil mutat acolo pe o săptămână: unsprezece în sală. `enrol` și `transfer` caută acum ora cea mai
  strâmtă de la începutul înscrierii încolo, iar refuzul o numește — grupa, singură, arată un loc
  liber. Peste refuz, adminul poate trece tot cu `allowOverCapacity`, iar jurnalul spune ce oră a
  supraumplut. Copilul care se înscrie nu se numără printre vizitatorii orelor în care intră — mutat
  deja acolo pe o săptămână, stă tot pe un singur scaun. Și, fiindcă o probă stă și ea în orele de
  după ea până e decisă, `/proba` oferă o oră doar cât ea și cele de după ea mai au loc (E20).
  **Ofertele către listă rămân numărate pe grupă**, dinadins: înscrierea familiei care a spus da o
  face biroul, deci dacă un vizitator umple ora din săptămâna aia, refuzul numește ora, iar biroul
  trece peste el sau mută vizitatorul. Mai puține oferte ar fi lăsat restul locurilor neoferite după
  ce trece săptămâna, fiindcă nimic nu le mai oferă singur.
- **Programarea și mutarea pe o săptămână numărau pe o fotografie.** Ora și grupa se citeau înaintea
  lacătului, deci o anulare sau o mutare venită între timp nu se vedea. Acum se recitesc după el, cu
  rândul orei blocat `FOR SHARE`: o anulare nu ia lacătul grupei, iar una încă în zbor s-ar fi comis
  după citire, cu plasarea făcută într-o oră care nu se mai ține.
- **O probă transferată își pierdea lead-ul, iar una închisă prin `close` îl lăsa deschis.** Detaliile
  sunt în E20; pe partea asta, `transfer` mută lead-ul pe înscrierea nouă, iar `close` îl trece pe
  pierdut.
- **`close` primea o zi din viitor** și elibera locul pe loc: copilul ieșea din catalog, iar scaunul i
  se oferea listei cât încă stătea pe el. Acum refuză (`ENROLLMENT_END_IN_FUTURE`) — închiderea se
  face în ziua în care pleacă copilul.
- **O probă decisă ajungea pe factură**, fiindcă facturarea o ținea afară după status. Acum fiecare
  ieșire din `TRIAL` — `resolveTrial` în ambele sensuri, `close`, `transfer` — scrie pe rând ziua
  deciziei, `trialUntil`, iar facturarea nu numără nimic până la ea inclusiv (detaliile în
  [E15](E15-pricing-facturare.md)). `close` și `transfer` scriu rândul de probă și cel activ separat,
  fiecare doar cât rândul mai e în starea aceea, deci și „a fost probă?" se hotărăște sub lacăt, nu
  după citirea de dinainte: o probă acceptată între timp se transferă ca înscriere activă, fără ca
  lead-ul ei să mai fie mutat.
- **Lista „cine era în grupă la data X" număra și ziua în care copilul a plecat**, deși registrul nu
  îl mai lista de dimineață. Acum ziua de final e plecată și pentru `membersOn`.

## Dependențe

[E08](E08-multi-locatie.md) pentru sală și capacitate, [E09](E09-personal-roluri.md) pentru profesor,
[E10](E10-curriculum-module.md) pentru modul.

**E10 a ieșit din MVP, și asta nu oprește E11.** Singurul loc în care E11 îl folosește sunt
cerințele prealabile ale modulului din S6, iar acolo verificarea e un avertisment, nu un blocaj:
S6 se livrează pe vârstă și pe capacitate, iar cerințele prealabile se adaugă la aceeași verificare
în ziua în care există module. Restul epicului nu atinge catalogul deloc.

**[E17](E17-comunicare-notificari.md) e necesar pentru S2 și S3.** La S2, linkul de confirmare a
emailului e un mesaj trimis; fără canal, contul nu poate fi confirmat, deci nici activat. La S3,
acceptanța cere ca eliberarea unui loc să declanșeze notificarea în sub un minut. Fără E17, S3 poate
livra cel mult lista de așteptare, nu și promisiunea făcută celui de pe ea — exact riscul de mai jos.
Același canal ține și mementoul de probă din [Decizii luate](#decizii-luate), D5.

**[E16](E16-plati-fiscal.md) nu mai lărgește lista de câmpuri din S2.** Era scris aici ca dependență
deschisă, în ipoteza că factura B2C ar putea cere mai mult decât nume, adresă și telefon — în
special CNP. Răspunsul a venit și e „nu": SmartBill cere numele și adresa, atât (D8). Deci S2 poate
fi construit cu lista lui, iar E16 nu mai e o necunoscută care atârnă deasupra formularului de
înregistrare.

## Riscuri

**Lista de așteptare creează o promisiune.** Dacă notificarea nu pleacă sau pleacă târziu, părintele
pierde locul și încrederea. Depinde direct de fiabilitatea din [E17](E17-comunicare-notificari.md).

**Două porți înainte de primul curs.** Confirmarea emailului și aprobarea adminului sunt, împreună,
două locuri în care o familie reală se poate opri: un link care ajunge în spam, un admin care nu
deschide ecranul de aprobare vineri seara. Ecranul de aprobare are nevoie de un semnal vizibil —
altfel D2 transformă o înscriere în tăcere.

## Definition of done

Fiecare participare a unui copil la o grupă are perioadă și stare, și nu există două în vigoare
deodată. Capacitatea sălii e respectată de toată lumea, inclusiv de probe. Transferurile păstrează
istoricul. Nicio familie cu înscriere activă nu e fără email confirmat și fără adresă.

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

Consecința juridică e la fel de importantă: împreună cu D3 — contractul de înscriere se semnează
fizic —, D2 **elimină problema retragerii în 14 zile**. Nu mai există contract încheiat la distanță,
deci OUG 34/2014 nu se aplică, iar recomandările construite pe ea din [E15](E15-pricing-facturare.md)
și din [README](README.md) se scot. Se repune în discuție dacă apare vreodată înscriere sau plată
online fără contract pe hârtie — adică exact în ziua în care S2 ar căpăta un buton „plătește acum".

**D3 · Contractul de înscriere se semnează pe hârtie.** Platforma nu ține textul, nu îl versionează
și nu capturează acceptare digitală. Reține un singur lucru: că pentru o înscriere **există contract
semnat**, cu data semnării — câteva câmpuri pe `Enrollment` din S1, nu un subsistem de documente.
Regula e a lui [E07](E07-securitate-gdpr.md) S8 și e consemnată aici fiindcă înscrierea e locul unde
se vede, iar D2 se sprijină pe ea.

Motivul e că nu mai e nimic de capturat online. Prin D2, contul de părinte îl aprobă un admin și
copilul e înscris în grupă tot de un admin, deci e mereu cineva în cameră când se semnează, iar
hârtia se obține la fel de ușor ca o bifă. Ținută în platformă, acceptarea ar fi cerut versionarea
textului, un ecran de acceptare, dovada acceptării și, la prima modificare, întrebarea ce se
întâmplă cu familiile care au semnat versiunea veche — muncă al cărei rezultat îl dă deja dosarul.

**D4 · Din propunerea de siguranță a copilului rămâne un singur câmp: contactul de urgență.**
Epicul dedicat se anulează. Contactul de urgență se păstrează fiindcă nu e dată de sănătate, costă un
câmp în datele de înscriere din S2 și răspunde la o întrebare care chiar apare — pe cine suni când
părintele nu răspunde. Datele de sănătate, notele de incident și persoanele autorizate la preluare
ies complet din scop, scrise explicit în [În afara scopului](#în-afara-scopului) tocmai ca să nu
reintre pe ușa din dos, câte un câmp o dată.

**D5 · Lecția de probă e gratuită.** Bariera minimă la intrare, cele mai multe programări.

Costul deciziei e neprezentarea: un loc blocat de cineva care nu mai vine. Două măsuri, care devin
obligatorii tocmai pentru că proba e gratuită:

- **Memento automat cu o zi înainte**, prin [E17](E17-comunicare-notificari.md). E singura măsură
  care reduce vizibil neprezentările când nu există miză financiară.
- **Locul ținut de probă se eliberează repede.** Un plafon separat de probe simultane per grupă a
  fost propus aici și **cade**: proba consumă un loc obișnuit (D7), deci grupa e deja plafonată de
  sală, iar un al doilea prag ar fi două numere care spun același lucru și pot să nu fie de acord.
  Ce rămâne de apărat e altceva — un loc blocat de o probă la care nimeni nu s-a prezentat și pe
  care nimeni nu a închis-o. Măsura e închiderea probei cu motiv, ținută vizibilă de lista „probe
  ținute, fără decizie" din [E20](E20-achizitie-lead.md) S3.

**D6 · Un copil e într-o singură grupă.** Nu există participare la două grupe în paralel, nici la
aceeași locație, nici la două. Motivul e al școlii și e despre copil, nu despre software: două
drumuri pe săptămână sunt prea mult la vârsta asta. Vor exista părinți care cer altceva; răspunsul e
nu, iar platforma nu ține un câmp care să pretindă contrariul.

Modelul actual e deja așa — `Child.group` e o singură referință `ManyToOne`, nullable pentru copiii
nerepartizați. Decizia nu schimbă nimic tehnic azi; schimbă ce are voie să facă S1, care altfel ar fi
transformat firesc relația în una la mai multe. `Enrollment` rămâne o listă de rânduri per copil,
fiindcă istoricul e motivul pentru care există, dar cu invariantul „cel mult unul în vigoare",
aplicat la scriere. Închide și întrebarea deschisă din [E08](E08-multi-locatie.md) — un copil nu
poate fi în grupe din locații diferite, fiindcă nu poate fi în două grupe.

Se reia doar dacă apare un format explicit de „a doua ședință", cu preț și orar proprii. Atunci nu e
un copil în două grupe, e un produs nou.

**D7 · O sală de 10 locuri per locație, iar proba consumă un loc.** Două lucruri care merg
împreună, fiindcă amândouă spun același număr.

Sala: fiecare locație are, azi, o singură sală de 10 locuri. E deja în migrarea din
[E08](E08-multi-locatie.md) (`1787909549491-LocationsAndRooms.ts` inserează „Sala 1" cu 10 locuri și
10 calculatoare per locație) și se editează integral din `/admin/locations`, `PUT /rooms/:id`. Se
consemnează ca decizie, nu ca schimbare: 10 e valoarea reală, nu o presupunere de migrare, iar o
sală în plus sau o capacitate mai mare sunt operațiuni de configurare. Capacitatea grupei nu poate
depăși capacitatea sălii — `GROUP_OVER_ROOM_CAPACITY`.

Proba: o lecție de probă ocupă unul dintre cele 10 locuri, cât ține. Deci o grupă plină nu primește
un copil la probă, iar orice loc liber afișat undeva în platformă e calculat ca `capacity` minus
înscrierile active minus probele programate. Nu există un plafon separat de probe — a se vedea
bulina de mai sus: ar fi al doilea număr pentru aceeași sală.

Consecința care se simte în afara epicului e la [E20](E20-achizitie-lead.md) S2: formularul public
de programare nu poate oferi o grupă fără loc liber. Nu e o restricție de interfață, e aceeași
regulă de capacitate, verificată în același loc — altfel un părinte primește o confirmare pentru un
scaun care nu există.

**D8 · Datele obligatorii la înregistrare sunt nume, prenume, adresă, telefon și email. Fără CNP.**
Lista din S2 se închide aici. SmartBill cere pentru facturarea unei persoane fizice doar numele și
adresa; telefonul și emailul se cer fiindcă fără ele nu poți suna o familie și nu poți trimite o
factură, nu dintr-o cerință fiscală. Contactul de urgență (D4) se adaugă la ele, tot obligatoriu, și
tot din motive de operare.

CNP-ul **nu se colectează.** Nu e un câmp oarecare: își aduce propriile obligații de temei,
minimizare și retenție în [E07](E07-securitate-gdpr.md), iar un câmp cerut degeaba e o dată
personală strânsă fără motiv. Întrebarea deschisă adăugată în [E16](E16-plati-fiscal.md) — dacă
factura B2C are nevoie de el — are răspuns și se închide acolo.

**D9 · Nu există date istorice de reconstruit** — vezi [E04](E04-migrari-date.md). S1 se simplifică:
`Enrollment` se construiește curat, fără aproximarea înscrierilor vechi din prezențe.

## Întrebări deschise

- Cât timp are cineva de pe lista de așteptare să confirme un loc eliberat? **Implementat cu 48 de
  ore**, ca ipoteză — două zile lucrătoare, destul pentru un părinte care își citește mailul seara
  și nu atât cât să lase următoarea familie să aștepte după cineva care s-a răzgândit. Rămâne
  deschisă până o confirmă școala; e `WAITLIST_RESPONSE_HOURS` în
  `apps/api/src/modules/enrollment/enrollment.service.ts`.
  **Închisă la implementarea S2: un cont neconfirmat sau neaprobat _se poate_ autentifica.** Portalul
  îi arată o notificare cu ce mai lipsește, iar dacă adresa nu e confirmată, butonul de retrimitere a
  linkului. Un login care refuză fără să explice ar lăsa o familie care așteaptă să nu poată distinge
  „încă nu v-am aprobat" de „site-ul e stricat" — și, mai practic, retrimiterea linkului n-ar mai avea
  de unde să fie cerută. Contul nu poate face nimic: singura operațiune pe care o deblochează
  aprobarea, repartizarea într-o grupă, e oricum a adminului, iar restul portalului e gol prin
  construcție, fiindcă familia n-are încă nici grupă, nici factură.
