# E07 · Securitate, GDPR și consimțământ

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E04, E05 · **Blochează:** E14, E19; E09 doar
odată cu reluarea lui S2

> **Granița cu [E22](E22-termeni-si-date.md), fiindcă se confundă ușor: aici e mecanica, acolo e ce
> citește și acceptă familia.** Cele două epicuri descriau aceleași patru lucruri cu cuvinte
> diferite, iar un inventar ținut în două locuri e exact defectul pe care restul repo-ului îl evită.
> Împărțirea, din septembrie 2026:
>
> | Subiect | Cine îl ține |
> | --- | --- |
> | Inventarul câmpurilor | **E07 S1**, o singură dată. E22 îl citește, nu îl reface |
> | Textele juridice | **E22 S2** — termenii contului, nota de confidențialitate, cookie-urile |
> | Bannerul care chiar blochează scripturile | **E07 S5** — cod, nu proză |
> | Consimțământul de publicare | **E07 S2**, pe `(Profile, Child, scop)` |
> | Ce versiune a acceptat cine, și când | **E22 S4** |
> | Termenul de păstrare | scris în **E22 S3**, executat de **E07 S4** și [E04](E04-migrari-date.md) S5 |
>
> Regula din care iese tabelul: dacă rezultatul e un document pe care îl citește un părinte, e al
> E22; dacă rezultatul e un rând, un endpoint sau un script, e al epicului ăstuia.

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
- **Nu există evidența contractelor de înscriere.** Regulile pe care se sprijină banii și programul —
  „se cumpără un modul, nu un număr de ședințe" din [E12](E12-prezenta-orar.md), „fără returnare la
  abandon" din [E15](E15-pricing-facturare.md) — sunt clauze contractuale, dar nimeni nu poate spune,
  fără să caute prin bibliorafturi, dacă o familie anume a semnat și când.
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
- Evidența contractelor de înscriere semnate pe hârtie: pentru fiecare înscriere, faptul, data și,
  dacă e cazul, versiunea.
- Managementul secretelor.
- Contracte de prelucrare cu furnizorii.

## În afara scopului

- Consultanță juridică. Acest epic pregătește platforma; textele legale — politica, termenii și
  contractul de înscriere — le scrie și le validează un avocat.
- Textul contractului de înscriere ținut ca document versionat în platformă și acceptarea lui
  digitală, cu tot ce ține de semnătură electronică. Contractul se semnează fizic. Vezi S8.

## Story-uri

### S1 · Inventar și clasificare

Un tabel cu fiecare câmp de date personale: unde e stocat, de ce, pe ce temei legal, cât se
păstrează, cine îl poate vedea. Include datele copiilor — nume, dată de naștere, prezență, proiecte,
fotografiile lucrărilor.

**Inventarul stă aici, o singură dată.** [E22](E22-termeni-si-date.md) S2 scrie nota de
confidențialitate **din** el, nu alături de el: două tabele întreținute separat diverg, iar cel care
ajunge sub ochii unei familii ar fi tocmai cel rămas în urmă. Derivarea din entități e cerința care
ține linia — aceeași disciplină ca `contract.ts`.

**Acceptanță:** tabelul e complet, fiecare câmp are temei legal identificat, iar o coloană nouă cu
date personale nu poate ajunge în producție fără să apară în el.

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

Trei scopuri:

1. publicarea **lucrării** copilului pe vitrina publică din [E14](E14-proiecte-elevi.md) S6, cu
   prenume, inițială și vârstă;
2. lucrarea și fotografia ei în materiale de marketing — [E19](E19-seo-geo.md);
3. comunicări comerciale.

**Fotografierea copilului nu e printre ele, fiindcă nu se întâmplă.** Se fotografiază lucrarea, nu
copilul — fără fețe, fără copii în cadru, din clipa în care se apasă declanșatorul. Un scop de
consimțământ pentru un act care nu are loc nu e o precauție în plus: e o bifă pe care S2 ar trebui
totuși să o ceară, să o stocheze și să o verifice, fără ca răspunsul ei să schimbe vreodată ceva. Iar
motivul pentru care fusese propus — imaginea persoanei e protejată în România separat de GDPR, prin
art. 73 din Codul civil, deci ar avea nevoie de temei propriu, nu de unul împrumutat de la publicare
— dispare odată cu obiectul: nu există imagine de persoană. Vezi [Decizii luate](#decizii-luate).

**Partajarea proiectului cu ceilalți părinți din grupă a ieșit din listă din același motiv**: nu se
face. Livrarea e privată, proiectul ajunge exclusiv la părintele copilului respectiv.

**Livrarea proiectului propriu către propriul părinte nu depinde de niciunul dintre aceste
acorduri.** E executarea contractului dintre școală și familie (S8), nu consimțământ. Altfel un
părinte care refuză marketingul ar înceta să primească munca copilului lui, iar acordul ar deveni
condiție de serviciu — moment în care nu mai e liber exprimat, deci nu mai e valabil nici pentru
marketing. Trimiterea pe grupă din [E14](E14-proiecte-elevi.md) S4, pe care o apasă adminul după
revizie, pleacă indiferent de bifele de mai sus.

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

**Termenul pe care îl aplică ștergerea e scris în [E22](E22-termeni-si-date.md) S3**, nu aici: „după
cât timp" e o promisiune făcută familiei, deci trăiește în documentul pe care aceasta l-a citit. Aici
e drumul pe care îl parcurge o cerere, iar în [E04](E04-migrari-date.md) S5 e jobul care îl parcurge
periodic. Trei locuri, trei treburi diferite, un singur număr — al E22.

**Acceptanță:** ambele fluxuri funcționează capăt-la-capăt, cu termen sub 30 de zile.

### S5 · Bannerul de cookie-uri și blocarea scripturilor

Bannerul care chiar **blochează scripturile neesențiale până la accept** — nu unul care anunță că
site-ul folosește cookie-uri după ce le-a pus deja. E singura bucată din vechiul „documente legale"
care e cod, și de asta a rămas aici.

**Textele au plecat la [E22](E22-termeni-si-date.md) S2** — politica de confidențialitate, termenii
și politica de cookie-uri —, iar istoricul acceptărilor la E22 S4. Ele se scriu la final, cu
platforma în față; bannerul se poate construi înainte, fiindcă mecanismul nu depinde de ce scrie în
text.

Contractul dintre școală și familie e alt lucru și se semnează pe hârtie — vezi S8. Dreptul de
retragere în 14 zile nu intră în niciunul; motivul e la [Decizii luate](#decizii-luate).

**Acceptanță:** un vizitator nou nu are niciun cookie neesențial înainte de a accepta, iar nicio
cerere către un domeniu terț neesențial nu pleacă din pagină — verificat în tab-ul de rețea, nu în
configurație.

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

### S8 · Evidența contractului de înscriere

S5 produce documentele care privesc **vizitatorul**: confidențialitate, termeni de site, cookie-uri.
Contractul dintre școală și familie e altceva, și trei epicuri se sprijină pe el:
[E12](E12-prezenta-orar.md) spune că un părinte cumpără participarea la un modul, nu un număr
garantat de ședințe, și că „formularea din factură și din termeni trebuie să reflecte asta";
[E15](E15-pricing-facturare.md) decide „fără returnare la abandon", care e o clauză contractuală, nu
o setare de sistem; [E11](E11-inscrieri-capacitate.md) leagă înscrierea de o grupă anume.

**Contractul se semnează fizic.** Platforma nu ține textul, nu îl versionează și nu capturează
acceptare digitală. Face un singur lucru: reține că pentru o înscriere **există contract semnat** —
data semnării și, dacă textul ajunge să aibă versiuni, care versiune. Câteva câmpuri pe înscrierea
din [E11](E11-inscrieri-capacitate.md), nu un subsistem de documente.

Motivul e că nu mai e nimic de capturat online. Nu există auto-înscriere: contul de părinte e inactiv
până îl aprobă un admin, iar copilul e înscris în grupă tot de admin. Deci e mereu cineva în cameră
când se semnează, iar hârtia se obține la fel de ușor ca o bifă. Ținut în platformă, textul ar fi
cerut mecanica de versionare din S5, un ecran de acceptare, dovada acceptării și, la prima
modificare, întrebarea ce se întâmplă cu familiile care au acceptat versiunea veche — muncă al cărei
rezultat îl dă deja dosarul.

Ce rezolvă câmpurile e o altă problemă, mai mică și reală: azi „a semnat familia X?" cere să caute
cineva prin bibliorafturi, deci la câteva zeci de familii nimeni nu verifică preventiv și se află la
momentul prost. Cu evidența în platformă, o înscriere fără contract se vede în listă, lângă ea.

Intră în exportul din S4 — un părinte care cere ce dețineți despre el află și că aveți înregistrat
faptul că a semnat, cu data. Copia textului i-o dă școala din dosar; platforma nu o are.

Textul îl scrie și îl validează un avocat, ca restul documentelor legale, deci rămâne în afara
scopului. Nu există acceptare digitală, deci nu se pune nici întrebarea despre semnătură electronică
calificată.

**Drepturile de imagine nu se redublează aici.** Ce e de consimțit — publicarea lucrării — stă în
consimțământul granular din S2, revocabil dintr-un click. Ca clauză în contractul de pe hârtie,
retragerea acordului ar fi arătat ca o modificare de contract, iar retragerea trebuie să fie la fel
de ușoară ca acordarea.

**Acceptanță:** pentru orice înscriere se poate spune, din platformă, dacă există contract semnat și
din ce dată, fără să deschidă cineva un biblioraft. O înscriere fără contract se vede în listă.

**Nu blochează nimic din [E11](E11-inscrieri-capacitate.md).** Singura situație în care acceptarea ar
fi trebuit capturată digital era auto-înscrierea din portal, fiindcă acolo nu mai e nimeni în cameră.
Nu se face — vezi [Decizii luate](#decizii-luate).

## Dependențe

[E04](E04-migrari-date.md) pentru schema de consimțământ și audit,
[E05](E05-robustete-backend.md) pentru filtrarea datelor din loguri.

**Ce blochează E07, blochează la nivel de story.** Niciun epic de mai jos nu așteaptă E07 ca să
înceapă; fiecare are câte un story care nu se poate bifa fără unul de aici:

- [E14](E14-proiecte-elevi.md) — vitrina publică nu poate arăta nimic fără consimțământul din S2.
- [E19](E19-seo-geo.md) S8 — analiza de trafic respectă bannerul din S5.
- [E09](E09-personal-roluri.md) S2 — **muchie suspendată, nu desființată.** Exista fiindcă rolul de
  profesor lărgea accesul la datele de contact ale părinților, iar decizia era apărabilă doar
  însoțită de jurnalul din S3. Nu se mai implementează rolul: profesorul e admin și vede tot prin
  rol, nu printr-o excepție, deci nu se lărgește niciun acces și nu se cere nicio urmă în plus. E09
  spune același lucru din partea cealaltă, în „Dependențe". Redevine blocantă în ziua în care se reia
  E09 S2, cu motivul neatins: un jurnal pornit după nu reconstituie accesele deja făcute, deci S3 se
  livrează odată cu S2, nu după.

Dintre astea, doar [E14](E14-proiecte-elevi.md) are E07 în coloana „Depinde de" a tabelului din
[README](README.md): acolo consimțământul e precondiție de model, nu criteriu de acceptanță — fără el
epicul nu are ce livra. Celelalte sunt muchii slabe, de același fel cu cele care pleacă din
[E17](E17-comunicare-notificari.md) către E11, E12 și E16: epicurile se construiesc și se livrează
fără E07, doar că rămân cu criterii nebifate. Locul lor e aici, în `Blochează`, și în graful din
README — nu în coloana „Depinde de" — ca să nu fie descoperite ca surpriză la sfârșitul epicului
blocat.

**[E11](E11-inscrieri-capacitate.md) nu e în listă, iar acum e definitiv.** Muchia ar fi apărut doar
prin auto-înscrierea din portal, unde acceptarea contractului ar fi trebuit capturată digital. Nu se
face auto-înscriere: fiecare cont și fiecare înscriere trec printr-un admin. Evidența din S8 e un
câmp pe înscrierea făcută de admin, nu o precondiție pentru ea.

## Riscuri

**Consimțământul adăugat după ce proiectele sunt deja publicate e mult mai scump.** Trebuie
construit *înainte* de [E14](E14-proiecte-elevi.md), nu retrofitat. E motivul pentru care acest
epic apare în pista de fundație și nu la sfârșit.

**Retenția contabilă intră în conflict cu dreptul la ștergere.** Facturile trebuie păstrate ani de
zile; datele personale trebuie șterse la cerere. Rezolvarea e anonimizarea, nu ștergerea, și
trebuie proiectată explicit.

## Definition of done

Fiecare categorie de date personale are temei legal și termen de păstrare. Consimțământul e
granular, revocabil și respectat automat. Pentru orice înscriere se știe, din platformă, dacă există
contract semnat, din ce dată și în ce versiune. Un audit extern ar găsi documentație, nu
improvizație.

## Decizii luate

**Se fotografiază lucrarea, nu copilul.** Regulă tare de la bun început, nu avertisment în procedură:
fără fețe, fără copii în cadru. Din ea decurg două lucruri. Al cincilea scop de consimțământ propus
mai devreme — fotografierea copilului la curs — a ieșit din S2, fiindcă nu mai are obiect: nu se
consimte un act care nu se produce. Și problema copilului din fundal — poza unei lucrări care prinde
în trecere copilul altei familii — dispare structural, nu prin verificare manuală înainte de
publicare.

**Fără detecție automată de fețe și fără blurare.** Ar fi răspunsul reflex la problema de mai sus, și
ar fi fost greșit și atunci când problema exista. Un model de detecție ar rula pe aceeași instanță
care ține și Postgres — vezi [E01](E01-infrastructura-medii.md) — pentru câteva zeci de fotografii pe
săptămână, și ar rata exact cazurile grele, un profil parțial în penumbră, deci ar produce încredere
falsă tocmai acolo unde ochiul omului ar fi contat. Soluția ieftină e să nu existe fața în cadru. Se
reia discuția doar dacă regula de fotografiere se schimbă.

**Livrarea e privată.** Proiectul și emailul declanșat de admin din [E14](E14-proiecte-elevi.md) ajung
exclusiv la părintele copilului respectiv; nimic nu pleacă spre alte familii. De aceea „partajarea proiectului
cu ceilalți părinți din grupă" a ieșit din lista de scopuri din S2 — un consimțământ pentru o
difuzare care nu se face rămâne, totuși, un câmp de cerut, de stocat și de verificat.

**Contractul de înscriere se semnează pe hârtie.** Platforma reține faptul, data și, dacă e cazul,
versiunea — nu textul și nu acceptarea. Vezi S8.

**Nu există rol de profesor, deci E07 nu mai blochează E09 azi.** Cei doi oameni care predau sunt
proprietarii școlii și au rol de admin; rolurile `TEACHER` și `LOCATION_MANAGER` nu se implementează
acum. Cade odată cu ele și decizia „profesorul vede datele de contact complete ale părinților din
grupele lui", care era singurul motiv pentru care [E09](E09-personal-roluri.md) S2 avea nevoie de
jurnalul din S3: nu se consemnează un acces în plus care nu se acordă nimănui. S3 rămâne în scop din
celelalte motive din [Problemă](#problemă) — o factură modificată fără urmă e independentă de cine
predă. Se reia, cu dependență cu tot, la primul profesor care nu e proprietar.

**Fără drept de retragere în 14 zile.** Termenii din S5 nu trebuie să acopere OUG 34/2014, cum se
scrisese aici mai devreme, fiindcă nu se mai încheie contract la distanță: nu există auto-înscriere,
contul de părinte se aprobă de admin, copilul e înscris de admin, iar contractul se semnează față în
față. Regula „fără returnare la abandon" din [E15](E15-pricing-facturare.md) rămâne o clauză
contractuală obișnuită, de validat de avocat ca oricare alta, nu o derogare de la un drept legal.
Întrebarea se repune în clipa în care apare înscriere sau plată online fără contract semnat înainte —
atunci contractul redevine încheiat la distanță, iar corectura trebuie făcută *înainte* de
redactarea termenilor, nu după.

## Întrebări deschise

- Cine e responsabilul cu protecția datelor? La dimensiunea asta nu e obligatoriu un DPO formal,
  dar cineva trebuie să fie punctul de contact.
- Vârsta de la care copilul însuși are drepturi de acces? În România, consimțământul digital e la 16
  ani, dar copiii școlii sunt sub. Deci contul e mereu al părintelui.
