# E12 · Prezență, recuperări și orar

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E11 · **Blochează:** E13, E14, E21

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
  se consumă. Când trecerea la facturarea pe modul din [E15](E15-pricing-facturare.md) va promite un
  număr fix de ședințe, absența devine o obligație contractuală: dacă părintele a plătit 12 ședințe
  și copilul a lipsit la două, ori le recuperează, ori i se datorează ceva.
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

### S2 · Calendar de vacanțe

Vacanțele școlare și zilele libere legale sunt configurabile, pe locație — pentru cazul în care o
locație are program diferit. Generarea de ședințe le ocolește automat.

**Acceptanță:** un modul de 12 ședințe care traversează vacanța de iarnă se termină cu două
săptămâni mai târziu, corect calculat, fără intervenție.

### S3 · Absențe anunțate

Un părinte anunță din portal, cu motiv și termen minim. Profesorul vede dinainte cine lipsește.
Absența anunțată în termen dă drept la recuperare; cea neanunțată, nu — sau după regula pe care o
stabiliți.

**Acceptanță:** anunțarea până la ora X în ziua cursului marchează absența ca anunțată și creează
dreptul de recuperare.

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

### S5 · Anulări și mutări

Un profesor bolnav, o zi de zăpadă: ședința se anulează sau se mută, toți părinții grupei sunt
notificați automat, iar dacă se anulează, toți copiii primesc drept de recuperare.

**Acceptanță:** anularea unei ședințe notifică toată grupa în sub cinci minute și creează drepturile.

### S6 · Marcarea prezenței pe telefon

Un ecran: grupa de azi, lista copiilor cu poză, apăsare pentru prezent sau absent, salvare automată.
Funcționează pe conexiune slabă și reține local dacă pică rețeaua.

**Acceptanță:** marcarea unei grupe de zece copii durează sub 20 de secunde pe telefon.

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

## Dependențe

[E11](E11-inscrieri-capacitate.md) pentru cine e înscris când.

**[E17](E17-comunicare-notificari.md) e necesar pentru S5 și S7.** Amândouă au acceptanțe care se
măsoară într-un mesaj ajuns la cineva: anularea unei ședințe notifică toată grupa în sub cinci
minute, iar părintele află de o absență neanunțată în aceeași zi. Fără canal, S5 poate livra cel
mult anularea și drepturile de recuperare, iar din S7 rămân doar butonul de apel și mementoul din
interfață — partea care ajunge la părinte fără ca el să deschidă portalul lipsește. Aceeași
dependență ține și mementourile de recuperare expirată.

## Riscuri

**Regulile de recuperare sunt o decizie de business, nu tehnică.** Prea generoase și se umplu
grupele cu recuperări; prea stricte și părinții se simt înșelați după ce au plătit un modul întreg.

## Definition of done

Fiecare ședință ținută are prezența completă. Absențele eligibile au drept de recuperare urmăribil.
Anulările notifică automat.

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
după [E10](E10-curriculum-module.md), vacanțele *delimitează modulele*, deci calendarul determină
ce se facturează și când. Cele două epicuri se implementează împreună.

## Întrebări deschise

- Recuperarea se poate face în cealaltă locație?
