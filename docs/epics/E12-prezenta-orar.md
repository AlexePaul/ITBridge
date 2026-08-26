# E12 · Prezență, recuperări și orar

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E11 · **Blochează:** E13, E21

## Problemă

Modulul de prezență există și funcționează la nivel de bază: `POST /attendance/:groupId` marchează,
`GET /attendance/child/:childId` citește. `Attendance` are copil, grupă, dată, oră de început, tip
și un boolean `present`.

Detaliul interesant e că `type` există deja, `varchar` cu valoarea implicită `'normal'`, ceea ce
sugerează că nevoia de recuperări a fost anticipată dar nu implementată.

Ce lipsește:

- **Absența nu are motiv și nu e anunțată.** Un părinte nu are cum să anunțe că lipsește copilul, iar
  profesorul nu știe dinainte pe cine să aștepte.
- **Nu există recuperări.** Când trecerea la facturarea pe modul din [E15](E15-pricing-facturare.md)
  va promite un număr fix de ședințe, absența devine o obligație contractuală: dacă părintele a
  plătit 12 ședințe și copilul a lipsit la două, ori le recuperează, ori i se datorează ceva.
  Astăzi nu există mecanismul.
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

- Entitatea `Session` — ședința programată.
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

`Session`: grupă, modul, lecție din [E10](E10-curriculum-module.md), dată, interval, sală, profesor,
stare (`programată`, `ținută`, `anulată`, `mutată`). Generate automat la începutul modulului din
programul grupei, apoi editabile individual.

`Attendance` se leagă de `Session`, nu de dată plus oră. Constrângerea
`@Unique(['child', 'date', 'startTime'])` devine `@Unique(['child', 'session'])`, ceea ce e și mai
corect, și mai simplu.

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
prezentare, dreptul se consumă. Ședința de recuperare are `type` distinct, folosind câmpul care
există deja.

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

Absență nemarcată de profesor la o oră după curs — memento către profesor. Copil absent nemotivat —
notificare către părinte. Recuperare expirând în curând — memento. Toate prin
[E17](E17-comunicare-notificari.md).

**Acceptanță:** părintele află de o absență neanunțată în aceeași zi.

## Dependențe

[E11](E11-inscrieri-capacitate.md) pentru cine e înscris când.

## Riscuri

**Migrarea prezențelor existente la modelul de ședințe cere reconstruirea ședințelor istorice** din
combinația dată plus oră. Unde vechea constrângere de unicitate a forțat ore decalate — vezi
[E08](E08-multi-locatie.md) — reconstrucția va fi imperfectă.

**Regulile de recuperare sunt o decizie de business, nu tehnică.** Prea generoase și se umplu
grupele cu recuperări; prea stricte și părinții se simt înșelați după ce au plătit un modul întreg.

## Definition of done

Fiecare ședință ținută are prezența completă. Absențele eligibile au drept de recuperare urmăribil.
Anulările notifică automat.

## Decizii luate

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
