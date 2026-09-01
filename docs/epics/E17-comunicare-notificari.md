# E17 · Comunicare și notificări

**Status:** în lucru · **Pistă:** Comunicare · **Depinde de:** E05, E06 · **Blochează:** E11, E12, E14, E16, E20

**A început din altă parte.** Nimeni nu a pornit E17 ca epic. A pornit
[E12](E12-prezenta-orar.md), iar jobul zilnic cerut de patron — un email către școală cu ședințele
de ieri rămase fără prezență marcată — avea nevoie de un canal pe care `apps/api` nu îl avea. S-a
construit exact atât cât cerea el: `MailService` din S1 și outbox-ul cu scheduler-ul lui din S3,
amândouă parțiale. S2 și S4–S8 nu există deloc.

Două lucruri de citit înainte de orice altceva: **scheduler-ul nu rulează în producție până la
[E01](E01-infrastructura-medii.md) S4**, fiindcă backend-ul nu e deployat nicăieri și nu există
fișierul de ecosistem care să-l fixeze pe o singură instanță; și **niciun mesaj nu a plecat încă
spre un părinte** — singurul destinatar de până acum e adresa școlii.

## Problemă

Platforma nu trimite niciun mesaj către părinți. Un furnizor de email există însă deja, și e în
producție: formularul public de contact trimite prin **Resend**, din
`apps/web/server/api/contact.post.ts`, de pe un domeniu de expediere verificat, iar `RESEND_API_KEY`
și `CONTACT_FROM` sunt declarate în `turbo.json` la `globalEnv` și setate în Vercel.

Ce lipsește e tot restul. `apps/api` nu are niciun serviciu de mail — un `@nestjs/mailer` sau
echivalent nu apare în `apps/api/package.json` — nu există șabloane, nu există coadă, nu există
evidență a ce s-a trimis. Iar canalul existent nu ajută direct: ruta de contact e o funcție
serverless pe Vercel, care nu vede baza de date.

Distincția contează, fiindcă schimbă ce e S1: nu se alege un furnizor, se confirmă unul.

**Paragraful de dinainte descrie starea de până la [E12](E12-prezenta-orar.md)**, și se citește ca
motivul pentru care s-a construit ce s-a construit. Între timp `apps/api` are un `MailService` și o
coadă — S1 și S3, amândouă parțiale. Restul enumerării stă în picioare: nu există șabloane și nu
există o evidență a ce s-a trimis, iar către un părinte tot nu a plecat nimic.

Toată comunicarea cu părinții se face astăzi în afara platformei — cel mai probabil pe WhatsApp și
telefon. Funcționează la o locație și douăzeci de familii. La două locații nu mai scalează, iar
informația nu lasă urmă: nimeni nu poate spune dacă un părinte a fost anunțat de o anulare.

Șapte epic-uri depind de existența acestui canal:

| Epic                               | Ce trimite                                          | Cine declanșează              |
| ---------------------------------- | --------------------------------------------------- | ----------------------------- |
| [E11](E11-inscrieri-capacitate.md) | loc eliberat de pe lista de așteptare               | eveniment, automat            |
| [E12](E12-prezenta-orar.md)        | absență, anulare de ședință, recuperare care expiră | eveniment, automat            |
| [E13](E13-progres-evaluare.md)     | raport de final de modul, certificat                | închiderea modulului, automat |
| [E14](E14-proiecte-elevi.md)       | documentele copilului                               | **adminul, pe grupă**         |
| [E15](E15-pricing-facturare.md)    | factură emisă                                       | emiterea, automat             |
| [E16](E16-plati-fiscal.md)         | confirmare de plată, memento de restanță            | eveniment, plus job programat |
| [E20](E20-achizitie-lead.md)       | confirmare de programare la lecția de probă         | eveniment, automat            |

A treia coloană e o decizie, nu o observație. Tot ce scrie „automat" pleacă fiindcă s-a întâmplat
ceva în bază: o factură emisă, o ședință anulată, un loc eliberat. Rândul lui
[E14](E14-proiecte-elevi.md) nu mai e așa. **Documentele copiilor pleacă atunci când adminul apasă un
buton**, după ce s-a uitat pe lista de documente noi ale grupei — nu automat, seara. E un mod de
declanșare distinct, cu propriul story, S8, și cu propriul motiv în
[Decizii luate](#decizii-luate).

Cinci dintre ele sunt **blocate**, nu doar interesate: au criterii de acceptanță care nu pot fi
îndeplinite fără canalul de aici. [E11](E11-inscrieri-capacitate.md) S2 — „eliberarea unui loc
declanșează notificarea în sub un minut". [E12](E12-prezenta-orar.md) S5 și S7 — „anularea unei
ședințe notifică toată grupa în sub cinci minute", „părintele află de o absență neanunțată în aceeași
zi". [E16](E16-plati-fiscal.md) S6 și S7 — confirmarea de plată în aceeași zi și memento-urile de
restanță. [E14](E14-proiecte-elevi.md) — documentul unui copil ajunge la părintele lui prin email;
acolo s-a schimbat cine apasă butonul, nu faptul că e nevoie de canal.
[E20](E20-achizitie-lead.md) S2 și S3 — confirmarea programării și mementoul cu o zi înainte, plus
recontactarea celor care nu s-au prezentat; epicul își numește singur mementoul cerință, nu
rafinare, fiindcă fără el neprezentările la o probă gratuită ajung frecvent la o treime. De aceea
antetul spune
`Blochează: E11, E12, E14, E16, E20`.

[E13](E13-progres-evaluare.md) și [E15](E15-pricing-facturare.md) rămân în tabel, dar nu sunt
blocate: raportul de final de modul și factura emisă se produc și se văd în portal fără ca vreun
email să plece. Rândurile lor spun ce **ar** trimite, nu de ce depind.

Dacă fiecare își construiește propriul mecanism, ai șapte implementări și un părinte care primește
șapte emailuri pe zi.

## Rezultat

Un singur sistem de mesaje, cu șabloane, preferințe și evidență. Un părinte primește ce trebuie,
când trebuie, atât cât a acceptat.

## În scop

- Confirmarea furnizorului de email și livrarea fiabilă.
- Șabloane versionate, în română.
- Coadă cu reîncercare, în Postgres, folosită și de joburile programate ale celorlalte epic-uri.
- Preferințe și dezabonare.
- Evidența livrărilor, inclusiv a celor care nu au avut unde să plece.
- Anunțuri către grupe și locații.
- Trimitere declanșată de admin, pe grupă, cu stare per document.

## În afara scopului

- **WhatsApp, sub orice formă.** Patronul a respins canalul secundar pentru MVP. Ce s-a propus și a
  căzut era o pagină de admin cu câte un link `wa.me` per copil, cu textul precompletat — nu un
  buton de WhatsApp pe site-ul public. Se consemnează în [Decizii luate](#decizii-luate) ce formă ar
  lua dacă se reia, ca argumentul să nu fie refăcut de la zero.

- Conținutul de marketing — vezi [E20](E20-achizitie-lead.md). Aici se construiește țeava.

## Story-uri

### S1 · Furnizorul și livrabilitatea

Furnizorul e deja ales: **Resend**, în uz pentru formularul de contact, cu domeniul de expediere
verificat. S1 nu alege, confirmă — rămâne de verificat că acoperă volumul de aici, care e alt ordin
de mărime decât un formular de contact, și cerințele de prelucrare din
[E07](E07-securitate-gdpr.md). Dacă volumul cere alt plan, întrebarea de cost se pune înainte de S3,
nu după.

**Trimiterea către părinți pleacă din `apps/api`, printr-un `MailService`.** Ruta Nitro
`apps/web/server/api/contact.post.ts` rămâne exclusiv pentru formularul public. Motivul e structural,
nu de stil: pe Vercel ruta aia e o funcție serverless care nu vede baza de date, iar fiecare mesaj
din tabelul de mai sus se compune din date din Postgres — care părinte, care factură, care ședință.

SPF, DKIM și DMARC configurate pe domeniu — fără ele, emailurile ajung în spam, iar tot epicul devine
inutil. Domeniul e deja verificat pentru expedierea din formular; ce se adaugă e adresa de expediere
către părinți, cu cheia ei separată (vezi [Decizii luate](#decizii-luate)).

Locul de procesare și acordul de prelucrare rămân în [E07](E07-securitate-gdpr.md) S7. Aici se
numește furnizorul, ca lista de acolo să se poată completa.

**Precondiție, o interogare de rulat o dată:** câți părinți au azi `Profile.email` completat.
Coloana e `nullable` (`apps/api/src/entities/profile.entity.ts`), iar înregistrarea cere azi doar
username și parolă (`apps/api/src/modules/auth/dto/register.dto.ts`), deci răspunsul poate fi
„puțini". Dacă e așa, colectarea adreselor e primul pas al epicului, nu o consecință a lui: restul
story-urilor construiesc capacitatea de a trimite, dar nu și cui.

Regula nouă — adresă obligatorie și confirmată la înregistrare, vezi
[Decizii luate](#decizii-luate) — **nu răspunde la întrebarea asta**: se aplică înregistrărilor de
după ea, nu familiilor deja în bază. Interogarea rămâne de rulat, iar recuperarea adreselor lipsă e
muncă de recontactare, nu de cod.

**Acceptanță:** un test de livrabilitate trece cu punctaj bun. Emailurile ajung în inbox la Gmail,
Yahoo și Outlook.

**Livrat parțial — partea de cod, nu partea de operare.**
`apps/api/src/modules/mail/mail.service.ts` e singurul loc din backend care vorbește cu furnizorul:
un POST autentificat pe `https://api.resend.com/emails`, fără SDK, aceeași cerere pe care ar
face-o pachetul `resend`. Nimic din aplicație nu îl cheamă direct — totul trece prin outbox-ul din
S3, altfel dispare exact garanția pentru care există el.

Cheile sunt separate, cum s-a decis: `MAIL_RESEND_API_KEY` și `MAIL_FROM`, distincte de
`RESEND_API_KEY` și `CONTACT_FROM` ale rutei publice, declarate în `turbo.json` prin `MAIL_*` și
validate în `apps/api/src/config/env.validation.ts`. Amândouă sunt **opționale**: fără ele
aplicația pornește normal, `MailService` o spune o dată la boot, iar mesajele se scriu oricum în
coadă. Configurația lipsă e tratată ca eșec **temporar**, nu permanent, deci un deploy care pune
cheia recuperează ce s-a acumulat — dar numai în cele ~2 ore de reîncercări din S3, după care
rândurile trec pe `failed` cu motivul scris pe ele. Expeditorul din `.env.example` e `notificari@`,
nu `noreply@`: un părinte care primește un anunț de anulare apasă „răspunde".

**Rămâne tot ce cere acceptanța de mai sus**, fiindcă nimic din ea nu se poate face din repo:
testul de livrabilitate la Gmail, Yahoo și Outlook, SPF/DKIM/DMARC verificate pentru adresa nouă de
expediere, și întrebarea de volum și de plan. Rămâne și **precondiția din capul story-ului** — câți
părinți au azi `Profile.email` completat. Niciuna nu s-a putut atinge: a doua cheie nu e emisă,
backend-ul nu rulează nicăieri, iar singurul destinatar de până acum e adresa școlii din
`MAIL_OFFICE_ADDRESS`. Ce s-a livrat e capacitatea de a trimite, nu dovada că ajunge.

### S2 · Șabloane

Șabloane versionate, cu date interpolate, în română, responsive, cu variantă text. Previzualizabile
de admin înainte de trimitere.

**Acceptanță:** un șablon se modifică fără deploy. Fiecare are previzualizare cu date de test.

**Livrat**, cu o împărțire care e tot designul: **implicitele în cod, editările în bază.**
`template-defaults.ts` ține formularea din fabrică a fiecărui șablon, lângă variabilele pe care le
înțelege și datele de test ale previzualizării; tabelul `mail_templates` ține doar ce a editat
școala. „Revino la original" înseamnă ștergerea rândului, un deploy cu texte mai bune nu calcă
peste editările nimănui, iar acceptanța — modificabil fără deploy — e rândul însuși. Versiunea
numără salvările; 1 e codul.

**Setul de chei e închis**: editorul personalizează formularea, nu poate inventa un tip de mesaj,
fiindcă un șablon fără expeditor e un rând pe care nu-l va citi nimic. Patru chei azi — confirmarea
adresei, cont aprobat, cont refuzat, plus mesajul intern către birou — adică exact mesajele de cont
din E11/S2, care au fost mutate de pe funcțiile din `account-mail.ts` (șters) pe
`MailTemplateService.render`. Celelalte trei expeditoare (mementoul E12, oferta de listă de
așteptare, livrarea de proiecte E14) compun liste în corp și rămân pe compunere directă; drumul lor
e să precalculeze lista într-o variabilă, când va merita.

**Interpolarea e `{{nume}}` și atât** — fără condiții, fără bucle: un text editat într-un textarea
nu are voie să aibă un limbaj de programare în el. Valorile se scapă în varianta HTML și rămân
întregi în text (un părinte pe nume O'Brien&Co e un nume, nu markup), iar un placeholder greșit
rămâne **vizibil** în loc să dispară — previzualizarea e plasa de siguranță și nu poate prinde ce
nu se vede. Varianta HTML există acum pe mesajele către părinți: un cadru cu stiluri inline, că
clienții de mail aruncă `<style>`-urile cu entuziasm.

**Ecranul** e `/admin/emailuri`, construit pe componentele din E18 S5a: listă cu insignă
„Personalizat", editor cu subiect/text/HTML și lista variabilelor, previzualizare **a ce e tastat,
nu a ce e salvat** — cererile sunt secvențiate cu un token, ca un răspuns întârziat pentru o
versiune veche a draftului să nu-l acopere pe cel curent — și revenire la v1 prin modal, cu
propoziția care contează: mesajele deja în coadă nu se schimbă, ele au fost scrise cu textul
valabil la momentul cozii. Outbox-ul stochează corpuri **randate**, prin decizia veche din S3, deci
un șablon editat între coadă și trimitere nu rescrie un mesaj deja aprobat.

### S3 · Coadă și reîncercare

Trimiterea e asincronă, cu reîncercare la eșec temporar și oprire la eșec permanent. Nicio operațiune
de business nu așteaptă după un email — o factură se emite chiar dacă furnizorul de email e picat.

Mecanismul, scris aici o dată ca să nu-l inventeze fiecare epic pe al lui:

- Un tabel `outbox`: destinatar, șablon, datele de interpolat, stare, număr de încercări, momentul
  următoarei încercări. Rândul se scrie **în aceeași tranzacție** cu operațiunea care îl provoacă,
  deci factura și mesajul ei se salvează sau se pierd împreună. Fără asta apare exact starea de care
  se plânge Problema: ceva s-a întâmplat, nimeni nu a fost anunțat, și nimeni nu poate spune care.
- Un scheduler care ia loturi cu `SELECT … FOR UPDATE SKIP LOCKED`. Rândurile luate de o trecere sunt
  invizibile pentru alta, deci două treceri suprapuse nu trimit același mesaj de două ori și nici nu
  se blochează una pe alta.
- Reîncercare cu pauză crescătoare și oprire după N încercări. Rândul oprit **rămâne vizibil** ca
  eșec permanent în evidența din S5 — nu se șterge și nu dispare într-un log.
- Scheduler-ul rulează **într-o singură instanță**, fixat în fișierul de ecosistem din
  [E01](E01-infrastructura-medii.md) S4. Acela lasă deschis modul cluster; într-un cluster, un job
  neprotejat rulează în fiecare worker.

Substratul e Postgres, nu Redis — vezi [Decizii luate](#decizii-luate).

Coada nu e doar pentru emailuri. Patru story-uri din alte epic-uri presupun deja un job programat,
fără să spună al cui e: [E15](E15-pricing-facturare.md) S3 (a doua tranșă, la mijlocul modulului —
decizie luată, nu propunere), [E16](E16-plati-fiscal.md) S3 (emiterea temperată sub limita SmartBill
de 3 apeluri pe secundă), [E16](E16-plati-fiscal.md) S7 (memento-urile de restanță) și
[E04](E04-migrari-date.md) S5 (retenția). Toate folosesc mecanismul de aici. Altfel ies patru cozi,
fiecare cu propria reîncercare și propria idee despre ce înseamnă un eșec permanent.

**Coada rămâne necesară și acolo unde declanșatorul e un om.** Trimiterea pe grupă din S8 e un
singur click care produce zece-douăzeci de mesaje, fiecare către alt părinte, în aceeași secundă —
exact tiparul în care furnizorul răspunde cu o limitare de rată la al șaptelea. Fără outbox,
jumătate din grupă ar rămâne fără document și nimeni n-ar ști care jumătate. Cu el, butonul răspunde
„s-a pus la trimitere", nu „s-a trimis", iar reîncercarea e treaba scheduler-ului. Deci S3 nu se
îngustează fiindcă E14 a ieșit din lista de joburi programate; declanșatorul s-a mutat, mecanismul
nu.

Driftul a început deja. `apps/api/src/modules/auth/session.service.ts:38` programează purjarea
sesiunilor expirate cu un `setInterval` propriu, iar comentariul de deasupra spune de ce:
`@nestjs/schedule` e ESM și nu se încarcă din jest, același motiv pentru care lipsește și
`@nestjs/config`. **Obstacolul e real și se rezolvă în S3, nu se presupune rezolvat**: fie
configurația jest ajunge să încarce pachetul, fie scheduler-ul rămâne un interval simplu, pornit
într-un singur loc. Alegerea schimbă câteva linii de bootstrap, nu mecanismul de mai sus, care e
integral în Postgres. Purjarea sesiunilor se mută pe același scheduler odată ce el există.

**Acceptanță:** furnizorul indisponibil o oră nu pierde niciun mesaj și nu blochează nimic. Două
treceri simultane ale scheduler-ului nu trimit același mesaj de două ori.

**Livrat parțial. Mecanismul e întreg; nu rulează nicăieri și îl folosește un singur apelant.**

Ce există: tabelul `outbox`, din migrarea `1787994566464-ClassSessionsAndOutbox.ts`, cu entitatea
`apps/api/src/entities/outbox-message.entity.ts`, plus `OutboxService` și `OutboxDispatcher` în
`apps/api/src/modules/mail/`.

- `queue()` primește `EntityManager`-ul apelantului, deci rândul se scrie **în aceeași tranzacție**
  cu operațiunea care îl provoacă. Duplicatul se refuză cu `ON CONFLICT DO NOTHING` pe `dedupeKey`,
  nu cu o excepție prinsă: o instrucțiune eșuată în tranzacția apelantului o abortează pe toată, deci
  un mesaj repetat ar fi dus factura cu el.
- Revendicarea e `SELECT … FOR UPDATE SKIP LOCKED`, într-o tranzacție separată de trimitere —
  altfel un lot de 25 ar ține 25 de rânduri blocate cât e furnizorul de lent. Încercarea se numără
  **la revendicare**, nu după răspuns, iar `nextAttemptAt` se mută înainte de eliberare: un proces
  ucis la mijloc nu pierde nimic și nu retrimite imediat.
- Pauză crescătoare: 2 minute, dublate, plafon o oră, 7 încercări. Ultima cade la ~2 ore, adică
  dincolo de „furnizor picat o oră" din acceptanță, nu exact pe ea. Un refuz permanent — 4xx, mai
  puțin 408 și 429 — oprește rândul din prima, fără să aștepte epuizarea celor șapte: aceeași cerere
  ar primi același refuz.
- 550 ms între trimiterile aceluiași lot, fiindcă planul curent Resend dă două cereri pe secundă;
  fără pauză, a doua jumătate a lotului se întoarce 429 și coada își petrece timpul cerându-și scuze
  singură.
- Scheduler la 30 de secunde, o singură trecere odată, oprit de `MAIL_OUTBOX_ENABLED=false` —
  suitele de integrare o setează, ca o trecere de fundal să nu miște rândurile sub aserțiuni.
- **Obstacolul cu `@nestjs/schedule` s-a rezolvat, prin versiune, nu prin configurație de jest.**
  Story-ul cerea să nu fie presupus rezolvat: v12 exportă ESM și moare în ts-jest, v6 e CommonJS și
  se încarcă, deci dependența e fixată la `^6.0.1`. Nimic din setup-ul de teste nu trebuie să știe
  că pachetul există.

Ce lipsește:

- **Scheduler-ul nu rulează în producție**, și nu e o omisiune: nu există unde. Backend-ul nu e
  deployat, iar fixarea pe o singură instanță se scrie în fișierul de ecosistem din
  [E01](E01-infrastructura-medii.md) S4, care nu există. `FOR UPDATE SKIP LOCKED` face două treceri
  inofensive una față de alta, dar doi workeri PM2 s-ar trezi amândoi la fiecare tic. Până atunci,
  coada e construită și testată, nu pornită.
- **Rândul nu ține „șablon plus datele de interpolat", cum scrie mai sus, ci corpul deja randat**
  (`bodyText`, `bodyHtml`). Șabloanele sunt S2 și nu există, deci un identificator de șablon ar fi
  numele a ceva inexistent — și are un dezavantaj și după ce S2 se face: un șablon editat între
  punerea în coadă și trimitere ar schimba un mesaj deja aprobat. Ce e în coadă e ce pleacă.
  Coloana de HTML e acolo goală tocmai ca S2 să nu ceară o migrare.
- **Un singur apelant**, jobul zilnic din [E12](E12-prezenta-orar.md). Nicio operațiune de business
  nu pune încă nimic în coadă, deci „factura și mesajul ei se salvează sau se pierd împreună" e
  mecanism disponibil, nu mecanism folosit.
- **Purjarea sesiunilor nu s-a mutat.** Stă tot pe `setInterval`-ul ei din
  `apps/api/src/modules/auth/session.service.ts`. Motivul pentru care era acolo a dispărut — există
  un scheduler —, deci mutarea a rămas o datorie, nu un blocaj.
- Rândurile oprite ca eșec permanent **nu se văd nicăieri.** `OutboxMessage` nu are controller și nu
  are intrare în `apps/api/src/contract.ts`, intenționat: evidența pe care o citește un admin e S5.
  Până atunci, „a primit părintele anunțul?" se răspunde cu un `SELECT`.

### S4 · Preferințe și dezabonare

Fiecare părinte alege ce primește și cât de des: imediat, rezumat zilnic, rezumat săptămânal.
Mesajele tranzacționale — factură, plată, anulare de ședință, documentul propriului copil — nu se
pot opri. **Opțional rămâne doar marketingul.**

**Documentul propriului copil nu stă pe o bifă.** E executarea contractului dintre școală și
familie, nu consimțământ — vezi [E07](E07-securitate-gdpr.md) S8 și
[E14](E14-proiecte-elevi.md) S4. Motivul e și practic, nu doar formal: dacă livrarea ar depinde de
acordul de marketing, un părinte care refuză marketingul ar înceta să primească munca copilului
lui, iar acordul ar deveni condiție de serviciu — moment în care nu mai e liber exprimat, deci nu
mai e valabil nici pentru marketing. Preferința de frecvență nu îl oprește nici ea; gruparea per
părinte din S6 rămâne, fiindcă ea schimbă ambalajul, nu dacă mesajul ajunge.

Distincția e și legală, și de bun-simț.

**Acceptanță:** dezabonarea de la marketing nu oprește facturile și nici documentele copilului.
Legătura de dezabonare funcționează dintr-un click.

**Livrat parțial: comutatorul și garanția, nu frecvențele.** `Profile.marketingOptIn` e singura
preferință, iar părintele o schimbă din propriile setări (`/user/profile`) — decizia patronului a
fost „din settings", nu dintr-un link magic în subsolul mesajului.

**Implicit e `false`, și e o decizie, nu o ridicare din umeri.** Consimțământul pe care nu l-a dat
nimeni nu e consimțământ, iar o coloană implicit `true` ar face ca prima trimitere de marketing să
fie chiar momentul în care școala descoperă dacă avea voie. Nicio migrare nu-l pune pe `true` pentru
familiile deja existente: școala întreabă, iar cine spune da o spune singur.

**Ce apără garanția** e scris în `MessageKind`: tranzacționalul e implicit peste tot, deci un
expeditor care nu spune nimic trimite mai departe. E direcția sigură în care să greșești —
implicitul invers ar opri tăcut facturile în ziua în care cineva uită un argument. `queue` și
`queueOrRecord` nu primesc deloc preferința, deci nu există argument pe care cineva l-ar putea da ca
să oprească o factură; doar `queueMarketing` o consultă.

**Un refuz nu lasă rând în evidență**, spre deosebire de un mesaj care n-a avut unde să plece (S5).
Distincția e importantă și e ușor de ratat: acolo cineva **trebuia** contactat și n-a fost; aici
nimeni nu trebuia. Un rând per buletin per familie dezabonată ar îneca exact eșecurile reale pe care
S5 le scoate la vedere. Ce **rămâne** nelivrabil e marketingul către o familie care a acceptat dar
n-are adresă — ăla e un eșec.

**Ce nu s-a construit:** frecvențele („imediat / rezumat zilnic / rezumat săptămânal") sunt de fapt
S6, iar rezumatele nu există; și nu există **niciun expeditor de marketing**. Mecanismul e construit
înaintea primului tocmai fiindcă momentul în care s-ar retrofita în jurul lui e momentul în care ar
fi greșit. Textul din setări spune explicit ce **nu** oprește comutatorul — un părinte care citește
„dezabonare" lângă numele școlii se teme, pe bună dreptate, că pierde factura și munca copilului.

### S5 · Evidența livrărilor

Fiecare mesaj lasă înregistrare: destinatar, șablon, dată, stare, motiv de eșec. Adminul poate
răspunde la „a primit părintele anunțul de anulare?" — exact întrebarea care apare când cineva vine
degeaba la curs.

**Un părinte fără adresă apare ca nelivrat, cu motivul `fără adresă`. Nu e sărit tăcut.** Regula
rămâne, deși adresa a devenit obligatorie la înregistrare — **cazul s-a îngustat, nu a dispărut.**

Ce s-a schimbat: un părinte care își face singur cont are de acum email obligatoriu și confirmat
([E11](E11-inscrieri-capacitate.md)), deci familiile intrate pe drumul ăla au unde primi.

Ce nu s-a schimbat: `Profile.email` rămâne `nullable` în `apps/api/src/entities/profile.entity.ts`
și `@IsOptional()` în `CreateProfileDto` (`apps/api/src/modules/profile/dto/createProfile.dto.ts`),
fiindcă **profilul creat de admin fără date de contact rămâne un flux valid** — o familie notată de
pe telefon, completată după. Iar familiile alea nu sunt un caz marginal: copilul lor e înscris tot
de admin, deci primesc facturi ca oricare altele. Fără regula de aici, absența destinatarului nu
produce nici eroare, nici rând, nici alertă — și miza nu e documentul copilului din
[E14](E14-proiecte-elevi.md), e factura: familia aia nu primește nici documentul, nici mementoul de
restanță, iar școala află când verifică încasările.

Din același motiv, evidența are nevoie de **două motive distincte, nu de unul**: `fără adresă`, la
profilul completat pe jumătate, și `adresă neconfirmată`, la contul înregistrat al cărui link de
confirmare nu a fost apăsat. Arată la fel în listă — un părinte care nu a primit — dar se rezolvă
diferit: primul cere un telefon, al doilea o retrimitere a linkului.

**Livrat.** `GET /deliveries` și `/deliveries/summary`, plus ecranul `/admin/livrari`: ce a plecat,
ce n-a plecat și de ce, filtrabil pe stare, pe destinatar (potrivire slabă — adminul își amintește
un nume, nu o adresă) și pe interval. Corpul mesajului vine cu rândul, fiindcă cine întreabă dacă o
familie a fost anunțată vrea să vadă **ce** i s-ar fi spus.

**Ce s-a schimbat de fapt e că nimeni nu mai e sărit tăcut.** Expeditorii se ramificau pe
`if (profile.email)` și scriau un avertisment pe cealaltă ramură — adică puneau faptul într-un log
pe care nu-l citește nimeni, iar „părintele n-a fost anunțat" arăta exact ca o coadă blocată.
`OutboxService.queueOrRecord` primește acum destinatarul, oricare ar fi el, și scrie un rând
`undeliverable` când n-are unde trimite. Rândul păstrează corpul; adresa rămâne **goală**, nu
completată cu un substitut, fiindcă o adresă inventată ar fi imposibil de deosebit de una reală care
a respins mesajul.

`undeliverable` e terminal și nu e revendicat niciodată de dispecer, a cărui interogare cere
`pending`: **niciun backoff nu face să apară o adresă.**

**Cele două motive sunt o coloană tipizată, nu text liber în `lastError`**, fiindcă ecranul se
ramifică pe ele: `no_address` cere un telefon, `unconfirmed_address` cere retrimiterea linkului.
Arată identic într-o listă și se rezolvă altfel — exact de asta o singură valoare n-ar fi ajuns.

**O duplicare de vocabular, scrisă ca să nu fie descoperită:** raportul de trimitere din
[E14](E14-proiecte-elevi.md) S4 numește aceleași două cazuri `no_email` și `email_unconfirmed`.
Cuvintele de aici sunt cele din story — „fără adresă" și „adresă neconfirmată" — și sunt cele
canonice; tipul de pe sârmă se cheamă `DeliveryFailureReason` tocmai fiindcă `UndeliverableReason`
era deja luat de E14. Raportul lui își păstrează vocabularul până îl atinge cineva. Ce s-a reparat
acum e că trimiterea de proiecte **scrie și în evidență**, nu doar în raportul de pe ecran: raportul
răspunde adminului care stă în fața ecranului, rândul din outbox răspunde întrebării puse peste trei
săptămâni.

**Evidența e doar de citit.** Nimic de aici nu reîncearcă, nu șterge și nu editează un mesaj. O
reîncercare declanșată de om e altă decizie — ar trebui să răspundă la „și dacă totuși a fost
livrat?" — iar story-ul cere evidența, nu comenzile.

**Starea trăiește și pe document, nu doar pe mesaj.** Documentele din
[E14](E14-proiecte-elevi.md) sosesc pe grupă, iar adminul se uită la ele înainte să apese butonul din
S8 — deci fiecare document are trei stări vizibile în lista grupei: **nou** (urcat, netrimis),
**trimis**, **eroare**. Sunt proiecția stării din outbox înapoi pe document, nu un al doilea adevăr
ținut de mână.

Fără ea, ecranul de dinaintea butonului nu poate spune ce a mai rămas de trimis, iar a doua trecere
a adminului peste aceeași grupă retrimite ce plecase deja. `eroare` e starea care contează cel mai
mult: un mesaj oprit ca eșec permanent trebuie să se vadă **în lista grupei**, unde se uită omul, nu
doar în lista de mesaje, unde nu intră nimeni din proprie inițiativă.

**Acceptanță:** întrebarea „a primit părintele anunțul de anulare?" are răspuns din interfață, în
sub un minut. Adminul vede din aceeași evidență cine nu a primit ultima factură și din ce motiv, iar
părinții fără adresă sau cu adresă neconfirmată apar acolo, cu motivul lor, nu lipsesc din listă.
După o trimitere pe grupă, lista de documente arată câte au plecat, câte au eșuat și câte au rămas
noi.

### S6 · Rezumate în loc de rafale

Un părinte cu doi copii, în zile diferite, cu proiecte, prezențe și o factură, ar putea primi zece
mesaje pe săptămână. Motorul de rezumate le adună într-unul singur, respectând preferința de
frecvență.

**Acceptanță:** un părinte cu doi copii nu primește mai mult de un email pe zi, cu excepția celor
tranzacționale urgente.

### S7 · Anunțuri

Un admin trimite un mesaj către o grupă, o locație sau toți părinții, cu previzualizare, confirmare
și evidență. Pentru „sâmbătă e zi liberă" sau „s-a schimbat sala".

**Acceptanță:** un anunț către o locație ajunge la toți părinții activi de acolo, cu raport de
livrare.

### S8 · Trimitere declanșată de admin

Documentele copiilor nu pleacă singure. Adminul deschide grupa, vede documentele noi urcate de
agentul din [E14](E14-proiecte-elevi.md), bifează ce se trimite și apasă un buton.

**De ce un buton și nu un job de seară.** Un job de seară presupune că nimeni nu trebuie să se uite
la ce pleacă. Presupunerea e falsă exact aici: un document urcat dintr-un folder de rețea poate fi
al altui copil, poate fi ilizibil, poate avea în cadru un copil în loc de lucrarea lui — iar între
folder și părinte singurul filtru posibil e un om. Butonul nu e o comoditate de interfață, e
**momentul în care cineva își asumă ce pleacă.** Odată trimis, un email nu se retrage; regula e
aceeași ca la difuzările din S7, doar că aici obiectul e un copil anume.

Ce înseamnă mecanic:

- Selecția e pe grupă și pe document, dar **trimiterea se desface per părinte**: un click produce N
  mesaje, fiecare cu exact un destinatar și exact documentele copilului lui. Asta e diferența față
  de anunțul din S7, care e un text către o grupă și **nu are voie** să conțină date despre un copil
  anume. Aici totul e despre un copil anume — tocmai de aceea nu poate fi o difuzare.
- Cele N mesaje intră în outbox-ul din S3 și pleacă de acolo. Butonul confirmă că s-au pus la
  trimitere, nu că au ajuns.
- **A doua apăsare nu retrimite.** Un document `trimis` e sărit, iar adminul vede de ce. Fără asta,
  un click nervos pe o conexiune lentă dublează tot grupul.
- Regula din S6 se aplică și ea: desfacerea e **per părinte, nu per copil.** Un părinte cu copii în
  două grupe, trimise amândouă în aceeași zi, primește un mesaj cu amândouă, nu două mesaje. Faptul
  că declanșatorul e un om nu e o portiță prin care iese o rafală.
- **Dezabonarea nu se aplică aici**: documentul propriului copil e tranzacțional (S4), deci
  butonul nu are ce bifă să calce. Ce oprește totuși un mesaj e lipsa destinatarului — părinte fără
  adresă, sau cu adresă neconfirmată. Ăla apare ca nelivrat, cu motivul lui, în evidența din S5:
  nu primește mesajul și nici nu dispare tăcut din raportul trimiterii.

**Acceptanță:** adminul bifează opt documente dintr-o grupă și apasă o dată; opt părinți primesc
fiecare documentul copilului lui, și nimeni altceva. A doua apăsare nu trimite nimic. Un părinte
fără adresă sau cu adresă neconfirmată apare în raportul trimiterii cu motivul lui.

## Dependențe

[E05](E05-robustete-backend.md) pentru rate limiting și configurație,
[E06](E06-observabilitate-operare.md) pentru alertare la eșecuri de livrare.

S3 mai are o dependență proprie, de infrastructură: [E01](E01-infrastructura-medii.md) S4 e cel care
scrie fișierul de ecosistem și, odată cu el, locul unde rulează scheduler-ul. Coada e acum
construită și testată — și tot fără unde să ruleze continuu. Dependența nu mai e o prognoză, e
starea de azi: tot ce se pune în `outbox` rămâne acolo până când există instanța.

## Riscuri

**Prea multe mesaje și părinții se dezabonează.** Odată pierdut canalul, se recâștigă greu. S6 nu e
o rafinare, e o cerință de la început.

**Un email greșit trimis la toți nu se poate retrage.** Confirmare obligatorie și trimitere de test
către admin înainte de orice difuzare în masă.

**Ce depinde de un buton nu pleacă dacă nu apasă nimeni.** E reversul deciziei din S8: jobul de
seară pleca și într-o zi aglomerată, butonul nu. Riscul nu se închide cu disciplină, ci cu
vizibilitate — lista grupei arată câte documente sunt `nou` și de câte zile, iar cifra se vede din
meniul zonei de admin, nu doar dacă intri pe grupă. Un document rămas `nou` de trei zile e o
problemă operațională, nu o stare.

**Adresele părinților sunt date personale.** Faptul că adresa devine obligatorie la înregistrare nu
scutește de temei și scop — o cere mai apăsat, fiindcă un câmp obligatoriu nu mai lasă părintelui
alegerea. Iar în bază rămân profiluri fără adresă, create de admin: lipsa lor se vede în evidența
din S5, nu se pierde.

**Cheia de expediere poate trimite în numele domeniului școlii.** E motivul pentru care nu stă în
`public` la Nuxt și nu se cheamă din browser. Aceeași disciplină se aplică și cheii din `apps/api`.

## Definition of done

Toate epic-urile dependente folosesc acest sistem, niciunul nu trimite direct. Fiecare mesaj are
evidență, inclusiv cele care nu au avut unde să plece. Preferințele sunt respectate.

Fiecare mesaj despre un copil are un declanșator numit: fie o regulă automată scrisă în epicul care
o cere, fie un om care a apăsat un buton. Niciun document nu e într-o stare pe care interfața n-o
arată.

## Decizii luate

| Decizie                                 | Valoare                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Furnizor de email                       | **Resend**, deja în uz și cu domeniul de expediere verificat                                      |
| Chei de expediere                       | **Două** chei și două adrese: una pentru formularul public, alta pentru mailul către părinți      |
| Locul de trimitere către părinți        | `apps/api`, printr-un `MailService`. Ruta Nitro rămâne doar a formularului public                 |
| Substrat pentru coadă și joburi         | **Postgres**, în procesul API. Fără Redis, fără BullMQ                                            |
| Ceasul din backend                      | `@nestjs/schedule` **fixat la `^6.0.1`**: v12 exportă ESM și moare în ts-jest, v6 e CommonJS      |
| Destinatarul unui mesaj despre un copil | **Părintele lui, exclusiv.** Un copil are un `Profile`, cu o adresă                               |
| Adresa de email a părintelui            | **Obligatorie și confirmată la înregistrare.** Profilul creat de admin rămâne fără                |
| Trimiterea documentelor către părinți   | **Adminul apasă butonul**, pe grupă, după ce se uită la ce pleacă. Nimic nu pleacă automat, seara |
| Starea unui document                    | **nou / trimis / eroare**, vizibilă în lista grupei, nu doar în evidența de mesaje                |

**Fără canal secundar în MVP.** Emailul e singurul canal. Propunerea echipei — o pagină de admin cu
câte un link `wa.me` per copil, cu mesajul precompletat, trimis de pe telefonul omului — a fost
respinsă de patron pentru MVP.

Argumentul se păstrează aici, ca să nu fie refăcut: dacă se reia vreodată, forma e linkurile, nu
WhatsApp Business API. API-ul cere un furnizor intermediar, un contract cu el, un business verificat
la Meta, șabloane aprobate în avans și tarifare per conversație — pentru câteva zeci de mesaje pe
săptămână. Ce nu acoperă varianta cu linkuri, și de aceea nu e gratis: nimic nu e automat, nu există
reîncercare, și **nu există dovadă de livrare** — platforma nu are de unde ști dacă omul chiar a
apăsat trimite. De asta evidența din S5 rămâne despre email și nu inventează o stare `trimis`
neverificată; una falsă ar fi mai rea decât lipsa ei, fiindcă pe ea se ia decizia „părintele știe".

Pragul la care se redeschide: câteva sute de familii, unde un link pe copil devine muncă de om cu
ora.

**Un copil, un părinte, o adresă.** Întrebarea „ce facem când copilul are doi părinți care vor
amândoi mesajele?" se închide cu răspunsul ăsta, nu cu o listă de destinatari. Motivul e cel
consemnat deja în [E14](E14-proiecte-elevi.md): un al doilea `Profile` ar duplica copilul și ar rupe
reducerea de frați, care se numără per familie — o familie cu doi copii ar plăti doi „primi copii"
întregi ([E15](E15-pricing-facturare.md) S4). Dacă vreodată se cere, forma nu e un al doilea profil,
ci o a doua adresă pe același `Profile`, o coloană, și **tot un singur mesaj trimis la două
adrese**, nu două mesaje — altfel S6 devine minciună pentru jumătate din familii.

**Nimic despre un copil nu ajunge la altă familie.** Documentul, prezența, factura, mementoul de
restanță — fiecare are exact un destinatar, părintele copilului respectiv.
Anunțurile din S7 sunt singura excepție și sunt exact reversul: se adresează unei grupe sau unei
locații și **nu au voie să conțină date despre un copil anume**. Un anunț care numește un copil e o
scurgere, nu un anunț, iar previzualizarea obligatorie de dinaintea difuzării e locul unde se
prinde. Regula nu e o preferință de produs: e ce face diferența între „platforma trimite mesaje" și
„platforma răspândește date despre copii".

**Adresa obligatorie la înregistrare** e decizia care închide întrebarea deschisă de ieri. Se aplică
înregistrării făcute de părinte — `RegisterDto` cere azi doar `username` și `password`
(`apps/api/src/modules/auth/dto/register.dto.ts`) — și **nu** fluxului în care un admin creează un
profil fără date de contact, care rămâne intenționat. Regula se scrie în
[E11](E11-inscrieri-capacitate.md), nu aici; aici contează doar consecința: canalul are pe unde
pleca pentru familiile venite pe drumul obișnuit, iar restul se văd în evidența din S5.

**Trimiterea o declanșează adminul, nu ceasul.** Decizia vine odată cu rescrierea fluxului din
[E14](E14-proiecte-elevi.md): documentele urcă singure dintr-un folder de rețea, dar ultimul pas
rămâne al unui om, care se uită pe grupă și apasă. Motivul e cel din S8 — între un folder urmărit
automat și cutia poștală a unui părinte, singura verificare posibilă că documentul e al copilului
potrivit e o pereche de ochi. Consecința pentru epicul ăsta e că „automat" nu mai e singurul mod de
declanșare, deci tabelul din Problemă are o coloană în plus, iar outbox-ul din S3 servește și un
declanșator uman.

**Cheile separate** costă o variabilă de mediu și un rând în `turbo.json`. Motivul e scris deja în
cod: comentariul din `apps/web/server/utils/rate-limit.ts` recunoaște că limitatorul e per-instanță,
că pe Vercel o rafală împrăștiată peste instanțe e numărată de mai multe ori în loc de una singură,
și că exact cazul pe care îl prinde e cel care altfel s-ar termina în „a burned Resend quota". Ruta
publică e deschisă oricui. Anunțul de anulare a unei ședințe nu are voie să împartă cota cu ea, iar
revocarea unei chei compromise nu are voie să tacă celălalt canal.

**Postgres pentru coadă** e aceeași alegere pe care [E05](E05-robustete-backend.md) a făcut-o pentru
sesiuni, cu motivul scris acolo: la volumul actual e suficient, iar o piesă de infrastructură în
plus ar trebui operată. Ținta e o singură instanță cu Postgres pe ea
([E01](E01-infrastructura-medii.md) S4), iar `docker-compose.yml` e rezervat infrastructurii locale
— nu se adaugă servicii de aplicație acolo. Un Redis ar fi al doilea serviciu de operat, cu backup
și monitorizare proprii, pentru câteva zeci de mesaje pe zi. Costul deciziei e că o coadă pe tabel
nu scalează la volume mari; la volumul ăsta, pragul nu se atinge.

## Întrebări deschise

- ~~Adresa de email devine obligatorie?~~ **Da, la înregistrare, și confirmată prin link.** Fluxul
  în care un admin creează un profil fără date de contact rămâne neatins. Detaliile la
  [Decizii luate](#decizii-luate), regula în [E11](E11-inscrieri-capacitate.md).
- ~~Ce se întâmplă când un copil are doi părinți care vor amândoi mesajele?~~ **Un copil are un
  părinte, cu o adresă.** Motivul, la [Decizii luate](#decizii-luate).
- ~~Rămâne WhatsApp canalul principal pentru urgențe, în afara platformei?~~ **Rămâne exact acolo
  unde e azi: în afara platformei.** Nu se construiește nimic pentru el în MVP — vezi
  [Decizii luate](#decizii-luate). Omul deschide WhatsApp și scrie, ca acum.
- Cine scrie textele? Sunt fața școlii și merită scrise cu grijă, nu generate. **Blochează S2**, și
  numai S2: ce s-a livrat până acum pune în coadă un corp deja randat, iar singurul destinatar e
  adresa școlii.
