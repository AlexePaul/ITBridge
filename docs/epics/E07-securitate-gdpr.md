# E07 · Securitate, GDPR și consimțământ

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E04, E05 · **Blochează:** E09, E14, E19, E22

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
- **Nu există contract de înscriere înregistrat.** Regulile pe care se sprijină banii și programul —
  „se cumpără un modul, nu un număr de ședințe" din [E12](E12-prezenta-orar.md), „fără returnare la
  abandon" din [E15](E15-pricing-facturare.md) — sunt clauze contractuale, dar nu există niciun text
  acceptat de cineva, la o dată anume, într-o versiune anume.
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
- Contractul de înscriere, ca document versionat, cu acceptarea înregistrată per înscriere.
- Managementul secretelor.
- Contracte de prelucrare cu furnizorii.

## În afara scopului

- Consultanță juridică. Acest epic pregătește platforma; textele legale — politica, termenii și
  contractul de înscriere — le scrie și le validează un avocat.
- Semnătura electronică calificată. Vezi S8.

## Story-uri

### S1 · Inventar și clasificare

Un tabel cu fiecare câmp de date personale: unde e stocat, de ce, pe ce temei legal, cât se
păstrează, cine îl poate vedea. Include datele copiilor — nume, dată de naștere, prezență, proiecte,
fotografii.

**Acceptanță:** tabelul e complet și fiecare câmp are temei legal identificat.

### S2 · Consimțământ parental

Entitate de consimțământ pe tripleta **`(Profile, Child, scop)`**: părintele consimte, dar subiectul
datelor e copilul. Fiecare înregistrare are dată, versiune de text acceptat și revocare.

**Granularitatea doar pe `Profile` nu funcționează**, deși așa era scris aici înainte. Un părinte
acceptă publicarea pentru cel mare, care e mândru de ce a construit, și o refuză pentru cel mic —
cazul obișnuit, nu unul de margine. Cu un singur rând pe familie, singurele răspunsuri exprimabile
sunt „toți copiii" și „niciunul", iar [E14](E14-proiecte-elevi.md) S6 publică *per copil* („prenume
și inițială, vârstă"), deci ar publica un copil pentru care nu există acord. `Child` există deja ca
entitate proprie (`apps/api/src/entities/child.entity.ts`), iar consimțământul nu e construit
nicăieri — o căutare după `consent` în `apps/api/src` nu întoarce nimic. Deci schimbarea costă azi
o linie de doc; după ce există primul rând, costă o migrare pe date reale.

Cinci scopuri:

1. **fotografierea copilului la curs și păstrarea fotografiei** — actul în sine, nu ce urmează;
2. publicarea proiectelor pe vitrina publică din [E14](E14-proiecte-elevi.md) S6;
3. fotografii și proiecte în materiale de marketing — [E19](E19-seo-geo.md);
4. partajarea proiectului cu ceilalți părinți din grupă;
5. comunicări comerciale.

**Primul e distinct de al doilea intenționat.** Celelalte patru scopuri sunt toate în aval și
presupun că fotografia există deja; niciunul nu acoperă momentul în care se apasă declanșatorul.
Într-o sală, poza unei lucrări prinde de regulă mâini, fețe și copii din fundal — copii ai altor
familii — iar în România imaginea persoanei e protejată separat de GDPR, prin art. 73 din Codul
civil. Deci fotografierea are nevoie de temei propriu, nu de unul împrumutat de la publicare.

**Livrarea proiectului propriu către propriul părinte nu depinde de niciunul dintre aceste
acorduri.** E executarea contractului dintre școală și familie (S8), nu consimțământ. Altfel un
părinte care refuză marketingul ar înceta să primească munca copilului lui, iar acordul ar deveni
condiție de serviciu — moment în care nu mai e liber exprimat, deci nu mai e valabil nici pentru
marketing. Emailul de seară din [E14](E14-proiecte-elevi.md) S4 pleacă indiferent de bifele de mai
sus.

Revocarea trebuie să aibă efect **retroactiv și automat**: un proiect publicat dispare de pe site
când părintele retrage acordul, fără intervenție manuală.

**Înregistrarea de aici e sursa de adevăr.** Dacă [E14](E14-proiecte-elevi.md) ține o stare de
consimțământ pe `Project`, aceea e un instantaneu pentru viteza de afișare, nu un al doilea loc în
care se poate răspunde altceva: un proiect e public doar dacă există consimțământ activ pentru acel
copil și acel scop în momentul afișării.

**Acceptanță:** [E14](E14-proiecte-elevi.md) nu poate publica un proiect fără consimțământ activ
pentru copilul acela și scopul acela. Revocarea îl retrage în sub un minut. Un părinte cu doi copii
poate accepta pentru unul și refuza pentru celălalt, iar vitrina arată exact asta.

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

Termenii validați de avocat trebuie să acopere explicit **dreptul legal de retragere în 14 zile la
contractele încheiate la distanță** (OUG 34/2014). Înscrierea din portal sau prin telefon e contract
la distanță, deci regula „fără returnare la abandon" din [E15](E15-pricing-facturare.md) nu poate
deroga de la el prin decizie internă, iar o clauză de nereturnare absolută e clauză abuzivă.
Cazurile sunt rare — proba e gratuită, deci „nu i-a plăcut" se consumă înainte să circule banii —
dar corectura trebuie făcută *înainte* de redactare, nu după, și înainte ca
[E16](E16-plati-fiscal.md) S4 să pună plata cu cardul în portal.

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

### S8 · Contractul de înscriere

S5 produce documentele care privesc **vizitatorul**: confidențialitate, termeni de site, cookie-uri.
Contractul dintre școală și familie nu e produs de niciun epic, deși trei se sprijină pe el:
[E12](E12-prezenta-orar.md) spune că un părinte cumpără participarea la un modul, nu un număr
garantat de ședințe, și că „formularea din factură și din termeni trebuie să reflecte asta";
[E15](E15-pricing-facturare.md) decide „fără returnare la abandon", care e o clauză contractuală, nu
o setare de sistem; [E11](E11-inscrieri-capacitate.md) recomandă auto-înscrierea din portal, moment
în care acceptarea trebuie capturată și dovedibilă, fiindcă nu mai e nimeni în cameră.

Platforma face trei lucruri, toate mecanice:

- ține textul ca **document versionat**, cu aceeași mecanică din S5;
- înregistrează **acceptarea la înscriere**: cine, ce versiune, când, pentru care `Enrollment` din
  [E11](E11-inscrieri-capacitate.md);
- îl arată părintelui în portal **în versiunea pe care a acceptat-o el**, nu în cea curentă. Un
  contract afișat mereu în ultima versiune nu e o dovadă, e o afirmație.

Intră în exportul din S4 — un părinte care cere ce dețineți despre el primește și textul pe care l-a
acceptat.

Reutilizează **entitatea de consimțământ din S2**, nu una paralelă: e același fapt — o persoană a
acceptat un text versionat, la o dată, revocabil sau nu — cu alt scop și alt obiect. Două tabele
pentru același fapt ar însemna două locuri de verificat înainte de fiecare afișare și două
mecanisme de versionare de ținut în pas.

**Drepturile de imagine nu se redublează aici.** Contractul trimite la consimțământul granular din
S2; altfel un părinte care retrage acordul foto ar apărea că reziliază contractul, iar retragerea —
care trebuie să fie la fel de ușoară ca acordarea — ar deveni un act cu consecințe pe care nimeni nu
și le asumă.

Textul îl scrie un avocat, ca restul documentelor legale, deci rămâne în afara scopului. **Fără
semnătură electronică calificată:** acceptarea în portal, cu versiune, dată, utilizator și adresă
IP, e proporțională cu miza — un modul de 700 de lei, acceptat dintr-un cont cu parolă, care e deja
legat de familie prin `Profile`.

**Acceptanță:** pentru orice înscriere se poate arăta exact ce text a acceptat familia și când, doi
ani mai târziu.

Blochează **auto-înscrierea din portal** ([E11](E11-inscrieri-capacitate.md), Întrebări deschise),
nu [E11](E11-inscrieri-capacitate.md) S1: o înscriere făcută de admin poate colecta acceptarea pe
hârtie până atunci, la fel ca azi.

## Dependențe

[E04](E04-migrari-date.md) pentru schema de consimțământ și audit,
[E05](E05-robustete-backend.md) pentru filtrarea datelor din loguri.

**Ce blochează E07, blochează la nivel de story.** Niciunul dintre cele patru epicuri din antet nu
așteaptă E07 ca să înceapă; fiecare are câte un story care nu se poate bifa fără unul de aici:

- [E09](E09-personal-roluri.md) S2 — rolul de profesor lărgește accesul la datele de contact ale
  părinților, iar decizia e apărabilă doar cu jurnalul din S3. E09 spune același lucru din partea
  cealaltă, în „Dependențe": S3 se livrează odată cu S2, nu după, fiindcă un jurnal pornit mai târziu
  nu reconstituie accesele deja făcute.
- [E14](E14-proiecte-elevi.md) — vitrina publică nu poate arăta nimic fără consimțământul din S2.
- [E19](E19-seo-geo.md) S8 — analiza de trafic respectă bannerul din S5.
- [E22](E22-siguranta-copilului.md) S3 și S4 — alergiile și afecțiunile sunt categorie specială sub
  art. 9 și își iau temeiul dintr-o bifă construită pe entitatea din S2, iar istoricul unei note de
  incident e audit log-ul din S3, nu un model propriu.

Dintre astea, doar [E14](E14-proiecte-elevi.md) are E07 în coloana „Depinde de" a tabelului din
[README](README.md): acolo consimțământul e precondiție de model, nu criteriu de acceptanță — fără el
epicul nu are ce livra. Celelalte trei sunt muchii slabe, de același fel cu cele care pleacă din
[E17](E17-comunicare-notificari.md) către E11, E12 și E16: epicurile se construiesc și se livrează
fără E07, doar că rămân cu criterii nebifate. Locul lor e aici, în `Blochează`, și în graful din
README — nu în coloana „Depinde de" — ca să nu fie descoperite ca surpriză la sfârșitul epicului
blocat.

**[E11](E11-inscrieri-capacitate.md) nu e în listă, intenționat.** S8 blochează auto-înscrierea din
portal, care e încă o întrebare deschisă în E11, nu un story al lui — iar înscrierea făcută de admin,
singura care există azi, merge mai departe fără nimic de aici. Muchia devine reală în clipa în care
răspunsul la acea întrebare e „da"; atunci E11 intră în antet.

## Riscuri

**Consimțământul adăugat după ce proiectele sunt deja publicate e mult mai scump.** Trebuie
construit *înainte* de [E14](E14-proiecte-elevi.md), nu retrofitat. E motivul pentru care acest
epic apare în pista de fundație și nu la sfârșit.

**Retenția contabilă intră în conflict cu dreptul la ștergere.** Facturile trebuie păstrate ani de
zile; datele personale trebuie șterse la cerere. Rezolvarea e anonimizarea, nu ștergerea, și
trebuie proiectată explicit.

## Definition of done

Fiecare categorie de date personale are temei legal și termen de păstrare. Consimțământul e
granular, revocabil și respectat automat. Pentru orice înscriere se știe ce text a acceptat familia,
în ce versiune și când. Un audit extern ar găsi documentație, nu improvizație.

## Decizii luate

**Fără detecție automată de fețe și fără blurare.** Ar fi răspunsul reflex la problema copiilor din
fundal de la S2, și e greșit din trei motive. Un model de detecție ar rula pe aceeași instanță care
ține și Postgres — vezi [E01](E01-infrastructura-medii.md) — pentru câteva zeci de fotografii pe
săptămână. Detecția ratează exact cazurile grele, un profil parțial în penumbră, deci produce
încredere falsă tocmai acolo unde revizuirea umană ar fi contat. Și, cel mai important, mută
problema în aval: soluția ieftină e să nu existe fața în cadru, adică regula de fotografiere din
[E14](E14-proiecte-elevi.md) S2 — fotografia se face asupra lucrării, nu asupra copilului — plus
bifa de verificare dinaintea publicării din [E14](E14-proiecte-elevi.md) S6, care se face oricum,
fiindcă vitrina se revizuiește înainte să apară. Se reia discuția doar dacă vitrina ajunge să
publice fotografii pe care nu le mai vede nimeni înainte.

## Întrebări deschise

- Acordul de imagine se ia ca bifă la înscriere, în același ecran cu contractul din S8, sau rămâne
  hârtie separată, semnată? **Recomandare: bifă la înscriere.** *De confirmat.* O hârtie semnată nu
  e legată de niciun rând din baza de date, deci codul nu o poate verifica înainte de publicare și
  revocarea nu poate avea efect „în sub un minut" — cineva ar trebui să caute prin dosar și să
  acționeze manual, exact ce încearcă S2 să elimine. Contraargumentul e real: forma scrisă e mai
  solidă dacă un părinte contestă mai târziu că a dat acordul. De aceea textul bifei se scrie tot de
  avocat, iar înregistrarea reține versiunea, data și utilizatorul.
- Cine e responsabilul cu protecția datelor? La dimensiunea asta nu e obligatoriu un DPO formal,
  dar cineva trebuie să fie punctul de contact.
- Vârsta de la care copilul însuși are drepturi de acces? În România, consimțământul digital e la 16
  ani, dar copiii școlii sunt sub. Deci contul e mereu al părintelui.
