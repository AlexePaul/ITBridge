# E07 · Securitate, GDPR și consimțământ

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E04, E05 · **Blochează:** E14, E19

## Problemă

Platforma procesează date despre **minori**. În Uniunea Europeană asta e categoria cu cel mai
strict regim, iar școala e operator de date, nu intermediar. Starea actuală nu susține asta.

- **O cheie privată reală e în istoricul git**, într-un repo public. Vezi
  [E01](E01-infrastructura-medii.md), S1.
- **Secretele JWT au fallback tăcut** către valori publice. Vezi [E05](E05-robustete-backend.md), S3.
- **Nu există politică de confidențialitate, nici banner de cookie-uri**, deși site-ul e public și
  se adresează unui public din UE.
- **Nu există noțiune de consimțământ.** [E14](E14-proiecte-elevi.md) urmează să publice munca unor
  copii, iar [E19](E19-seo-geo.md) să o folosească drept conținut de marketing. Fără consimțământ
  parental înregistrat, ambele sunt ilegale.
- **Nu există audit log.** Un admin poate șterge o factură, schimba o sumă sau modifica datele unui
  copil, fără urmă.
- **Nu există export sau ștergere de date la cerere**, deși sunt drepturi pe care un părinte le
  poate exercita oricând, cu termen legal de răspuns.
- **Datele de contact ale copiilor și părinților nu sunt clasificate.** Nimic nu spune ce e sensibil
  și ce nu, deci nimic nu împiedică o dată personală să ajungă într-un log sau într-un raport de
  eroare.

## Rezultat

Poți răspunde în scris, cu dovezi, la: ce date țineți despre copilul meu, cine le-a văzut, pe ce
temei, cât le păstrați, și cum le ștergeți. Publicarea muncii unui copil se întâmplă doar cu
acordul explicit al părintelui, revocabil.

## În scop

- Inventar de date și clasificare.
- Consimțământ parental granular, cu istoric.
- Audit log pe acțiunile administrative.
- Export și ștergere la cerere.
- Politică de confidențialitate, termeni, banner de cookie-uri.
- Managementul secretelor.
- Contracte de prelucrare cu furnizorii.

## În afara scopului

- Consultanță juridică. Acest epic pregătește platforma; textele legale le validează un avocat.

## Story-uri

### S1 · Inventar și clasificare

Un tabel cu fiecare câmp de date personale: unde e stocat, de ce, pe ce temei legal, cât se
păstrează, cine îl poate vedea. Include datele copiilor — nume, dată de naștere, prezență, proiecte,
fotografii.

**Acceptanță:** tabelul e complet și fiecare câmp are temei legal identificat.

### S2 · Consimțământ parental

Entitate de consimțământ, legată de `Profile`, granulară pe scop: publicarea proiectelor pe site,
fotografii în materiale de marketing, comunicări comerciale, partajarea proiectului cu alți părinți
din grupă. Fiecare cu dată, versiune de text acceptat, și posibilitate de revocare.

Revocarea trebuie să aibă efect **retroactiv și automat**: un proiect publicat dispare de pe site
când părintele retrage acordul, fără intervenție manuală.

**Acceptanță:** [E14](E14-proiecte-elevi.md) nu poate publica un proiect fără consimțământ activ.
Revocarea îl retrage în sub un minut.

### S3 · Audit log

Fiecare acțiune administrativă care atinge date personale sau bani lasă o înregistrare: cine, ce,
când, valoarea veche și cea nouă. Imutabil, cu retenție separată de datele operaționale.

**Acceptanță:** "cine a schimbat suma facturii 412 și când" are răspuns în sub un minut.

### S4 · Export și ștergere

Un părinte poate cere, prin portal, exportul datelor sale și ale copiilor, în format citibil, și
ștergerea contului. Ștergerea respectă obligațiile contabile: facturile se păstrează, dar se
anonimizează în rest.

**Acceptanță:** ambele fluxuri funcționează capăt-la-capăt, cu termen sub 30 de zile.

### S5 · Documente legale

Politică de confidențialitate, termeni și condiții, politică de cookie-uri, banner de consimțământ
care chiar blochează scripturile neesențiale până la accept. Versionate, cu istoric al acceptărilor.

**Acceptanță:** un vizitator nou nu are niciun cookie neesențial înainte de a accepta.

### S6 · Managementul secretelor

Secretele stau într-un magazin dedicat, nu în fișiere pe VPS și nu în repo. Rotație documentată.
`.env.example` conține doar chei, niciodată valori.

Pe EC2, accesul la S3 se face prin **IAM instance role**, nu prin chei statice.
`AWS_ACCESS_KEY_ID` și `AWS_SECRET_ACCESS_KEY` — astăzi transmise ca variabile de mediu și
vizibile în `docker-compose.yml` — dispar complet din configurație. Rolul primește drepturi doar
pe bucket-ul de fișiere, doar operațiile necesare. E cea mai ieftină îmbunătățire de securitate
din tot epicul: elimină o clasă întreagă de secrete în loc să le gestioneze.

**Acceptanță:** o căutare de secrete în repo, cu o unealtă automată, nu găsește nimic. Scanarea
rulează în CI. Nicio cheie AWS statică nu există în vreun mediu.

### S7 · Contracte de prelucrare

Acorduri de prelucrare a datelor cu fiecare furnizor care atinge date personale: găzduire, S3,
furnizorul de email din [E17](E17-comunicare-notificari.md), Sentry, Vercel. Preferință pentru
procesare în UE.

**Acceptanță:** lista furnizorilor e completă, cu locul de procesare și statusul acordului.

## Dependențe

[E04](E04-migrari-date.md) pentru schema de consimțământ și audit,
[E05](E05-robustete-backend.md) pentru filtrarea datelor din loguri.

## Riscuri

**Consimțământul adăugat după ce proiectele sunt deja publicate e mult mai scump.** Trebuie
construit *înainte* de [E14](E14-proiecte-elevi.md), nu retrofitat. E motivul pentru care acest
epic apare în pista de fundație și nu la sfârșit.

**Retenția contabilă intră în conflict cu dreptul la ștergere.** Facturile trebuie păstrate ani de
zile; datele personale trebuie șterse la cerere. Rezolvarea e anonimizarea, nu ștergerea, și
trebuie proiectată explicit.

## Definition of done

Fiecare categorie de date personale are temei legal și termen de păstrare. Consimțământul e
granular, revocabil și respectat automat. Un audit extern ar găsi documentație, nu improvizație.

## Întrebări deschise

- Cine e responsabilul cu protecția datelor? La dimensiunea asta nu e obligatoriu un DPO formal,
  dar cineva trebuie să fie punctul de contact.
- Vârsta de la care copilul însuși are drepturi de acces? În România, consimțământul digital e la 16
  ani, dar copiii școlii sunt sub. Deci contul e mereu al părintelui.
