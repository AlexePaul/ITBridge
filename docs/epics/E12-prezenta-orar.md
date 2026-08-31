# E12 · Prezență, recuperări și orar

**Status:** în lucru · **Pistă:** Operațiuni · **Depinde de:** E11 · **Blochează:** E13, E14, E21

## Problemă

Modulul de prezență există și funcționează la nivel de bază: `POST /attendance/:groupId` marchează,
`GET /attendance/child/:childId` citește. `Attendance` are copil, grupă, dată, oră de început, tip
și un boolean `present`.

`Attendance.type` e deja enum cu două valori, `regular` și `make-up`
(`apps/api/src/enum/attendance-type.enum.ts`, coloană `enum` prin migrarea `EnumColumns`), iar
serviciul **scrie deja** `make-up`: `AttendanceService.createAttendance`
(`apps/api/src/modules/attendance/attendance.service.ts:75`) pune valoarea aceea pentru orice copil
marcat într-o grupă care nu e a lui, iar `ATTENDANCE_TYPE_LABELS` din
`packages/types/src/attendance.ts` o afișează ca „Recuperare".

Deci coloana pentru recuperări există, e validată de bază și e populată corect. Ce nu există e
mecanismul din jurul ei: nu există drept de recuperare, nu există programare, nu există consumare.
Azi „recuperare" înseamnă doar „a fost marcat în altă grupă", constatat după fapt.

Ce lipsește:

- **Absența nu are motiv și nu e anunțată.** Un părinte nu are cum să anunțe că lipsește copilul, iar
  profesorul nu știe dinainte pe cine să aștepte.
- **Recuperarea e o etichetă, nu un mecanism.** Marcajul `make-up` de mai sus consemnează că un copil
  a fost prezent în altă grupă; nimic nu spune că avea dreptul, nimeni nu l-a programat și nimic nu
  se consumă. Cu prețul fix pe modul din [E15](E15-pricing-facturare.md), absența nu naște o
  datorie: părintele cumpără participarea la un modul de 6-8 ședințe, nu ședințele la bucată. Miza e
  de retenție, nu juridică — un copil care lipsește la două din șase ședințe rămâne în urmă, iar
  școala nu are nici cum să-i ofere recuperarea, nici cum să arate că a oferit-o. Vezi
  [Decizii luate](#decizii-luate).
- **Nu există orar.** Ședințele nu sunt entități; se deduc din `Group.weekday` plus `startTime`.
  Deci nu poți anula o ședință, nu poți muta una, nu poți marca vacanțele școlare, nu poți gestiona
  o zi liberă legală. Cu regula veche de trei simplă pe lunile cu vacanță, asta se compensa manual.
- **Nimeni nu e notificat.** Nici absența, nici anularea, nici recuperarea.
- **Marcarea prezenței e greoaie.** Profesorul e cel care o face, în timpul cursului, cel mai
  probabil de pe telefon. Interfața actuală nu e gândită pentru asta.

## Rezultat

Orarul e explicit, cu ședințe care pot fi anulate sau mutate. Absențele se anunță și se recuperează.
Profesorul marchează prezența în câteva secunde. Părintele știe ce se întâmplă fără să întrebe.

## În scop

- Entitatea `ClassSession` — ședința programată.
- Calendar de vacanțe și zile libere.
- Absențe anunțate, cu motiv.
- Recuperări: drept, programare, consumare.
- Interfață de marcare optimizată pentru telefon.
- Notificări legate de prezență.

## În afara scopului

- Evaluarea a ce s-a învățat la ședință — vezi [E13](E13-progres-evaluare.md).
- Efectul financiar al absențelor — vezi [E15](E15-pricing-facturare.md).

## Story-uri

### S1 · Ședința ca entitate

Entitatea se numește **`ClassSession`, pe tabelul `class_sessions`** — nu `Session`. Numele e deja
luat: `apps/api/src/entities/session.entity.ts` definește `export class Session` pe
`@Entity('sessions')`, un rând per refresh token, cu migrarea `AddSessions` și înregistrată în
`EntitiesModule`. E cod livrat ([E05](E05-robustete-backend.md) S7), iar două clase cu același nume
nu pot coexista. Vezi [Decizii luate](#decizii-luate).

`ClassSession`: grupă, modul, lecție din [E10](E10-curriculum-module.md), dată, interval, sală,
profesor, stare (`programată`, `ținută`, `anulată`, `mutată`). Generate automat la începutul
modulului din programul grupei, apoi editabile individual.

`Attendance` se leagă de `ClassSession`, nu de dată plus oră. Constrângerea
`@Unique(['child', 'date', 'startTime'])` din `apps/api/src/entities/attendance.entity.ts` devine
`@Unique(['child', 'classSession'])`, ceea ce e și mai corect, și mai simplu.

**Acceptanță:** la crearea unei grupe cu modul, ședințele se generează pe toată durata, ocolind
vacanțele.

**Livrat, redus.** `apps/api/src/entities/class-session.entity.ts`, pe tabelul `class_sessions`:
grupă, dată, oră de început și de sfârșit, sală, stare și note libere. `Attendance` are acum
`class_session_id`, iar unicitatea a trecut de la `(child, date, startTime)` la
`UQ_attendances_child_class_session`. `date` și `startTime` au dispărut cu totul de pe marcaj —
erau a doua copie a aceleiași informații, iar un rând putea susține că ora a început la 09:00 în
timp ce ședința spunea 16:00, fără ca nimic să observe.

Sala se **copiază** pe ședință la generare, nu se citește prin `group.room`. Mutarea unei grupe în
altă sală e o schimbare a viitorului, nu a trecutului: citită prin grupă, întrebarea „în ce sală s-a
ținut ora asta?" ar primi alt răspuns de fiecare dată când un admin mută grupa.

Generarea e `POST /class-sessions/generate`, admin, idempotentă prin `UQ_class_sessions_group_date`:
o ședință care există deja e numărată și lăsată complet în pace, indiferent de stare. Aia e jumătatea
importantă a regulii — altfel o regenerare ar învia ședința pe care tocmai a anulat-o cineva.

`GET /class-sessions` e citibil de oricine e autentificat, dar nu întoarce aceleași rânduri pentru
toți: adminul vede toată școala, un părinte doar grupele copiilor lui — restrâns în serviciu, ca
peste tot. Un id de grupă străină primește listă goală, nu 403: rândurile pur și simplu nu sunt ale
lui. Fără restrângere, endpoint-ul ar fi spus oricărui părinte unde și când sunt copiii altora marți
după-amiază.

**Lipsesc modulul și lecția.** Story-ul le cere, `ClassSession` nu le are, fiindcă
[E10](E10-curriculum-module.md) a fost tăiat de patron ca ne-MVP: nu există nici modul, nici lecție
de referit. Consecința nu e un câmp lipsă, e acceptanța: fără modul nu există durată, deci nu se
poate genera „pe toată durata modulului". În loc, un **orizont rulant de opt săptămâni**
(`DEFAULT_HORIZON_WEEKS` din `class-session.service.ts`) — vezi
[Decizii luate](#decizii-luate). Când E10 apare, modulul și lecția se atașează aici ca relații
nullable, iar orizontul devine lungimea modulului.

**Lipsește și profesorul**, din alt motiv: nu există entitate de profesor în cod, doar rolurile
`ADMIN` și `PARENT`. Vine cu [E09](E09-personal-roluri.md).

**Orizontul nu se rulează singur.** Nu există nici job, nici buton — cineva cheamă `generate`. Cu opt
săptămâni înainte e o operațiune la două luni, nu una zilnică, dar rămâne manuală, iar dacă o uită
cineva orarul se golește din coadă, tăcut.

Migrarea `1787994566464-ClassSessionsAndOutbox` reconstruiește ședințele din combinațiile distincte
`(grupă, dată, oră)` deja existente în `attendances` și leagă fiecare marcaj de a lui, fără pierdere.
[Decizii luate](#decizii-luate) spune că nu există prezențe istorice de migrat — adevărat pentru
producție și fals pentru orice bază de dezvoltare pe care a rulat seed-ul, iar o migrare care merge
doar pe tabel gol e o capcană pentru următorul care o rulează. Migrarea se oprește cu mesaj dacă
găsește o grupă cu prezențe la două ore de început diferite în aceeași zi, fiindcă atunci nu poate
ști care e ora reală.

**Două bug-uri reparate pe drum, amândouă mai vechi decât epicul și amândouă la vedere.** Prezența
stătea într-un `useCookie`: măsurat pe API-ul real, 7 ședințe înseamnă 11,7 KB de JSON și 18,6 KB
URI-encoded, față de limita de ~4 KB a browserului, deci cookie-ul era aruncat tăcut după vreo
ședință și calendarul părintelui se randa gol — ceea ce se citește ca „copilul n-a venit niciodată",
nu ca un bug. Store-ul e acum în memorie (`apps/web/app/stores/attendanceStore.ts`), iar nimic nu se
pierde: prezența se reîncarcă la fiecare montare a paginii.

Cu calendarul funcțional s-a văzut că mințea: colora ziua ghicind din `Group.weekday`, deci orice zi
din trecut care se potrivea cu ziua grupei și n-avea înregistrare devenea roșie, „absent" — inclusiv
în luni în care nu existase nicio ședință și inclusiv înainte de înscrierea copilului. Înainte de S1
nu exista din ce ghici mai bine; acum există, deci
`apps/web/app/composables/useAttendanceCalendar.ts` citește ședințele, iar „nemarcat" are culoare
proprie. Vezi [Decizii luate](#decizii-luate).

### S2 · Calendar de vacanțe

Vacanțele școlare și zilele libere legale sunt configurabile, pe locație — pentru cazul în care o
locație are program diferit. Generarea de ședințe le ocolește automat.

**Acceptanță:** un modul de 8 ședințe care traversează vacanța de iarnă se termină cu două
săptămâni mai târziu, corect calculat, fără intervenție.

**Livrat**, exact ca soluția propusă mai jos: `NonTeachingPeriod` cu patru câmpuri, patru rute pe
`ClassSessionController`, ecranul `/admin/calendar` și o condiție în generator.

Un interval, nu o zi — o vacanță de două săptămâni e un rând, o sărbătoare legală e un rând cu
aceleași date la ambele capete, iar anul școlar românesc încape în sub douăsprezece rânduri.
`location` gol înseamnă „toată școala", ceea ce sunt toate intervalele de până acum.

`generateForGroup` sare peste zilele acoperite și le numără separat, în `skipped`: un trimestru mai
scurt e explicat, nu doar observat. Adăugarea unui interval **anulează** ședințele deja programate
în el, nu le șterge — o ședință care era în orar și nu s-a ținut e un fapt despre trimestru, iar
`CANCELLED` e deja ce înțeleg ecranul de prezență și raportul din S7. Nota ședinței păstrează
numele intervalului, deci motivul supraviețuiește. Ștergerea unui interval **nu** le reactivează:
o ședință anulată de vacanță și una anulată fiindcă profesorul a fost bolnav arată la fel după
aceea, iar școala poate să fi reprogramat în jurul amândurora — reactivarea rămâne o decizie per
ședință, prin ruta ei din S5.

Plasa de siguranță din propunere e `GET /class-sessions/non-teaching/impact`, interogat de ecran la
fiecare schimbare de dată: „se anulează 4 ședințe din 2 grupe", cu zilele fiecărei grupe, **înainte**
de salvare. Un an tastat greșit se vede ca un număr ciudat, nu ca un gol descoperit în ianuarie.

Suprapunerile sunt refuzate cu `PERIOD_OVERLAPS`, iar mesajul numește intervalul cu care s-a
ciocnit. Refuzul e deliberat simetric — orice suprapunere de date, indiferent de locație. Regula mai
îngustă („doar ciocnirile care chiar ating aceleași săli") ar fi lăsat o vacanță pe toată școala să
intre peste o închidere doar la Străulești, refuzând aceleași două în ordinea inversă; acceptarea ar
fi depins de care a fost tastată prima.

Un bug prins de testele de integrare, nu de cele unitare: `findGroupsToGenerateFor` încărca `room`,
dar nu și `room.location`, deci fiecare grupă se citea ca fiind fără locație și **orice** interval
local golea orarul întregii școli. Tăcut, fiindcă ședințele pe care le scotea pur și simplu nu
apăreau. Fixture-ul din testul unitar avea relația oricum populată; doar o bază de date reală putea
să arate diferența.

Motivul din [Decizii luate](#decizii-luate) pentru care „S2 devine mai important decât părea" a
dispărut odată cu E10: fără module de delimitat, calendarul de vacanțe a redevenit ce părea la
început — o listă de zile în care nu se ține curs. A fost făcut oricum, pentru motivul de la finalul
propunerii: un lucru de care trebuie să-ți amintești în fiecare decembrie e un lucru pe care
într-un decembrie îl vei uita.

> ## Soluția propusă
>
> **O entitate cu două câmpuri și un ecran de cinci minute pe an.**
>
> ```
> NonTeachingPeriod: startDate, endDate, name, location (nullable)
> ```
>
> Un interval, nu o zi: o vacanță de două săptămâni e un rând, nu paisprezece. O sărbătoare legală e
> un rând cu aceleași date la ambele capete. Structura anului școlar românesc înseamnă **cinci
> intervale de vacanță plus vreo cinci-șase zile libere** — sub douăsprezece rânduri pe an, tastate
> o dată, din ordinul de ministru publicat primăvara.
>
> `location` nullable rezolvă cerința din story fără s-o complice: gol înseamnă „toată școala", ceea
> ce e cazul pentru absolut toate vacanțele naționale; se completează doar dacă o locație chiar are
> vreodată program diferit.
>
> **Ce se schimbă în cod e o singură linie de gândire:** `generateForGroup` sare peste orice dată
> acoperită de un interval. Ședințele deja generate în vacanțe nu se șterg — se anulează, prin
> același `CANCELLED` care există, ca istoricul să spună ce s-a întâmplat și nu doar ce a rămas.
>
> **Ce apără de o dată tastată greșit** e același lucru care apără ecranul de emitere: la salvare
> vezi imediat consecința — „grupa de luni pierde 2 ședințe în decembrie, primele pe 22 și 29" —
> deci o greșeală se vede ca un număr ciudat, nu ca o ședință lipsă descoperită în ianuarie.
>
> **Nu e blocat de nimic.** Nu cere E10, nu cere deploy, nu cere nicio decizie de la nimeni în afară
> de datele din ordin. Costul e o entitate, o migrare, un ecran mic și o condiție în generator.
>
> **De ce merită făcut chiar dacă nu mai determină facturarea:** azi ecranul de prezență arată
> ședințe în vacanță, iar cineva trebuie să-și amintească să le anuleze. Un lucru pe care trebuie
> să ți-l amintești în fiecare decembrie e un lucru pe care într-un decembrie îl vei uita — și
> atunci raportul de prezență nemarcată din S7 va cere socoteală pentru ore care n-au existat.

### S3 · Absențe anunțate

Un părinte anunță din portal, cu motiv și termen minim. Profesorul vede dinainte cine lipsește.
Absența anunțată în termen dă drept la recuperare; cea neanunțată, nu — sau după regula pe care o
stabiliți.

**Acceptanță:** anunțarea până la ora X în ziua cursului marchează absența ca anunțată și creează
dreptul de recuperare.

**Nelivrat**, în afara tăieturii de MVP agreate cu patronul. Un părinte nu are azi cum să anunțe
nimic, iar `Attendance.present` rămâne singurul lucru care se știe despre o absență: că s-a
întâmplat. Story-ul e și poarta către S4 — „absență eligibilă" înseamnă „absență anunțată în
termen", deci fără el recuperarea nu are de unde să înceapă.

### S4 · Recuperări

O absență eligibilă creează un drept de recuperare, cu termen de valabilitate. Părintele își
programează recuperarea într-o grupă compatibilă — același modul, nivel apropiat, loc liber. La
prezentare, dreptul se consumă.

Prezența de recuperare se marchează cu `AttendanceType.MAKE_UP`, valoare pe care serviciul o scrie
deja singur pentru orice copil marcat în afara grupei lui. Deci nu se adaugă nici coloană, nici
valoare: story-ul leagă dreptul de recuperare de un marcaj care se produce oricum, ca „a fost
prezent în altă grupă" să însemne „și-a consumat recuperarea", nu doar o observație.

**Acceptanță:** un părinte vede "ai o recuperare disponibilă până pe 20 decembrie" și o programează
singur, fără telefon.

**Nelivrat.** Recuperarea a rămas exact ce era: `AttendanceType.MAKE_UP`, scris automat pentru orice
copil marcat într-o grupă care nu e a lui — o constatare după fapt. Dreptul, programarea și
consumarea cer S3 înainte și sunt în afara MVP-ului. Singurul lucru care s-a mișcat aici e de partea
părintelui: o recuperare la care copilul a fost prezent are culoare proprie în calendar, iar una la
care a fost programat și n-a venit e o absență ca oricare alta.

### S5 · Anulări și mutări

Un profesor bolnav, o zi de zăpadă: ședința se anulează sau se mută, toți părinții grupei sunt
notificați automat, iar dacă se anulează, toți copiii primesc drept de recuperare.

**Acceptanță:** anularea unei ședințe notifică toată grupa în sub cinci minute și creează drepturile.

**Livrat parțial: doar anularea, doar prin API.** `PUT /class-sessions/:id/cancel` trece ședința în
`cancelled` și scrie motivul în `notes`, prefixat cu „Anulată: ". Două refuzuri: o ședință deja
anulată, și una care are prezențe înregistrate — aia s-a ținut, orice ar spune coloana de stare, iar
anularea ei ar lăsa marcaje atârnate de o oră care oficial n-a existat, exact ce crede raportul de
nemarcate.

**Nu există ecran.** Anularea se face cu o cerere HTTP, deci de un dezvoltator, nu de un admin.
Nu mai e însă singura cale prin care se scoate din orar o ședință căzută în vacanță: de la S2,
ecranul `/admin/calendar` le anulează pe toate deodată, iar ruta asta rămâne pentru cazul punctual —
profesorul bolnav, ziua cu zăpadă.

**Nu pleacă nicio notificare și nu se creează niciun drept de recuperare.** Al doilea cere S4. Primul
nu mai e blocat de canal — `MailService` și coada `outbox` sunt în `apps/api` de la jobul zilnic —,
dar mesajul nu e scris, iar coada n-are unde să ruleze continuu până la
[E01](E01-infrastructura-medii.md) S4. Acceptanța de cinci minute rămâne neatinsă.

**Mutarea nu există deloc.** `date`, `startTime` și `room` sunt coloane, deci mutarea e în principiu
o editare, dar niciun endpoint nu le schimbă. Vezi și decizia despre stările ședinței, mai jos: stare
de „mutată" nu există, fiindcă o ședință mutată e una căreia i s-au schimbat coloanele.

### S6 · Marcarea prezenței pe telefon

Un ecran: grupa de azi, lista copiilor cu poză, apăsare pentru prezent sau absent, salvare automată.
Funcționează pe conexiune slabă și reține local dacă pică rețeaua.

**Acceptanță:** marcarea unei grupe de zece copii durează sub 20 de secunde pe telefon.

**Livrat, fără poze**: `/admin/attendance/azi`, un ecran gândit pentru telefonul din sală. Ședințele
de azi (una singură te bagă direct în catalog), copiii grupei cu două ținte de mărimea degetului —
Prezent / Absent — și **salvare la fiecare apăsare**, nu la un buton de submit.

Sub el stau două rute noi, croite pe conexiunea slabă din acceptanță:

- `GET /attendance/session/:id/register` — **tot catalogul într-un singur payload**: ședința, copiii,
  marcajele existente și telefonul părintelui per copil. O cerere în loc de patru, fiindcă
  apelantul e un telefon pe ce semnal prinde. `present` e trivalent: `null` înseamnă „încă n-a spus
  nimeni", care e alt fapt decât absent.
- `PUT /attendance/session/:id/child/:childId` — un marcaj, **upsert idempotent**, spre deosebire de
  POST-ul în masă care refuză duplicatele pe bună dreptate pentru un catalog întreg. Ecranul
  salvează la fiecare apăsare și reia din coadă când revine rețeaua, deci același marcaj poate sosi
  de două ori, iar o răzgândire sosește ca a doua scriere — un 409 aici ar transforma fiecare
  reîncercare în eroare.

**Reține local dacă pică rețeaua**: un marcaj refuzat de rețea intră într-o coadă în `localStorage`
(`useAttendanceQueue.ts` — partea pură e ținută de vitest, inclusiv cazul în care storage-ul aruncă
într-o fereastră privată) și se retrimite la evenimentul `online` sau din bannerul cu numărul de
marcaje în așteptare. Răzgândirile înlocuiesc marcajul vechi din coadă în loc să-l dubleze. Un 4xx —
ședință anulată, copil dispărut — **nu** intră în coadă: serverul a spus nu, iar reîncercarea nu l-ar
răzgândi.

Din S7 e livrat aici și butonul de apel: un copil marcat absent cu telefon în profil primește
**„Sună părintele"**, un `tel:` direct în rând — profesorul e deja în ecranul ăla, cu telefonul în
mână.

**Fără poze**, deși schița story-ului le numește: `Child` nu are câmp de poză, iar a-l adăuga e o
întrebare de stocare și consimțământ care aparține E07/E14, nu ecranului ăstuia. Ecranul vechi de
marcare pe desktop rămâne neschimbat, pentru cataloagele din urmă și pentru recuperări.

### S7 · Notificări

Recuperare expirând în curând — memento către părinte. Absență neanunțată — notificare către
părinte. Toate prin [E17](E17-comunicare-notificari.md).

**Mementoul pentru prezența nemarcată pleacă la 10-15 minute de la începutul ședinței, nu la o oră
după curs.** Termenul de o oră după curs tratează prezența ca pe o evidență administrativă, care
poate fi completată și seara. Nu e: la un copil de 8 ani, „nu e marcat prezent" și „nu a ajuns" sunt
aceeași propoziție până probează cineva contrariul, iar diferența dintre a afla la minutul 15 și a
afla la sfârșitul zilei e diferența dintre un telefon și o problemă. La minutul 15 mementoul mai are
ce să schimbe; după curs, doar consemnează.

**O absență neanunțată afișează butonul de apel al părintelui direct pe ecranul de prezență din S6.**
Un `tel:` pe telefonul din `Profile.phone`, lângă numele copilului — profesorul e deja în ecranul
ăla, cu telefonul în mână. Alternativa e ca profesorul să iasă din ecran, să caute familia și să
copieze numărul, exact în minutele în care are grupa în față: fricțiunea decide dacă sună sau amână.
`Profile.phone` e `nullable` (`apps/api/src/entities/profile.entity.ts:20`), deci un profil fără
număr nu are ce buton să arate — încă un caz pentru regula de contact obligatoriu la înscrierea
activă din [E11](E11-inscrieri-capacitate.md).

Notificarea automată către părinte rămâne, dar e a doua linie: pleacă dacă apelul nu a rezolvat
situația, nu în locul lui.

**Acceptanță:** o grupă cu prezența nemarcată produce un memento către profesor în primele 15 minute
ale ședinței. Un copil marcat absent fără anunț afișează numărul părintelui pe același ecran, cu o
singură apăsare, iar părintele află în aceeași zi.

**Livrat altceva decât cere story-ul, la cererea explicită a patronului: un memento zilnic către
școală.** `apps/api/src/modules/class-session/unmarked-attendance.job.ts`. La ora 10:00, ora
României, se adună ședințele de ieri care sunt încă `programate` și n-au nicio prezență
înregistrată, iar dacă există vreuna pleacă **un singur** email către adresa școlii, cu grupa, ora
și sala fiecăreia. Adresa e `MAIL_OFFICE_ADDRESS`, cu `office@itbridgeschool.com` ca implicit — o
adresă care cere deploy ca să fie schimbată e o adresă pe care n-o schimbă nimeni. Dacă nu e nimic
nemarcat, nu pleacă nimic: un memento care vine și în zilele bune e un memento pe care lumea îl
filtrează, și atunci nu e acolo în ziua în care conta.

Selecția e aceeași metodă din spatele lui `GET /class-sessions/unmarked`, endpoint de admin. Una
singură, intenționat: două definiții ale lui „nemarcat" ar diverge, iar cea greșită ar fi tocmai cea
pe care o citește emailul, fiindcă la ea nu se uită nimeni. Endpoint-ul nu are încă ecran — deci
lista se poate cere, dar nu se vede nicăieri în admin.

**Ăsta NU e mementoul de la minutul 15 din story și nu-l înlocuiește.** Sunt două întrebări
diferite, care se aseamănă doar la nume:

- **Cel din story e despre un copil.** Profesorul e în clasă, prezența nu e marcată, iar la un copil
  de 8 ani „nu e marcat prezent" și „nu a ajuns" sunt aceeași propoziție până probează cineva
  contrariul. La minutul 15 mementoul mai are ce să schimbe: un telefon către părinte.
- **Cel livrat e despre catalog.** Ziua s-a terminat, ora a rămas fără nicio prezență, și cineva
  trebuie ori să completeze, ori să anuleze ședința. Nu mai poate salva pe nimeni; ține evidența
  întreagă.

Diferă și în implementare, nu doar în intenție: primul are nevoie de un declanșator per ședință și
pleacă la profesor, al doilea e un cron pe zi și pleacă la birou. Când se construiește primul,
`findUnmarkedSessions` e aceeași întrebare pusă pe alt interval — dar vine **în plus**, nu în loc.

**Restul S7 e nelivrat**, fiecare bucată blocată de altceva: butonul de apel cere ecranul din S6,
notificarea către părinte pentru absență neanunțată cere S3, mementourile de recuperare expirată cer
S4. Iar mesajul zilnic însuși **se scrie azi în coadă și nu pleacă nicăieri în producție**: nu există
producție — vezi [Dependențe](#dependențe), imediat mai jos.

## Dependențe

[E11](E11-inscrieri-capacitate.md) pentru cine e înscris când.

**S1 și mementoul zilnic s-au livrat fără el.** Ședințele se generează din orarul grupei, iar cine e
în grupă se citește azi din `Child.group`, o singură referință — atât cere un orar. Dependența rămâne
reală pentru S3 și S4: „a avut dreptul la o recuperare" e o afirmație despre o înscriere, cu început
și sfârșit, nu despre apartenența de moment la o grupă.

**[E10](E10-curriculum-module.md) nu mai e o dependență, fiindcă nu mai e.** S1 îl cerea pentru modul
și lecție; a fost tăiat de patron ca ne-MVP, iar S1 s-a livrat fără ele, cu prețul scris acolo:
orizont rulant în loc de generare pe durata modulului.

**[E17](E17-comunicare-notificari.md) e necesar pentru S5 și S7.** Amândouă au acceptanțe care se
măsoară într-un mesaj ajuns la cineva: anularea unei ședințe notifică toată grupa în sub cinci
minute, iar părintele află de o absență neanunțată în aceeași zi. Fără canal, S5 poate livra cel
mult anularea și drepturile de recuperare, iar din S7 rămân doar butonul de apel și mementoul din
interfață — partea care ajunge la părinte fără ca el să deschidă portalul lipsește. Aceeași
dependență ține și mementourile de recuperare expirată.

**Ce s-a schimbat: canalul există, dar n-are unde să ruleze.** Mementoul zilnic a cerut din E17 exact
cât îi trebuia, deci S1 și S3 de acolo sunt livrate parțial, în `apps/api/src/modules/mail/`:
`MailService`, singurul loc din backend care vorbește cu Resend — înainte nu exista niciunul, fiindcă
Resend stătea doar în ruta Nitro a formularului de contact, care rulează pe Vercel și nu vede baza de
date — plus tabelul `outbox`, scris în aceeași tranzacție cu lucrul care l-a provocat și golit de un
scheduler cu `FOR UPDATE SKIP LOCKED` și pauză care se dublează.

**Scheduler-ul acela nu rulează în producție.** Cere un proces care trăiește continuu, într-o singură
instanță, adică fișierul de PM2 din [E01](E01-infrastructura-medii.md) S4 — care nu există, fiindcă
backend-ul nu e deployat nicăieri. Deci pentru S5 și S7 nu mai lipsește codul de trimitere, lipsește
locul unde să ruleze; și lipsesc în continuare șabloanele din E17 S2.

## Riscuri

**Regulile de recuperare sunt o decizie de business, nu tehnică.** Prea generoase și se umplu
grupele cu recuperări; prea stricte și părinții se simt înșelați după ce au plătit un modul întreg.

## Definition of done

Fiecare ședință ținută are prezența completă. Absențele eligibile au drept de recuperare urmăribil.
Anulările notifică automat.

**Atins doar primul, și doar pe jumătatea care se poate verifica.** Ședința e o entitate, prezența
atârnă de ea, iar o oră rămasă fără catalog e detectabilă și se raportează o dată pe zi — deci
„prezența completă" nu mai e o speranță, e o listă. Ce lipsește ca să fie și _garantată_ e ecranul
din S6, care face marcarea destul de ieftină încât să se întâmple în timpul orei.

Restul e neatins și rămâne așa până se decid alte lucruri: recuperările urmăribile cer S3 și S4,
adică o regulă de business pe care patronul n-a dat-o încă; anulările care notifică cer un loc unde
să ruleze coada, adică [E01](E01-infrastructura-medii.md) S4.

## Decizii luate

**Ședința se numește `ClassSession`, pe tabelul `class_sessions`.** Numele scurt e ocupat de
autentificare: `apps/api/src/entities/session.entity.ts` e `class Session` pe `@Entity('sessions')`,
un rând per refresh token. Alternativa — redenumirea entității de autentificare — ar cere o migrare
de tabel pe singurul mecanism prin care se deloghează cineva, ca să elibereze un nume. Prefixul
costă cinci litere și nu atinge nimic livrat. Decizia se ia aici, nu în
[E14](E14-proiecte-elevi.md), fiindcă E12 S1 e primul care scrie entitatea; E14 vorbește despre
„ședință" în proză și nu e afectat.

**Nu există prezențe istorice de migrat** — vezi [E04](E04-migrari-date.md), care a stabilit că nu
există date de producție de păstrat și numește explicit E12 S1 ca pierzând etapa de reconstrucție.
Ședințele se generează curat din programul grupei, iar `Attendance` se leagă de ele de la prima
ședință a primului modul. Cade odată cu asta și grija că orele decalate artificial din
[E08](E08-multi-locatie.md) ar face reconstrucția imprecisă: nu e nimic de reconstruit, iar
constrângerea care provoca decalajul a fost deja corectată.

**Ședințele se generează pe un orizont rulant de opt săptămâni.** S1 cerea generare pe durata
modulului, ocolind vacanțele. Nici modulul, nici calendarul nu existau atunci — primul fiindcă E10 a
fost tăiat, al doilea fiindcă era S2. Alternativele erau să nu existe orar deloc până apar amândouă,
sau să existe unul care merge înainte cu opt săptămâni și greșește previzibil în vacanțe. A doua,
fiindcă orarul e ce face posibil restul: prezența legată de o ședință, raportul de nemarcate,
calendarul părintelui.

Orizontul rulant a rămas; jumătatea greșită s-a reparat la S2, care e chiar calendarul de vacanțe.
Modulul nu a mai apărut și nici nu mai trebuie: orizontul de opt săptămâni care sare peste vacanțe
face exact ce cerea acceptanța story-ului — un modul de 8 ședințe care traversează vacanța de iarnă
se termină cu două săptămâni mai târziu, fără intervenție.

**O ședință căzută în vacanță se anula manual**, prin `PUT /class-sessions/:id/cancel`, cu motivul
scris în `notes` — până la S2. Decizia s-a dovedit reversibilă în direcția anunțată: calendarul
împiedică acum generarea de la început, iar anulările vechi au rămas corecte, fiindcă spun exact ce
s-a întâmplat. Regenerarea nu le strică, fiind idempotentă pe `(grupă, dată)` și fără să atingă o
ședință existentă, indiferent de stare — proprietate pe care se sprijină și calendarul: după ce un
interval a anulat o ședință, oricâte generări ar mai rula, nu o pun înapoi.

**„Nemarcat" nu e „absent", și are culoare proprie.** Calendarul părintelui distinge acum cinci stări
— planificat, prezent, absent, nemarcat, recuperare —, iar legenda din `user/dashboard.vue` spune în
litere că albastru înseamnă „a avut loc o oră, dar prezența încă nu a fost marcată de profesor" și
„nu înseamnă că a lipsit copilul".

Nu e o alegere de culori. O prezență lipsă e o afirmație despre catalogul școlii, nu despre copil, iar
înainte de branch-ul ăsta era prezentată ca a doua: fiecare zi din trecut care se potrivea cu ziua
grupei și n-avea înregistrare era roșie. Un părinte care se uită la un șir de zile roșii nu citește
„n-a completat nimeni", citește „copilul meu lipsește constant" — și sună. Aceeași regulă în cealaltă
direcție ține și raportul intern cinstit: marcarea prezenței **nu** trece ședința în `ținută`, deci
„are prezențe" și „e ținută" rămân două semnale independente, iar cel după care se cheamă nemarcatele
e primul, nu al doilea.

Ziua de azi e „planificat", nu „nemarcat": ora poate să nu se fi terminat, iar mementoul care aleargă
după un catalog uitat pleacă abia a doua zi dimineața.

**Trei stări pentru o ședință, nu patru.** S1 enumeră și `mutată`. O ședință mutată nu e o stare, e
una căreia i s-au schimbat `date`, `startTime` sau `room` — coloane care există deja. O stare
separată ar spune „rândul ăsta a fost editat" fără să spună în ce, și ar trebui ținută în pas cu
coloanele de mână. Când cineva chiar are nevoie de urma schimbării, aia e o tabelă de istoric, nu un
`enum`.

**Două recuperări per modul, doar pentru absențe anunțate cu minim 3 ore înainte. Configurabil.**

Fiindcă prețul e fix pe modul și nu pe ședință — vezi [E15](E15-pricing-facturare.md) — recuperarea
**nu e o datorie contractuală, e un instrument de retenție.** Distincția contează juridic: părintele
cumpără participarea la un modul, nu un număr garantat de ședințe. Formularea din factură și din
termeni trebuie să reflecte asta.

Regulile se citesc din configurație, cu `.env` ca sursă implicită:

```
RECUPERARI_MAX_PER_MODUL=2      # 0 = nelimitat
RECUPERARI_ANUNT_MIN_ORE=3
RECUPERARI_VALABILITATE_MODULE=1
```

Implementarea citește dintr-un strat de configurație, nu direct din `process.env` în logica de
business. Motivul: un `.env` nu poate varia pe locație sau pe modul și cere repornire la
schimbare. Cu stratul intermediar, mutarea regulilor într-un tabel editabil de admin devine
înlocuirea sursei, nu rescrierea logicii.

**S2 devine mai important decât părea.** Calendarul de vacanțe nu mai e doar pentru a sări ședințe:
după [E10](E10-curriculum-module.md), vacanțele _delimitează modulele_, deci calendarul determină
ce se facturează și când. Cele două epicuri se implementează împreună.

**Decizia asta a căzut odată cu E10.** Tăiat ca ne-MVP, nu mai există modul de delimitat, deci
calendarul de vacanțe nu mai atinge facturarea și redevine ce părea la început: o listă de zile în
care nu se ține curs, folositoare ca să nu se genereze ședințe degeaba. Se păstrează scrisă fiindcă
argumentul revine intact în ziua în care revine E10.

## Întrebări deschise

Niciuna nu ține pe loc ce s-a livrat; fiecare spune ce blochează.

- Recuperarea se poate face în cealaltă locație? **Blochează S4**, și e o decizie de business.
- Cine reînnoiește orizontul de opt săptămâni, și când? Azi e o cerere HTTP pe care o face un
  dezvoltator. Variantele sunt un buton în admin sau un cron lângă cel de la ora 10:00 — al doilea e
  aproape gratuit acum, dar are aceeași problemă ca restul: cere un proces care rulează continuu.
  **Nu blochează nimic din S1**, care funcționează; e o gaură de operare care se închide fie în
  admin, fie odată cu [E01](E01-infrastructura-medii.md) S4.
