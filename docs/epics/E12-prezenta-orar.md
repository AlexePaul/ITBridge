# E12 · Prezență, recuperări și orar

**Status:** în lucru · **Pistă:** Operațiuni · **Depinde de:** E11 · **Blochează:** E13, E14, E15, E21

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
- Bifa de vacanță pe ședință, ca faptul din care se calculează factura.

## În afara scopului

- Evaluarea a ce s-a învățat la ședință — vezi [E13](E13-progres-evaluare.md).
- Efectul financiar al absențelor — vezi [E15](E15-pricing-facturare.md). Din S8 epicul ăsta
  produce **faptele** pe care se calculează factura — s-a ținut ora, a fost sau nu în vacanță, cine
  a fost prezent —, dar niciun leu nu se calculează aici, și niciun ecran de prezență nu arată
  sume.

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

**Livrat.** `AbsenceNotice` leagă un copil de o **ședință**, nu de o dată și o oră — ca orice rând
care vorbește despre o oră de curs, fiindcă orarul e singurul răspuns la „când". **Anunțul îl scrie
adminul**, fiindcă el e cel care ridică telefonul: părinții sună, dau mesaj pe WhatsApp sau scriu pe
email, iar butonul din portal a fost scos. `/user/absente` rămâne locul unde familia **citește** ce
s-a notat și unde a fost mutat copilul.

**Termenul e luni, ora 12:00, pentru toată săptămâna.** Story-ul lăsa pragul școlii („sau după
regula pe care o stabiliți"); școala l-a stabilit, iar el nu e per oră, ci **per săptămână**.
Anunțul nu există ca să-l prevină pe profesorul care intră în sală — există ca biroul să poată muta
copilul în altă grupă **în aceeași săptămână**, iar planificarea aia se face o dată, luni. Un anunț
venit miercuri pentru o oră de miercuri n-a ratat nimic din ce-i trebuia profesorului și tot ce-i
trebuia biroului.

Consecința e dură și a fost aleasă știind-o: copilul care se trezește bolnav miercuri **nu câștigă
nicio recuperare**. Răspunsul școlii e cel pe care îl dă și despre taxă — locul a fost ținut,
profesorul a fost în sală, deci luna costă la fel, iar ce cumperi anunțând din timp e **șansa de a
muta**, nu o reducere. E aceeași logică ca la un abonament de telefon, care nu vine mai mic fiindcă
ai vorbit puțin.

**Singura îngăduință e backfill-ul, și e pentru biroul care uită, nu pentru termen.** Părinții ne
anunță pe telefon, WhatsApp sau email, iar cineva trebuie să treacă asta în sistem — **doar adminul
notează absențe**. Când nimeni n-o face, familia și-a făcut partea și ar pierde săptămâna dintr-o
întârziere care n-a fost a ei. Fereastra se închide **când începe ora la care copilul a fost mutat**:
înainte de ea mutarea mai e ceva de aranjat, după ea ora s-a ținut deja și n-ai ce consemna. Nu se
poate nici întinde — ședința-țintă se numește în momentul backfill-ului, deci termenul e o
proprietate a orei oferite, nu un interval ales de cineva.

Ambele sunt în `absence-notice.rules.ts`: `isInTime` compară cu luni 12:00 din săptămâna ședinței,
`canBackfill` cu începutul ședinței de înlocuire. **Școala n-are grupă luni dimineața**, deci prânzul
de luni cade întotdeauna înaintea oricărei ore din săptămâna lui; dacă apare vreodată una, regula
încetează tăcut să mai poată fi respectată pentru ea, iar linia aia e locul de schimbat.

Cinci decizii care se încalcă ușor:

- **`inTime` se îngheață la scriere, nu se recalculează la citire.** Eligibilitatea e un fapt despre
  momentul în care părintele a anunțat; o coloană derivată și-ar schimba răspunsul pe măsură ce ora
  se îndepărtează în trecut, iar în ziua în care s-ar schimba regula ar rescrie ce i s-a spus deja
  unei familii.
- **Anunțul nu marchează pe nimeni absent.** Catalogul rămâne al profesorului, iar un copil al cărui
  părinte a anunțat poate să vină totuși — și vine. Rândul ăsta e ce vede profesorul _înainte_.
- **Un al doilea anunț modifică, nu adaugă.** Un părinte care scrie din nou s-a răzgândit sau
  reformulează, n-a produs a doua absență. `UQ_absence_notice_child_session` e ce face asta adevărat
  și pentru două apăsări în aceeași secundă. `inTime` se rejudecă la modificare: modificarea e ea
  însăși un act cu un moment.
- **Un anunț târziu se acceptă, dar nu e „în termen".** Refuzul l-ar face pe părinte să nu mai spună
  nimic, iar școala pierde motivul — care îi trebuie oricum. Ce pierde familia e eligibilitatea.
- **Timpul se compară pe ceasul școlii.** Ședința ține o dată locală și un `HH:mm` local, iar `now` e
  un instant; comparația trece prin `Intl` pe `Europe/Bucharest`. Prin UTC, un anunț de la 01:00
  ora școlii ar fi judecat ca fiind „încă ziua de ieri" — greșeala de exact o zi din CLAUDE.md, în
  altă haină.

**Ajunge la profesor, nu doar în bază:** ecranul de pe telefon (S6) arată insigna „Anunțat" și
motivul sub nume, iar butonul „Sună părintele" **dispare** pentru un copil anunțat — familia a
răspuns deja la întrebarea pe care ar fi pus-o telefonul.

Story-ul e și poarta către S4: „absență eligibilă" înseamnă acum ceva concret și stocat — `inTime` —,
deci recuperarea are de unde să înceapă. Dreptul, programarea și consumarea rămân S4.

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

**Livrat, dar nu așa cum cere story-ul — și diferența e tot story-ul.** Nu există drept de
recuperare. Nu există jeton, termen de valabilitate, ecran de programare și nici stare de consumat.
Ce există e o coloană: `absence_notices.replacement_session_id`, ora la care **biroul a mutat
copilul** pentru săptămâna aia.

Recuperarea a fost întâi un credit de 30 de zile, apoi un credit de o săptămână, și abia pe urmă s-a
văzut că nu e un credit deloc. Un jeton descrie o școală în care familia alege ora; a noastră citește
luni absențele anunțate și **mută copiii între grupe cu mâna**, fiindcă „ce grupă are un scaun liber
și un profesor care mai poate lua un copil de nouă ani" nu e o interogare. Familia nu alege nimic,
deci n-are ce ține în mână. I se spune unde să-l aducă.

**Fereastra e săptămâna în care s-a pierdut ora, nu o zi mai mult** (`replacement.rules.ts`). O oră
de miercuri se recuperează joia sau sâmbăta aceleiași săptămâni, ori nu se recuperează deloc. Și asta
nu mai e o alegere de lungime, ci consecința mutării: un copil nu poate sta cu altă grupă într-o
săptămână care a trecut, iar școala nu ține o grupă în minus și alta în plus mai mult decât săptămâna
care a provocat-o.

Ce s-a șters odată cu creditul, ca listă, fiindcă fiecare punct era cod pe care cineva l-ar putea
reintroduce din reflex:

- tabela `make_up_credits`, cu tot cu `expiresOn`, `booked_session_id` și `consumed_attendance_id`;
- `MakeUpCreditService` — câștigare, programare, anulare, consum, expirare;
- cele patru endpoint-uri prin care părintele își vedea și își programa orele;
- `AttendanceService.settleMakeUp`: catalogul nu mai produce nicio recuperare, fiindcă mutarea se
  aranjează **înaintea** orei, nu se deduce după ea;
- bifa „dă-le copiilor dreptul la o recuperare" de la anularea unei ore (S5);
- mesajul de seară „ai o oră de recuperare" (S7), înlocuit cu unul trimis în momentul mutării.

Cinci decizii care se încalcă ușor:

- **`null` înseamnă două lucruri, și calendarul le desparte.** Cât săptămâna e încă în față, „nu s-a
  ocupat nimeni încă"; după ce a trecut, „nu s-a întâmplat". N-are cine scrie o stare, fiindcă nu e
  nimic de scris: o coloană de stare ar fi un al doilea loc care spune ce spune deja data.
- **Termenul din S3 e ce face fereastra asta accesibilă.** Prânzul de luni există exact ca toată
  săptămâna să fie încă înainte când biroul începe să plaseze copii. Cele două reguli se citesc
  împreună sau niciuna n-are sens.
- **Ce oprește o mutare e ora oferită, nu termenul familiei.** `canBackfill` — ședința de înlocuire
  n-a început încă. `inTime` rămâne pe rând ca **fapt despre anunț**, nu ca poartă: părintele a sunat
  luni dimineață, iar dacă cineva de la birou a trecut asta în sistem abia marți, familia nu are de ce
  să piardă săptămâna pentru o întârziere care n-a fost a ei.
- **Marcajul nu mai consumă nimic, dar rămâne adevărat.** `AttendanceType.MAKE_UP` se scrie în
  continuare singur pentru orice copil marcat în afara grupei lui. Nu mai e „și-a folosit dreptul",
  e ce a fost dintotdeauna: o observație corectă despre unde a stat copilul în ora aia.
- **Locul liber se numără pe ședință, nu pe grupă.** Un copil mutat temporar stă pe un scaun, la un
  calculator, exact ca o probă (D7), deci numărătoarea e înscrieri în vigoare **plus** copii deja
  mutați pe acea ședință. O grupă plină cu copiii ei n-are loc pentru un vizitator, deși nimeni nu e
  „înscris" în vizită.

**„Același modul" din story nu se verifică, fiindcă modulele nu există** — E10 e scos din MVP. Banda
de vârstă a grupei gazdă e ce are platforma ca să spună că două grupe predau ceva destul de apropiat,
și e același semnal pe care îl folosește înscrierea.

**Acceptanța, literal, nu se mai livrează — și e o decizie, nu o scăpare.** „Fără telefon" era
jumătatea greșită a propoziției: telefonul e exact canalul pe care școala vrea absența, fiindcă
odată cu ea vine motivul și o conversație despre ce se poate face în săptămâna aia. Ce s-a păstrat
din intenție e cealaltă jumătate — familia nu trebuie să alerge după nimeni ca să afle unde s-a
ajuns. În `/user/absente` scrie, fără să întrebe nimeni: „Ana merge la grupa Python, joi 10
septembrie, ora 18:00".

**Ce a rămas în afara acestui story:** ecranele de birou. Endpoint-urile există și sunt ADMIN
(`GET /attendance/replacements/unplaced`, `GET /attendance/absences/:id/replacement-options`,
`PUT`/`DELETE /attendance/absences/:id/replacement`), dar interfața pe care le apasă cineva luni
dimineața e a lui S6 și a epicei de frontend.

### S5 · Anulări și mutări

Un profesor bolnav, o zi de zăpadă: ședința se anulează sau se mută, toți părinții grupei sunt
notificați automat, iar dacă se anulează, toți copiii primesc drept de recuperare.

**Acceptanță:** anularea unei ședințe notifică toată grupa în sub cinci minute și creează drepturile.

**Livrat parțial: doar anularea, doar prin API.** `PUT /class-sessions/:id/cancel` trece ședința în
`cancelled` și scrie motivul în `notes`, prefixat cu „Anulată: ". Două refuzuri: o ședință deja
anulată, și una care are prezențe înregistrate — aia s-a ținut, orice ar spune coloana de stare, iar
anularea ei ar lăsa marcaje atârnate de o oră care oficial n-a existat, exact ce crede raportul de
nemarcate.

**Ecranul există de acum: `/admin/orar`.** Ședințele următoarelor două săptămâni, filtrabile pe zile
și pe grupă, cu trei butoane pe rând — mută, anulează, reactivează. Nu e un calendar în grilă,
fiindcă întrebarea căreia îi răspunde e „care oră nu se ține", și se pune despre câteva zile odată.
Nu e nici singura cale prin care se scoate din orar o ședință căzută în vacanță: de la S2, ecranul
`/admin/calendar` le anulează pe toate deodată, iar asta rămâne pentru cazul punctual — profesorul
bolnav, ziua cu zăpadă.

Trei reguli sunt în butoane, nu în explicații: o ședință anulată oferă doar „reactivează"; una cu
catalog făcut nu oferă nimic, fiindcă s-a ținut și API-ul refuză oricum; iar fiecare dintre cele
trei acțiuni scrie un email familiilor grupei, deci fiecare dialog o spune înainte de apăsare.

**Notificarea pleacă acum, și e transactională.** Trei șabloane noi în E17/S2 —
`class-cancelled`, `class-moved`, `class-reinstated` —, câte un mesaj **per părinte**, nu per copil,
scris cu `EntityManager`-ul tranzacției care schimbă ședința: o oră anulată fără ca nimeni să afle e
exact defecțiunea pentru care există coada, iar un anunț despre o anulare care s-a dat apoi înapoi e
mai rău decât amândouă. Cheia de deduplicare poartă **a câta anunțare e pentru ședința aceea**, nu
ziua: o oră anulată din greșeală, reactivată un minut mai târziu și apoi anulată de-adevăratelea
trebuie anunțată de două ori — familia a auzit ultima dată că se ține —, în timp ce doi admini care
apasă același buton în aceeași clipă nu. Numărul se citește în tranzacția care scrie, deci amândoi
văd același și indexul unic îl refuză pe al doilea.

**Un copil mutat temporar pe ora anulată se eliberează în aceeași tranzacție**, iar familia lui e
anunțată odată cu grupa, în cuvintele ei: ora la care îl trimisesem nu se mai ține, căutăm alta în
aceeași săptămână. Fără asta copilul din altă grupă ar fi apărut la o oră care nu se ține, iar
numărătoarea de locuri ar fi ținut un scaun ocupat degeaba. La mutarea unei ore familia aceea află
ora nouă, ca și grupa. Reactivarea **nu** reface plasările eliberate — între timp biroul poate să fi
mutat copilul în altă parte, iar a-l trimite înapoi fără să întrebe e cum ar afla familia ultima.

Reactivarea are și ea mesaj, și nu e un lux: familiile au fost anunțate că ora nu se ține, deci una
pusă la loc fără să spună nimeni e o schimbare pe care o vede doar școala, iar rezultatul e o sală
goală.

Acceptanța de cinci minute rămâne a dispecerului, care pornește odată cu
[E01](E01-infrastructura-medii.md) S4 — mesajele se scriu, dar coada nu rulează continuu nicăieri.

**Recuperarea la anulare nu mai e nici bifă, nici automatism — nu mai e nimic.** Story-ul cerea ca
toți copiii să primească drept de recuperare când ora se anulează, iar o vreme asta a fost o bifă pe
ecranul de anulare, ca decizie de preț. Amândouă au dispărut cu creditul din S4, și pe bună dreptate:
întrebarea la care răspundeau primeau acum răspuns din alte două reguli, fără să aleagă nimeni.
**O oră fără catalog nu se facturează nimănui** (E15/S9), deci familia nu plătește o lecție pe care
n-a primit-o; iar dacă săptămâna mai are o oră potrivită, biroul mută copilul acolo — o plasare pe
care o face cineva după aceea, nu o casetă bifată în timp ce anulează.

Câmpul `grantMakeUpCredits` e **scos din DTO, nu ignorat**: validarea rulează cu
`forbidNonWhitelisted`, deci un client care încă îl trimite primește 400 în loc să creadă că a cerut
ceva.

**Mutarea există acum**: `PUT /class-sessions/:id/move` — altă zi, altă oră, altă sală, oricare din
ele, cu motiv obligatoriu exact ca la anulare. E o editare a rândului, nu un rând nou — stare de
„mutată" nu există, conform deciziei de mai jos — deci catalogul rămâne atașat, iar nota păstrează
de unde a plecat ședința, fiindcă aia e întrebarea pe care o pune un părinte. Refuză, în ordine:
ședințele anulate (reactivezi întâi), pe cele deja ținute (au prezențe — s-au întâmplat la ora
veche), mutarea care nu schimbă nimic, o zi din calendarul școlar (**S2 nu are ușă laterală** —
verificat pe locația sălii țintă, nu a celei vechi), o zi în care grupa are deja oră (indexul unic
ar refuza oricum; verificarea întâi transformă eroarea de driver în propoziție) și o sală ocupată
la ora aia de altă ședință vie — cele anulate nu blochează, sala lor e liberă în fapt. Are acum și
ecran, și mesaj: părintele primește ambele jumătăți, de unde a plecat ora și unde a ajuns, fiindcă
după mutare doar nota mai ține minte prima.

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

**Livrat întâi altceva decât cere story-ul, la cererea explicită a patronului: un memento zilnic
către școală** — mementoul de la minutul 15 a venit după, **în plus**, și e descris mai jos.
`apps/api/src/modules/class-session/unmarked-attendance.job.ts`. La ora 10:00, ora
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

**Livrată acum și notificarea către părinte** — a doua linie din story, cea de după telefonul
profesorului. **Una singură, și e despre mutare, nu despre absență.** Nu are job și nu are oră:
pleacă în clipa în care biroul mută copilul, din `ReplacementService.place`, fiindcă propoziția utilă
e „adu-o joi la grupa Python" și e utilă din minutul în care cineva a decis-o — luni, pentru o oră de
joi.

Două mesaje care au stat aici și nu mai stau:

- ~~**Recuperare câștigată → familia află în seara aceleiași zile.**~~ Un job de seară la 19:00, care
  citea creditele scrise în ziua aia. Nu se mai câștigă nimic, deci n-are ce anunța; ce știe familia
  acum e unde merge copilul, iar aia se știe înainte de oră, nu după.
- ~~**Recuperare care expiră → memento cu șapte zile înainte.**~~ Șters mai devreme, odată cu
  fereastra de o săptămână. Avertiza o familie ca să apuce să-și programeze o oră, iar familia nu-și
  programează nimic. Ce l-ar înlocui e o întrebare **către birou**, nu către familie: care dintre
  absențele anunțate săptămâna asta n-au fost încă plasate? Aia are acum un endpoint
  (`GET /attendance/replacements/unplaced`) și n-are încă ecran — vezi
  [Întrebări deschise](#întrebări-deschise).

**A existat aici și un mesaj „copilul tău n-a fost azi la curs", și a fost scos.** Merită scris de
ce, fiindcă e o decizie, nu o simplificare. Mesajul citea `Attendance.present = false`, iar catalogul
e exact lucrul pe care un profesor îl uită, îl completează târziu sau îl greșește:

- **uitat** — niciun rând, deci nimic nu pleca: tăcere fix în cazul pentru care exista mesajul, și
  care e oricum acoperit mai bine de mementoul de la 10:00;
- **completat târziu** — rularea de seară a zilei respective trecuse deja, iar nimic nu reia o zi
  din urmă, deci familia nu afla niciodată;
- **greșit tastat** — mesajul pleca, iar corectarea marcajului o jumătate de oră mai târziu **nu-l
  retrăgea**. Un părinte citise deja că cel mic lipsise de la oră.

Costurile nu sunt simetrice. O notificare care nu ajunge costă puțin: cazul urgent e telefonul
profesorului de pe ecranul de prezență (S6), care se întâmplă cât ora e încă în desfășurare. O
notificare care ajunge greșit costă o familie speriată.

**Mesajul despre mutare nu poate alarma pe nimeni**, și de asta a luat locul: pleacă doar acolo unde
familia a anunțat deja absența, deci ea știe că cel mic lipsește, iar mesajul îi spune partea pe care
n-o știe — unde să-l aducă în schimb. Un catalog greșit tastat nici n-o poate produce, fiindcă nu
catalogul o produce: o produce un om de la birou care mută un copil.

**Un rezumat săptămânal de absențe a fost cântărit și lăsat pentru [E17](E17-comunicare-notificari.md)
S6.** Ar rezolva și greșelile de tastare (se corectează până vineri) și completările târzii, dar
conținutul lui e slab: îi spune unui părinte care își aduce copilul la ușă exact ce știe deja.
Digest-ul își merită locul când poate căra ceva — absențe, mutări, factura care vine — și ăla e
mecanismul din S6, nu jumătatea lui cea mai puțin interesantă construită separat.

**Mesajul e tranzacțional** și nu consultă preferința de marketing din
[E17](E17-comunicare-notificari.md) S4 — nici n-ar avea cum: `queueOrRecord` nu primește deloc
preferința. O familie care a refuzat noutățile află în continuare unde a fost mutat cel mic. Și nu se
ramifică pe adresă: o familie fără email lasă un rând `undeliverable` în evidența din S5, în loc să
fie sărită tăcut.

Textul e un șablon E17/S2, deci școala îl poate rescrie fără deploy.

**Mementoul zilnic NU e cel de la minutul 15 și nu-l înlocuiește.** Sunt două întrebări diferite,
care se aseamănă doar la nume:

- **Cel de la minutul 15 e despre un copil.** Ora e în desfășurare, prezența nu e marcată, iar la un
  copil de 8 ani „nu e marcat prezent" și „nu a ajuns" sunt aceeași propoziție până probează cineva
  contrariul. Mai are ce să schimbe: un telefon.
- **Cel zilnic e despre catalog.** Ziua s-a terminat, ora a rămas fără nicio prezență, și cineva
  trebuie ori să completeze, ori să anuleze ședința. Nu mai poate salva pe nimeni; ține evidența
  întreagă.

**Livrat și mementoul de la minutul 15**, `apps/api/src/modules/class-session/late-register.job.ts`.
Un `@Interval` la 5 minute întreabă `findUnmarkedSessions` — **aceeași** metodă din spatele
mementoului zilnic și al lui `GET /class-sessions/unmarked` — și filtrează ce e în fereastră. Pentru
fiecare ședință găsită pleacă pe loc **un email separat** către birou, cu grupa, ora și sala.

Trei decizii, toate în fereastră și în cheie:

- **Fereastra se deschide la minutul 15 și se închide când se termină ora.** Capătul de sus e
  decizia care ține mementoul viu: singurul motiv pentru care mesajul ăsta există e că un telefon
  mai poate schimba răspunsul, iar după ce ultimul copil a plecat acasă nu mai poate — aia e
  treaba raportului de la 10:00, care o face mai bine. Efectul lateral e cel care contează în
  practică: un proces care a fost picat toată după-amiaza se trezește în liniște, nu cu douăsprezece
  alerte despre ore terminate demult. Nimic nu se pierde — ce ratează fereastra apare mâine
  dimineață în raport.
- **O alertă per ședință, niciodată repetată**: `dedupeKey`-ul e `late-register:<id>:<YYYY-MM-DDTHH:mm>`,
  ședința și ora ei de început. Fără cheie biroul ar primi același mesaj din 5 în 5 minute până se
  termină ora, fiindcă ședința rămâne în fereastră. Nu se re-armează dacă prezența rămâne nemarcată: o
  a doua copie nu spune nimic nou, iar ședința tot nemarcată la sfârșitul zilei e mesajul de a doua zi.
  Ora de început e în cheie fiindcă mutarea (S5) păstrează rândul: o ședință alertată la 16:15 și mutată
  apoi pe sâmbătă e sâmbătă o nouă ocazie, și primește o alertă proprie.
- **Un email per ședință, nu o listă per trecere.** Două grupe nemarcate în același minut sunt două
  telefoane către două persoane diferite, iar un singur email care le acoperă pe amândouă e unul
  dintre ele uitat. Raportul zilnic e o listă fiindcă acolo chiar e o listă de hârtii.

**Merge la birou, nu la profesor**, deși story-ul spune profesor: nu există entitate de profesor în
cod, doar rolurile `ADMIN` și `PARENT` — vine cu [E09](E09-personal-roluri.md). Până atunci biroul e
cel care poate suna, și e aceeași adresă `MAIL_OFFICE_ADDRESS` ca la raportul zilnic. Când E09 aduce
profesorul pe ședință, destinatarul e o linie de schimbat.

E un poll, nu un declanșator armat per ședință: un timer ar trebui re-armat după fiecare repornire,
după fiecare `POST /class-sessions/generate` și după fiecare anulare, iar un timer care n-a mai fost
re-armat arată exact ca o după-amiază liniștită. O interogare indexată la 5 minute nu se poate uita.

**Bucata rămasă din S7 nu mai are pe ce aștepta, deci S7 se închide așa cum e**: a doua linie către
părinte pentru absență aștepta mecanismul de rezumate din [E17](E17-comunicare-notificari.md) S6, iar
acela a fost construit și **scos prin decizie** — deci nu vine. Notificarea de absență din prima
versiune fusese oricum scoasă prin decizia de mai sus, iar mementourile de recuperare sunt livrate în
S4. Dacă rezumatele revin cândva, revine și ea, cu ele; până atunci nu e o datorie deschisă, e o
linie pe care școala a ales să n-o trimită. Iar amândouă mementourile
**se scriu azi în coadă și nu pleacă nicăieri în producție**: nu există producție — vezi
[Dependențe](#dependențe), imediat mai jos.

**Din [E15](E15-pricing-facturare.md) S9, amândouă mementourile apără bani, nu doar evidența.** O
ședință rămasă fără catalog nu se facturează nimănui, fiindcă nimic nu spune că s-a ținut — deci
alerta de la minutul 15 și raportul de la 10:00 sunt singurele două lucruri care mai pot aduce
catalogul înapoi cât timp cineva își mai aduce aminte ora. Nu se schimbă nimic în ele; se schimbă
cât costă să nu ruleze, și de asta țin de [E01](E01-infrastructura-medii.md) S4 ca oricare altul.

### S8 · Bifa de vacanță pe catalog

O coloană nouă pe ședință — `ClassSession.isVacation`, implicit `false` — pusă de cine face
catalogul, din ecranul de pe telefon (S6) și din `/admin/orar` (S5). Înseamnă un singur lucru:
**ora asta s-a ținut într-o vacanță**. Ce urmează din ea e o regulă de bani și stă în
[E15](E15-pricing-facturare.md) S9 — o ședință bifată se facturează doar copiilor marcați prezenți
la ea, în loc să se factureze întregii grupe. Aici se ține doar faptul.

**De ce pe ședință și nu la emitere.** Cine știe e profesorul din sală, în ziua aia. Peste trei
săptămâni, în fața ecranului de emitere, nu-și mai amintește nimeni care luni din decembrie a fost
vacanță și care a fost doar o zi cu patru copii. Un fapt se consemnează unde se află, nu unde se
folosește — același motiv pentru care `inTime` se îngheață la scriere în S3.

**Nu e `NonTeachingPeriod`, și cele două nu se unesc.** Calendarul din S2 înseamnă „școala e
închisă": ziua nu produce ședințe, iar cele deja generate se anulează. Bifa înseamnă aproape
opusul — școala e deschisă, ora se ține pentru cine vrea să vină, iar catalogul ei există. Un
singur mecanism cu ambele înțelesuri ar fi un cuvânt ambiguu exact în locul unde se decid banii.

Practic: **săptămânile de vacanță în care școala chiar predă nu se trec în `/admin/calendar`**.
Calendarul rămâne ce spune deja epicul mai sus, „o listă de zile în care nu se ține curs", ședințele
acelor săptămâni se generează normal și primesc bifa. Ce ar forța altă soluție, dacă apare vreodată:
o vacanță în care o locație e închisă iar alta ține cursuri, pe aceleași date. Atunci
`NonTeachingPeriod` capătă un tip; nu bifa un al doilea înțeles.

**Bifa se poate întoarce cât timp luna nu e facturată**, ca orice altceva de pe catalog. Ecranul de
emitere o arată oricum, lângă zilele lunii, deci una uitată sau pusă din greșeală se vede înainte
să plece ceva. După emitere e istorie, iar corectura devine o discuție despre o factură, nu despre
un rând.

**Ce nu face bifa:** nu anulează ședința, nu scutește pe nimeni de catalog și nu schimbă cine ocupă
un loc — un copil venit în vacanță stă pe scaunul lui ca în orice altă zi, la fel ca o probă sau o
recuperare (D7). Nu atinge nici mutările: o absență într-o zi bifată nu produce nimic de recuperat,
fiindcă familia aia nici nu plătește ora.

**Acceptanță:** o ședință bifată apare marcată în catalogul de pe telefon și în `/admin/orar`, bifa
se pune și se scoate dintr-o apăsare, iar `GET /attendance/session/:id/register` o întoarce — de
acolo o citește numărătoarea din [E15](E15-pricing-facturare.md) S9.

## Dependențe

[E11](E11-inscrieri-capacitate.md) pentru cine e înscris când.

**S1 și mementoul zilnic s-au livrat fără el.** Ședințele se generează din orarul grupei, iar cine e
în grupă se citește azi din `Child.group`, o singură referință — atât cere un orar. Dependența rămâne
reală pentru S3 și S4: „a fost mutat la altă grupă în săptămâna aia" e o afirmație despre o
înscriere, cu început și sfârșit, nu despre apartenența de moment la o grupă.

**[E10](E10-curriculum-module.md) nu mai e o dependență, fiindcă nu mai e.** S1 îl cerea pentru modul
și lecție; a fost tăiat de patron ca ne-MVP, iar S1 s-a livrat fără ele, cu prețul scris acolo:
orizont rulant în loc de generare pe durata modulului.

**[E17](E17-comunicare-notificari.md) e necesar pentru S5 și S7.** Amândouă au acceptanțe care se
măsoară într-un mesaj ajuns la cineva: anularea unei ședințe notifică toată grupa în sub cinci
minute, iar părintele află de o absență neanunțată în aceeași zi. Fără canal, S5 poate livra cel
mult anularea în sine, iar din S7 rămân doar butonul de apel și mementoul din interfață — partea care
ajunge la părinte fără ca el să deschidă portalul lipsește. Aceeași dependență ține și mesajul care
spune unde a fost mutat copilul.

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
grupele cu vizitatori; prea stricte și părinții se simt înșelați după ce au plătit o lună întreagă.
Școala le-a fixat: anunț până luni la 12:00, mutare în aceeași săptămână, atât. Riscul care rămâne e
al doilea — o familie care anunță marți nu primește nimic, și cineva de la birou va trebui să spună
asta la telefon.

## Definition of done

Fiecare ședință ținută are prezența completă. Absențele eligibile au drept de recuperare urmăribil.
Anulările notifică automat.

**Atins doar primul, și doar pe jumătatea care se poate verifica.** Ședința e o entitate, prezența
atârnă de ea, iar o oră rămasă fără catalog e detectabilă și se raportează o dată pe zi — deci
„prezența completă" nu mai e o speranță, e o listă. Ce lipsește ca să fie și _garantată_ e ecranul
din S6, care face marcarea destul de ieftină încât să se întâmple în timpul orei.

De la [E15](E15-pricing-facturare.md) S9, „prezența completă" nu mai e nici măcar o chestiune de
evidență: o ședință fără catalog e o ședință neîncasată, deci lista de nemarcate se citește cu alți
ochi.

Al doilea e atins altfel decât cerea propoziția. Nu există „drept de recuperare urmăribil", fiindcă
nu există drept: e urmăribilă **mutarea** — care copil a fost trimis la ce grupă, în ce săptămână, și
care absență anunțată n-a fost încă plasată. Regula de business care lipsea aici a venit între timp
de la școală, și e cea din S3 și S4.

Al treilea rămâne neatins: anulările care notifică cer un loc unde să ruleze coada, adică
[E01](E01-infrastructura-medii.md) S4. Mesajele se scriu; nu pleacă.

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

**Decizia asta a căzut de două ori, și a doua oară de tot.** Întâi odată cu E10: fără module, nu mai
există „per modul" de numărat și nici „valabilitate în module". Apoi odată cu S4: nu mai există nici
lucrul pe care îl numărau. Nu se ține un plafon de recuperări pentru că nu se acordă recuperări —
biroul mută un copil la altă grupă pentru o săptămână, iar ce limitează mutările nu e o cifră din
configurație, ci câte scaune are grupa gazdă în ora aia. Cele trei variabile de mai sus nu există
nicăieri în cod și nu trebuie reintroduse: singurele două numere ale regulii — luni, 12:00 — sunt
constante în `absence-notice.rules.ts`, unde o schimbare se vede în diff.

**S2 devine mai important decât părea.** Calendarul de vacanțe nu mai e doar pentru a sări ședințe:
după [E10](E10-curriculum-module.md), vacanțele _delimitează modulele_, deci calendarul determină
ce se facturează și când. Cele două epicuri se implementează împreună.

**Decizia asta a căzut odată cu E10.** Tăiat ca ne-MVP, nu mai există modul de delimitat, deci
calendarul de vacanțe nu mai atinge facturarea și redevine ce părea la început: o listă de zile în
care nu se ține curs, folositoare ca să nu se genereze ședințe degeaba. Se păstrează scrisă fiindcă
argumentul revine intact în ziua în care revine E10.

**Catalogul e semnalul că ora s-a ținut, iar din septembrie 2026 e și baza facturii.**
[E15](E15-pricing-facturare.md) S9 numără ședințele lunii din cataloage: una fără nicio prezență
înregistrată nu se facturează nimănui, una ținută se facturează întregii grupe — chiar și una al
cărei catalog e făcut integral pe absențe, fiindcă semnalul e catalogul, nu numărul de prezenți —,
iar una bifată vacanță (S8) doar copiilor marcați prezenți la ea. Pentru epicul ăsta consecința e că două decizii
luate din alte motive devin deodată importante pentru bani, și nu se mai pot slăbi:

- **Marcarea prezenței nu trece ședința în `ținută`.** „Are prezențe" și „e ținută" rămân două
  semnale independente, iar cel după care se numără e primul. Dacă vreodată marcarea ar începe să
  scrie și starea, „nemarcat" ar dispărea ca stare, iar cu el și singura definiție a orei
  neîncasate.
- **Ștergerea unui interval de vacanță nu reactivează ședințele anulate** (S2), iar regenerarea nu
  învie ce s-a anulat (S1). Amândouă erau despre onestitatea istoricului; acum sunt și despre a nu
  factura de două ori o lună închisă.

Ce **nu** se schimbă: prezența rămâne a profesorului, iar niciun ecran de catalog nu arată sume.
Un profesor care vede prețul lângă numele copilului marchează altfel.

## Întrebări deschise

Niciuna nu ține pe loc ce s-a livrat; fiecare spune ce blochează.

- Mutarea se poate face în cealaltă locație? **Nu blochează S4**, care e livrat: azi lista de ore
  oferite nu se uită deloc la adresă, deci le arată pe amândouă. Rămâne deschisă fiindcă e o decizie
  de business — un părinte care conduce douăzeci de minute în plus într-o săptămână oarecare poate să
  prefere să piardă ora — și fiindcă azi biroul e cel care o ia, de la caz la caz, uitându-se la
  numele locației din listă.
- **Cine îi spune biroului ce absențe din săptămâna asta n-au fost încă plasate?** Întrebarea are
  acum răspuns — `GET /attendance/replacements/unplaced` — dar n-are cine s-o pună: endpoint-ul nu e
  legat de niciun ecran și nimic nu-l citește la o oră fixă. **Nu blochează regula**, care e livrată;
  blochează faptul că cineva poate uita să mute un copil și nimic nu-l întreabă.
- Cine reînnoiește orizontul de opt săptămâni, și când? Azi e o cerere HTTP pe care o face un
  dezvoltator. Variantele sunt un buton în admin sau un cron lângă cel de la ora 10:00 — al doilea e
  aproape gratuit acum, dar are aceeași problemă ca restul: cere un proces care rulează continuu.
  **Nu blochează nimic din S1**, care funcționează; e o gaură de operare care se închide fie în
  admin, fie odată cu [E01](E01-infrastructura-medii.md) S4.
