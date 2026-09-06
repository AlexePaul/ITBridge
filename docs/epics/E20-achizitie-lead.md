# E20 · Achiziție, lecții de probă și lead management

**Status:** în lucru · **Pistă:** Public · **Depinde de:** E17, E18 · **Blochează:** —

**Livrate:** S1, S2, S3 și S4 — modelul de lead, programarea publică la probă, urmărirea și pâlnia.
S5 era deja livrat, redus prin decizie la o reducere dată de mână. **Rămâne** un singur lucru, și nu
e cod: pagina `/proba` cere backend-ul, deci nu poate fi adusă pe `release/prod` până nu rulează
unul ([E01](E01-infrastructura-medii.md), S4). Până atunci fluxul e complet, testat, și nu-l vede
niciun părinte.

## Problemă

Site-ul are un formular de contact — `apps/web/app/pages/contact.vue`, cu ruta
`apps/web/server/api/contact.post.ts` și schema partajată în `apps/web/shared/contact.ts` — dar
mesajul pleacă pe email către adresa școlii și nu lasă nicio urmă în platformă. Nu există programare
la probă, nu există noțiunea de lead.

Deci pâlnia se termină într-o cutie poștală. Nu se poate spune câte cereri au fost, care a rămas
fără răspuns, sau care s-a transformat în înscriere — informația trăiește în inbox, în ordinea în
care a sosit, și dispare odată cu el. Iar cine vrea o probă tot trebuie să sune, fiindcă formularul
nu programează nimic: cere efort și curaj, mai ales seara, când oamenii caută de fapt.

Epicul repară a doua jumătate, nu prima: **mesajul de contact rămâne un email**, iar pâlnia se
măsoară de la programarea la probă încolo. Motivul e în [Decizii luate](#decizii-luate).

Ce lipsește complet:

- **Nu există noțiunea de lead.** Cineva care întreabă și nu se înscrie nu lasă nicio urmă în
  platformă. Nu poți reveni la el, nu poți ști câți au fost.
- **Nu există programare la lecție de probă**, deși proba e mecanismul principal de conversie într-o
  școală.
- **Nu se măsoară nimic.** Nu știi de unde vin oamenii, câți întreabă, câți vin la probă, câți se
  înscriu. Deci nu poți ști ce funcționează.
- **Nu există urmărire.** Un părinte care a întrebat în septembrie și a zis "poate în primăvară" e
  pierdut definitiv.
- **Nu există recomandări.** Într-o școală pentru copii, recomandarea între părinți e cel mai
  puternic canal, și nu e sprijinită de nimic.

Cu două locații și ambiția de creștere, e cea mai mare gaură din tot planul: se investește în
[E18](E18-frontend-portal.md) și [E19](E19-seo-geo.md) ca să vină oameni pe site, iar site-ul nu
are ce face cu ei.

## Rezultat

Un părinte interesat își programează singur o lecție de probă, în două minute, fără să sune. Fiecare
cerere e urmărită până la înscriere sau la un "nu" explicit. Se știe ce canal aduce familii.

Capătul pâlniei rămâne o decizie de om: după probă, înscrierea o face adminul, nu părintele din
portal — vezi [Decizii luate](#decizii-luate). Ce trebuie să facă platforma acolo nu e să aștepte un
click de la părinte, ci să nu-l lase pe admin să uite.

## În scop

- Modelul de lead, cu sursă și stare.
- Programare la lecție de probă, direct din site.
- Urmărire, memento-uri și lista de probe ținute fără decizie.
- Măsurarea pâlniei.
- Program de recomandare.

## În afara scopului

- Conținutul care aduce trafic — vezi [E19](E19-seo-geo.md).
- **Înscrierea propriu-zisă** și ce se întâmplă după ea — vezi [E11](E11-inscrieri-capacitate.md).
  E o operațiune de admin, nu una de portal; E20 se termină cu lead-ul pregătit pentru ea și cu
  faptul înregistrat după ce s-a făcut.
- **Formularul de contact.** Rămâne exact cum e: trimite un email din ruta Nitro și nu lasă urmă în
  platformă — vezi [Decizii luate](#decizii-luate).

## Story-uri

### S1 · Modelul de lead

`Lead`: date de contact, copil (vârstă, experiență), interes (modul, locație), sursă, canal, stare
(`nou`, `contactat`, `probă programată`, `probă ținută`, `înscris`, `pierdut`), motiv la pierdere,
responsabil, note, dată de urmărire.

Stările sunt descriptive, nu un motor: niciuna nu se atinge de la sine. `înscris` în particular e
pusă de admin, în momentul în care chiar face înscrierea din [E11](E11-inscrieri-capacitate.md) —
lead-ul înregistrează decizia, nu o produce.

La înscriere — operațiune de admin, nu a părintelui — lead-ul se transformă în `Profile` plus
`Child`, păstrând legătura, ca să se poată raporta ulterior costul de achiziție pe familie.

**Acceptanță:** fiecare cerere din orice canal creează un lead. Niciunul nu rămâne fără responsabil.

**Livrat.** `Lead` în `apps/api/src/entities/lead.entity.ts`, cu `LeadStatus`, `LeadSource` și
`LeadChannel` ca enum-uri proprii. Trei lucruri de știut:

- **Lead-ul își ține propria copie a datelor de contact, și asta e o decizie.** O programare de pe
  site chiar creează un `Profile` și un `Child` — un loc nu poate fi ținut de un rând fără copil în
  el, iar proba trebuie să apară în catalogul grupei — dar profilul acela e o coajă: fără cont, și
  **fără email și fără telefon**. Coloanele alea două sunt unice pe `profiles`, deci un formular
  public care ar scrie în ele ori s-ar ciocni de o familie reală, ori, mai rău, ar lega un copil de
  ea. Datele familiei stau pe lead până când un admin le pune pe profil, deliberat, la înscriere.
- **Sursa și canalul sunt două întrebări diferite.** `source` e cum a ajuns cererea la școală și se
  știe întotdeauna (formularul scrie `trial_form`); `channel` e de unde spune familia că a auzit de
  noi, e opțional și e **declarat**, nu dedus. O familie care a găsit școala pe Google și apoi a sunat
  are amândouă, iar o singură coloană ar păstra-o pe ultima scrisă.
- **Responsabilul poate lipsi, și acceptanța e îndeplinită făcând asta zgomotos, nu pretinzând.** Nu
  există model de personal (E09 e scos din MVP) și toți cei care se autentifică sunt admini, deci o
  atribuire automată către primul din tabel ar pune un nume pe un rând cu care n-a fost nimeni de
  acord. Cererile fără responsabil sunt primele pe ecranul de urmărire și sunt numărate în mesajul
  zilnic; preluarea e un click. Singura excepție e lead-ul scris de un admin la telefon: acela e al
  lui, fiindcă e singurul moment în care nu se ghicește nimic.

**Patru din cele șase stări nu se scriu de la niciun ecran.** `trial_scheduled` vine din programare,
`trial_held` din catalog, `enrolled` și `lost` din rezolvarea probei în [E11](E11-inscrieri-capacitate.md).
`UpdateLeadDto` **nu are câmp `status`**, iar cele două stări pe care le declară un om — „contactat"
și „pierdut" — au endpoint-uri proprii. Un câmp de stare pe un PATCH ar fi lăsat un ecran să scrie
`înscris` pe o familie pe care n-a înscris-o nimeni, iar aia e cifra pe care se sprijină tot S4.

### S2 · Programare la lecție de probă

Un flux public, fără cont: alege locația, vezi grupele compatibile cu vârsta copilului și cu locuri
libere — date din [E11](E11-inscrieri-capacitate.md) — alege ora, lasă datele, primești confirmare.

Sub două minute, fără telefon, funcțional pe mobil. Confirmarea și memento-ul cu o zi înainte pleacă
prin [E17](E17-comunicare-notificari.md).

**„Cu locuri libere" e o condiție tare, nu un filtru de curtoazie.** O probă ocupă unul dintre cele
10 locuri ale sălii cât ține — [E11](E11-inscrieri-capacitate.md), D7 —, deci o grupă plină nu poate
primi un copil la probă și **formularul public nu are voie să o ofere**. Locurile libere se
calculează la fel peste tot: capacitatea grupei minus înscrierile active minus probele deja
programate.

Practic, asta cere trei lucruri de la S2:

- Lista de ore afișată se construiește din grupele cu cel puțin un loc liber, nu din toate grupele
  compatibile ca vârstă.
- Verificarea se reface **la trimitere**, nu doar la afișare. Între momentul în care părintele
  deschide pagina și cel în care apasă butonul, ultimul loc poate fi luat de altcineva sau de un
  admin din interfață; ecranul e o fotografie, nu o rezervare.
- Când nu mai există niciun loc la locația și vârsta cerute, fluxul nu se termină într-un mesaj de
  eroare. Colectează aceleași date și creează un lead fără probă programată, marcat „nu erau
  locuri" — de unde adminul îl pune pe lista de așteptare din [E11](E11-inscrieri-capacitate.md) S3,
  care e prin D2 tot o operațiune de admin. Părintele nu se pune singur pe listă, dar nici nu pleacă
  de pe site fără să lase nimic, ceea ce e singurul rezultat cu adevărat prost.

**Fluxul rămâne public și după decizia de a nu avea auto-înscriere**, fiindcă nu e o înscriere: o
programare la probă e un lead, nu o obligație, și nu creează cont. Contul de părinte vine mai
târziu, creat sau aprobat de admin — vezi [Decizii luate](#decizii-luate); niciun cont ieșit din
formularul ăsta nu e activ de la sine. Confirmarea trimisă părintelui spune ce s-a întâmplat — un loc
rezervat la o probă — și nu promite un cont, un loc în grupă sau un pas următor pe care l-ar face
singur.

E un formular public care scrie în baza de date date despre un copil, deci are nevoie de aceeași
protecție ca formularul de contact — și tiparul e deja scris. Ruta de contact are un honeypot
(`HONEYPOT_FIELD` din `apps/web/shared/contact.ts`, verificat în rută, care răspunde 200 și nu
trimite nimic) și o limită de cinci trimiteri la 15 minute per IP. Cât valorează a doua o spune
singur comentariul din `apps/web/server/utils/rate-limit.ts`: contorul stă în memoria unei instanțe
serverless, deci prinde bucla care cade pe o instanță caldă, nu o inundație distribuită. Pragul a
fost ales pentru un email; aici, unde fiecare trimitere devine un rând în bază, se reevaluează.
Cerința rămâne cea veche — protecție care nu enervează un părinte real.

**Acceptanță:** o programare completă durează sub două minute pe telefon. Proba apare direct în
lista de prezență a grupei, iar numărul de locuri libere al grupei scade cu unu. O grupă plină nu
apare deloc printre orele oferite, iar o trimitere pentru un loc luat între timp e refuzată, cu
oferta de a fi contactat. Un mesaj prins de honeypot nu creează lead, iar expeditorul primește
același răspuns ca la o trimitere reușită.

**Livrat.** Pagina e `/proba`, endpoint-urile sunt `GET /trial/slots` și `POST /trial/bookings`, iar
serviciul e `apps/api/src/modules/lead/trial-booking.service.ts`. Sunt **singurele două rute publice
din aplicație** în afară de autentificare și health, și sunt în lista albă din
`authorization.spec.ts` pe nume, cu motivul scris acolo.

Ce nu se vede la citirea codului:

- **Nu se creează niciun cont, dar locul e real.** Programarea scrie `Profile` + `Child` +
  o înscriere `TRIAL`, toate într-o singură tranzacție, iar înscrierea trece prin
  `EnrollmentService.enrol` — aceeași funcție prin care trece un admin. Deci capacitatea, regula „o
  singură înscriere în vigoare" și `Child.group` sunt aplicate o singură dată, într-un singur loc, iar
  proba apare în catalog fiindcă e o înscriere, nu fiindcă a copiat-o cineva acolo.
- **`enrol` acceptă acum un `EntityManager`.** Fără el, tranzacția lui ar fi fost una nouă, iar un loc
  ocupat de o programare care apoi eșuează e un loc pe care nimeni nu-l mai găsește.
- **Grupa se blochează pe rând (`SELECT … FOR UPDATE`) cât ține verificarea de capacitate.** Numărarea
  urmată de inserare o pot face două tranzacții deodată și amândouă găsesc loc: verificarea n-a fost
  niciodată garanția, ci doar motivul pentru care refuzul are cuvinte în el. Doi admini care apasă în
  aceeași secundă era rar; doi părinți pe formular la 20:00 nu e.
- **Se filtrează datele, nu grupele.** Locurile se numără **pe ședință**, prin
  `EnrollmentService.freeSeatsAtSessions`, fiindcă asta alege părintele: o grupă cu un singur loc
  liber n-are niciunul în ziua în care cineva și-a programat o recuperare (D7 din nou — un copil
  care vine în recuperare stă pe un scaun fără să fie înscris în nimic), și are din nou peste o
  săptămână. O grupă căreia i s-au ocupat toate orele nu apare deloc, în loc să apară cu o listă
  goală de date.
- **Vârsta e filtru tare aici, deși în E11 e avertisment.** Un admin care trece peste banda de vârstă
  face o judecată despre un copil anume, pe care l-a cunoscut. Un formular public n-are cine să facă
  judecata aia, deci oferă doar ce se potrivește.
- **Verificarea de la trimitere e pe ora aleasă**, nu doar pe grupă, și e în tranzacție: între
  fotografia pe care a văzut-o părintele și butonul pe care l-a apăsat se poate strecura o
  recuperare programată exact pe acea oră. `enrol` verifică grupa, care e cealaltă jumătate a lui D7.
- **A doua apăsare nu creează al doilea copil.** `Lead.bookingKey` — copilul, ora și familia, hash-uite
  — are index unic, iar a doua trimitere primește primul răspuns. Pe formularul de contact o dublură
  însemna un al doilea email; aici ar fi însemnat un al doilea copil și un al doilea loc dintr-o sală
  de zece.
- **Honeypot-ul e în pagină, nu în API.** Validarea backend-ului e `forbidNonWhitelisted`, deci un
  câmp în plus ar fi 400, nu o capcană. În schimb API-ul are limitare de rată adevărată (5 trimiteri
  pe minut pe IP, în proces, nu în memoria unei instanțe serverless ca la contact).

**Cele trei sfârșituri, dintre care unul singur arată a refuz.** Ora e liberă și proba se programează;
părintele n-a găsit nicio oră și cererea rămâne ca lead marcat „fără loc"; sau locul a plecat între
încărcarea paginii și apăsarea butonului — iar ăsta se termină **la fel ca al doilea**, nu cu o
eroare. Ecranul e o fotografie, nu o rezervare, iar cel mai prost rezultat al unei curse nu e o pagină
de eroare, e o familie care pleacă fără ca școala să știe că a trecut pe acolo.

**Pagina asta e singura pagină publică ce atinge backend-ul**, și e scrisă să pice moale: orele se
încarcă doar în client, iar dacă nu se pot încărca, formularul tot se trimite și cititorul primește
numărul de telefon. Consecința pentru [cele două branch-uri](../../CLAUDE.md): `/proba` **nu se
aduce pe `release/prod`** până nu rulează un backend, fiindcă acolo ar fi o pagină de conversie care
nu poate afișa nicio oră.

### S3 · Urmărire

Fiecare lead are următorul pas cu termen. Lead-urile fără activitate ies în evidență. Cel care nu s-a
prezentat la probă e recontactat automat. Cel care a zis "poate mai târziu" primește memento la data
stabilită.

Story-ul ăsta poartă toată greutatea deciziei că înscrierea nu e self-service. Dacă părintele s-ar
înscrie singur, ultimul pas al pâlniei s-ar închide de la sine și lista de urmărire ar fi un lux.
Cum îl face adminul, pâlnia se oprește exact acolo unde nimeni nu e obligat să se uite — iar un lead
care a fost la probă și a plăcut e cel mai scump lucru pe care îl poate pierde școala, fiindcă a
consumat deja un loc, un profesor și o oră de curs.

Deci ecranul central nu e „toate lead-urile", ci **„probe ținute, fără decizie"**: cine a venit, la
ce grupă și la ce locație, acum câte zile, cine răspunde. Din el se iese în două feluri, amândouă
explicite — înscriere, făcută tot de admin în [E11](E11-inscrieri-capacitate.md), sau `pierdut` cu
motiv. Nu există ieșire tăcută: un lead nu părăsește lista pentru că a trecut timpul.

Starea `probă ținută` o pune prezența, nu o bifă separată — copilul e trecut prezent la ședința de
probă, iar lead-ul se mută singur. Altfel lista ar depinde de aceeași atenție de admin pe care e
menită să o suplinească.

**Acceptanță:** niciun lead nu stă mai mult de șapte zile fără acțiune, fără ca cineva să fie
anunțat. Lista „probe ținute, fără decizie" e goală doar când fiecare probă din ea s-a terminat cu
o înscriere sau cu un motiv de pierdere scris.

**Livrat.** Ecranul e `/admin/leads` și e construit în ordinea a cât costă pierderea unei familii, nu
în ordinea în care au venit rândurile: probele ținute primele, apoi cererile fără loc, apoi ce a
amuțit, apoi ce e scadent azi. Mesajul zilnic către birou (`lead-reminders.job.ts`, 09:00 pe ceasul
școlii) e făcut din exact aceleași patru liste — o zi liniștită nu trimite nimic, ca la mementoul de
prezență, fiindcă un mesaj care vine și în zilele bune e un mesaj pe care oamenii îl filtrează.

- **Starea „probă ținută" o pune catalogul.** `LeadProgressService.markTrialHeld` e chemat din
  `AttendanceService`, lângă `settleMakeUp` și din amândouă căile de scriere. O bifă separată ar fi
  depins de exact atenția de admin pe care ecranul e menit s-o suplinească. Corectarea unui marcaj
  greșit dă înapoi, la fel ca revocarea unui credit de recuperare.
- **`lastActivityAt` e o coloană proprie, nu `updatedAt`.** Job-ul nu scrie nimic în ea, deci un lead
  nu poate deveni „proaspăt" fiindcă a fost amintit.
- **Un catalog nemarcat nu e o absență.** Recontactarea după neprezentare cere ca cineva să fi marcat
  ședința: a-i spune unei familii că a lipsit de la o oră la care poate a fost e mai rău decât să nu
  spui nimic, iar catalogul nemarcat e vânat separat, în E12/S7.
- **Nu există ieșire tăcută.** `POST /leads/:id/lost` cere un motiv (`@Length(3, 255)`), iar o familie
  deja înscrisă nu se poate închide de aici: aia e o înscriere de încheiat în E11, nu o cerere.

### S4 · Măsurarea pâlniei

Vizitator, cerere, probă programată, probă ținută, înscriere — cu rate de conversie între etape, pe
sursă și pe locație. Intră în [E21](E21-raportare-analytics.md).

Cea mai importantă cifră e conversia de la probă ținută la înscriere. Dacă e mică, problema e la
curs, nu la marketing — și e o informație pe care nu o poți afla altfel.

Cu înscrierea făcută de admin, cifra asta măsoară două lucruri deodată și trebuie citită ca atare:
dacă familiei i-a plăcut proba, **și** dacă cineva a apucat să o înscrie. Un raport care le confundă
transformă o problemă de urmărire într-o concluzie greșită despre curs. De aceea se măsoară separat
și timpul de la probă ținută la decizie — dacă mediana crește, vinovată e lista din S3, nu ora de
curs.

A doua cifră de urmărit e **cererile care nu au găsit loc**: câți au ajuns la formular și au plecat
fără oră de probă, pe locație și pe vârstă. E singura măsură a cererii pe care școala nu o poate
servi, și e invizibilă altfel — un părinte care nu găsește nicio oră liberă nu apare în nicio rată de
conversie, fiindcă n-a intrat niciodată în pâlnie.

**Acceptanță:** raportul răspunde la "ce canal aduce cele mai multe înscrieri, și la ce cost", și la
"câți oameni am refuzat luna asta fiindcă erau grupele pline".

**Livrat**, ca a treia filă din `/admin/rapoarte` — „Pâlnia" — servită de `GET /reports/funnel`.
Numărătoarea stă în `apps/api/src/modules/lead/lead-funnel.service.ts`, adică în modulul care deține
lead-urile, nu în `dashboard/`: regula lui E21 e că un raport cere cifra de la serviciul care deține
întrebarea, iar un al doilea `SELECT FROM leads` ar fi a doua definiție a fiecărui număr de pe ecran.

Trei lucruri de citit cu grijă:

- **Cohorta e după data cererii, nu după data evenimentului.** O familie care a întrebat în august și
  s-a înscris în septembrie e numărată în august, pe amândouă liniile. Altfel o lună bună ar produce
  rate peste 100%, iar întrebarea la care răspunde raportul s-ar schimba din „ce s-a întâmplat cu
  oamenii care au venit la noi" în „cât de ocupat a fost biroul".
- **Pâlnia numără trecerea, nu ocuparea.** O familie înscrisă a trecut și prin „probă ținută", iar o
  linie care ar scoate-o de acolo în clipa înscrierii ar scădea exact atunci când școala se descurcă
  mai bine. `lost` e în mod deliberat în afara ordinii: plecarea nu spune nimic despre cât de departe
  ai ajuns, deci un lead pierdut e judecat după urmele lăsate.
- **Mediana până la decizie merge lipită de conversia probă→înscriere**, fiindcă aia măsoară două
  lucruri deodată: dacă familiei i-a plăcut ora, și dacă a apucat cineva s-o înscrie. Dacă rata scade
  în timp ce mediana crește, de vină e lista din S3, nu ora de curs — și fără a doua cifră nu se
  poate spune care.
- **Cererile fără loc sunt în afara oricărei rate**, și asta e tot rostul lor: un părinte care nu
  găsește nicio oră liberă nu intră niciodată în pâlnie, deci nu apare în nicio conversie. Sunt
  numărate separat, pe locație și pe bandă de vârstă, cu aceeași funcție `bandFor` cu care E11/S7
  grupează cererea neacoperită.

### S5 · Recomandări — **redus prin decizie la o reducere dată de mână**

Un părinte existent recomandă altul. **Amândouă familiile primesc jumătate de factură** — cea care a
recomandat la următoarea, cea nou-venită la prima ei.

Într-o școală pentru copii, e cel mai ieftin și mai eficient canal, pentru că părinții vorbesc
oricum între ei. Ce s-a hotărât e că merită **onorat**, nu automatizat.

**Reducerea o acordă patronul, manual. Nu există cod de recomandare, nu există legătură de
generat, nu există nimic de dat mai departe.** Vezi [Decizii luate](#decizii-luate) — mecanismul de
atribuire, care era tot costul story-ului, a fost tăiat.

Ce a rămas din story, deci, e o linie de reducere pe factura următoare, cu numele „Recomandare".
Ce a căzut: legătura generată din portal, urmărirea sursei pe lead, aplicarea automată la înscriere,
și măsurarea canalului în pâlnia din S4 — recomandările nu vor apărea acolo ca sursă, fiindcă nimic
nu le înregistrează ca atare.

**Acceptanță:** patronul poate pune, pe factura fiecăreia dintre cele două familii, o reducere de 50%
din total, numită „Recomandare", iar facturile ies exact la jumătate.

**Livrat, atât cât înseamnă decizia.** Tipul procentual din [E15](E15-pricing-facturare.md) S5
există, iar reducerile se acordă din `/admin/reduceri` — formularul se deschide direct pe
„Recomandare, procent, 50", fiindcă ăsta e cazul pentru care ecranul a fost făcut, și avertizează că
o recomandare înseamnă **două** reduceri, fiindcă a uita a doua jumătate e greșeala evidentă.

Regula e acum a platformei, nu a celui care socotește: 50% urmăresc totalul real al lunii, deci o
lună scurtă de trei ședințe (262,50) se înjumătățește la 131,25 — lucru pe care o sumă fixă de 175
l-ar fi greșit cu 43,75 fără ca cineva să observe.

**Ce nu s-a construit, tot prin decizie:** nimic nu leagă cele două reduceri între ele. Sunt două
rânduri independente, cu același nume, pe două familii. Legătura ar fi exact mașinăria de atribuire
tăiată mai jos, iar ecranul o înlocuiește cu singurul lucru care e nevoie de fapt: o propoziție care
îți amintește să dai și a doua.

**Care factură, pentru fiecare:** pentru familia care a recomandat, prima emisă **după ce copilul
recomandat chiar a început** — nu după probă. Proba e gratuită și poate să nu se transforme în
înscriere, iar o reducere dată pe o probă care nu continuă e un cadou, nu o recomandare. Pentru
familia nou-venită, prima ei factură, care e oricum de după acel moment.

Momentul de declanșare e deci același pentru amândouă — începutul efectiv — și e o presupunere
scrisă aici ca să fie contrazisă dacă e greșită, nu o regulă venită de la patron.

## Dependențe

[E17](E17-comunicare-notificari.md) pentru confirmări și memento-uri,
[E18](E18-frontend-portal.md) pentru interfață, [E11](E11-inscrieri-capacitate.md) pentru locurile
disponibile.

## Riscuri

**Un lead colectat și necontactat e mai rău decât unul necolectat.** Părintele a făcut un pas și a
fost ignorat. Sistemul nu trebuie pornit înainte să existe cineva care răspunde, cu termen asumat.

Cazul cel mai scump e la celălalt capăt: o familie care a venit la probă, a plăcut, și pe care nu o
înscrie nimeni fiindcă pasul final e manual. Costul e deja plătit — locul, profesorul, ora — iar
părintele nu are de unde ști că mai trebuie să insiste. Ăsta e riscul pe care S3 e construit să-l
acopere.

**Datele lead-urilor sunt date personale, inclusiv despre copii.** Intră integral sub
[E07](E07-securitate-gdpr.md): temei legal, termen de păstrare pentru cei care nu se înscriu,
consimțământ pentru comunicări comerciale.

**Riscul de suprapopulare cu probe s-a închis, și s-a mutat.** Formularul nu poate umple o grupă cu
copii noi, fiindcă fiecare probă consumă un loc din cele 10 ale sălii și grupele pline nu se mai
oferă — [E11](E11-inscrieri-capacitate.md), D7. Ce rămâne e riscul invers: **pâlnia se oprește când
grupele sunt pline.** Un părinte care găsește site-ul în octombrie, la mijloc de modul, poate să nu
aibă nicio oră de ales. Măsura nu e tehnică — sunt săli și grupe în plus, adică o decizie de
business, luată din cifrele lui S4 — dar platforma trebuie să o facă vizibilă: câte cereri au ajuns
la „nu erau locuri", pe locație și pe vârstă, e cifra care spune când merită deschisă o grupă nouă.

## Definition of done

Programarea la probă funcționează fără telefon și nu promite niciodată un loc care nu există. Fiecare
lead are stare și responsabil. Nicio probă ținută nu rămâne fără decizie scrisă — înscriere sau motiv
de pierdere. Pâlnia se măsoară pe sursă și pe locație, inclusiv cererile oprite de lipsa locurilor.

## Decizii luate

**Formularul de contact rămâne pe email, trimis din frontend.** Nu scrie `Lead`, nu atinge
backend-ul, nu se schimbă.

Alternativa — aceeași trimitere produce și un rând în Postgres — sună ieftin și nu e. Cele șapte
pagini publice funcționează astăzi fără `API_BASE`, și exact de aceea site-ul stă în producție deși
backend-ul nu e deployat nicăieri. Un formular care cere API-ul leagă singura pagină de conversie de
singura instanță EC2, iar ca să nu o lege trebuie o ramură de rezervă: dacă API-ul tace, mesajul tot
pleacă pe email și lead-ul lipsește. Adică două căi de scriere și o stare parțială de întreținut,
pentru un mesaj care oricum ajunge la un om care îl citește.

Costul deciziei, spus pe față: **un mesaj de contact nu lasă nicio urmă în platformă.** Nu se poate
număra câte întrebări au venit, nici ce s-a ales din ele. Se acceptă, pentru că întrebarea care
contează comercial nu e „câți au scris", ci „câți au venit la probă și câți s-au înscris" — iar aia
se măsoară din S2 încolo, unde există oricum un rând, fiindcă o programare are dată, copil și
locație.

Se reia dacă volumul de mesaje ajunge să nu mai încapă într-un inbox, sau dacă cineva chiar
întreabă care a rămas fără răspuns.

**Recomandările se onorează, nu se automatizează: 50% de fiecare parte, date de patron.**

Un părinte care aduce altul primește următoarea factură la jumătate, iar familia nou-venită primește
prima ei factură la jumătate. Fără cod de recomandare, fără legătură de generat din portal, fără
atribuire automată.

Motivul e că **tot costul unui sistem de recomandări e mașinăria de atribuire**, nu beneficiul: coduri
care trebuie generate, distribuite și verificate; legături care trebuie să supraviețuiască unui
WhatsApp; reguli pentru cine ia beneficiul când doi părinți revendică aceeași familie; și o
verificare împotriva părintelui care se recomandă singur cu a doua adresă de email. Asta e mașinărie
care rezolvă problema atribuirii **la scară**.

Școala nu e la scara aia și, mai important, nu are problema. Sunt sub o sută de familii și un om care
le știe pe nume. Când vine o familie nouă, spune la telefon cine i-a trimis — pentru că așa vorbesc
oamenii, nu pentru că i-ar cere cineva un cod. Atribuirea e deja rezolvată, de conversație, gratis și
mai corect decât ar face-o orice link.

Ce cumpărăm cu decizia asta: beneficiul există de mâine, ca linie pe o factură, în loc să existe
peste un epic. Ce plătim, spus pe față: **canalul nu se măsoară.** Nu vom putea spune câte înscrieri
au venit din recomandări, fiindcă nimic nu le marchează ca atare — S4 va număra o familie recomandată
la fel ca una venită de pe Google. Se acceptă cât timp răspunsul la „de unde vin copiii" se poate da
din memorie; se reia în ziua în care nu se mai poate.

Regula concretă e **50% din totalul facturii**, nu 50% din tariful unui copil: reducerea e a familiei,
la fel ca prețul, care numără frații împreună. Iar plafonul din [E15](E15-pricing-facturare.md) S5 —
o reducere nu duce totalul sub zero — se aplică și aici, deși la 50% nu are cum să muște.

**De ce se oferă atât de mult, în cifrele patronului.** Două reduceri de 50% pe aceeași recomandare
înseamnă că școala renunță, cumulat, la **echivalentul unei luni întregi** — una dintre cele două
familii a stat, practic, o lună pe gratis. Dar luna aia se plătește o singură dată, iar ce urmează
după ea e un abonament lunar care continuă. Costul e unic; venitul se repetă. La al doilea sau al
treilea ciclu de facturare, recomandarea e deja pe plus, și rămâne acolo.

Consecința pe care aritmetica asta o rezolvă din mers: **nu există plafon la numărul de recomandări.**
Un părinte foarte sociabil care aduce cinci familii primește cinci facturi la jumătate — adică două
luni și jumătate de reducere, contra cinci abonamente care încep. Costul crește exact odată cu lucrul
care îl plătește, deci un plafon ar limita fix cazul cel mai bun. Se reia doar dacă apare un tipar
care nu seamănă a recomandare — aceeași familie „recomandată" de mai multe ori, sau familii care
dispar imediat după luna cu reducere.

**Înscrierea nu e self-service. Programarea la probă rămâne publică.**

Cele două jumătăți ale pâlniei se despart aici, și e o despărțire voită. Programarea la probă e
publică, anonimă și fără cont: e un lead, nu o obligație, iar bariera de intrare trebuie să rămână
cât mai jos — de aceea S2 nu se schimbă cu nimic. Înscrierea, în schimb, nu se face din portal.
Adminul creează sau aprobă contul de părinte, adminul pune copilul în grupă. Un cont nou de părinte e
inactiv până la aprobare.

Motivul e că înscrierea nu e o formalitate: presupune un loc verificat în grupă, un contract semnat
pe hârtie și date de facturare complete. Un buton „mă înscriu" ar declara toate trei ca fiind
rezolvate, când de fapt niciunul nu e — și ar produce înscrieri pe care cineva tot le-ar corecta
manual, doar că după ce familia a primit deja confirmarea.

Consecințele pentru epicul ăsta, pe rând:

- **Măsurarea nu se schimbă.** Conversia care contează rămâne probă ținută → înscriere (S4). Ce se
  schimbă e cine produce evenimentul final: un admin, nu părintele.
- **Pasul final e o acțiune de om, deci se poate rata.** De aici cerința tare din S3: lista
  „probe ținute, fără decizie", cu vechime și responsabil. Platforma nu așteaptă ca părintele să
  apese ceva — nu are ce apăsa.
- **Niciun text public nu promite înscriere imediată.** Confirmarea probei, paginile de curs și
  mesajele din [E17](E17-comunicare-notificari.md) spun „vă contactăm după probă", nu „vă puteți
  înscrie din cont".

Se reia dacă apare vreodată plată online fără contract pe hârtie — vezi mai jos, e același nod.

**Nu se pune problema retragerii în 14 zile.** Fără auto-înscriere și fără acceptare digitală a
contractului, nu se încheie niciun contract la distanță, deci OUG 34/2014 nu se aplică pâlniei
ăsteia. Recomandarea contrară, formulată în [E15](E15-pricing-facturare.md) înainte de decizie, nu
mai are obiect. Se repune întrebarea în clipa în care apare fie înscriere din portal, fie plată
online fără contract semnat fizic — atunci formularul de programare devine primul pas al unei
relații contractuale, nu doar o cerere de informații.

**O probă ocupă un loc din grupă. Nu există plafon separat de probe.**

Întrebarea „câte probe simultane suportă o grupă fără să deranjeze cursul" avea un răspuns implicit
greșit — că ar exista un al doilea număr, de reglat separat. Nu există. Sala are 10 locuri, un copil
la probă stă pe unul dintre ele, iar grupa e plină când înscrierile active plus probele programate
ajung la capacitate. Vezi [E11](E11-inscrieri-capacitate.md), D7, unde e regula.

Un plafon separat ar fi însemnat două numere pentru aceeași sală, care se pot contrazice: „maxim 3
probe" într-o grupă cu un singur loc liber promite trei scaune care nu există. Efectul căutat —
cursul să nu fie deraiat de patru copii noi deodată — se obține oricum, fiindcă cele patru locuri
trebuie să fie libere ca să poată fi oferite.

Pentru S2, consecința e directă: **formularul public nu poate oferi o grupă fără loc liber.** Nu ca
politețe de interfață, ci fiindcă e aceeași verificare de capacitate care refuză o înscriere, făcută
în același loc.

**Proba e gratuită** — vezi [E11](E11-inscrieri-capacitate.md).

Pentru acest epic, consecința e că S2 și S3 se schimbă la fel de mult ca S1:

- **Volumul de programări va fi mai mare, calitatea mai mică.** Măsurarea din S4 devine esențială,
  pentru că fără miză financiară rata de neprezentare e singurul semnal de calitate a canalului.
- **Memento-ul înainte de probă nu e o rafinare, e o cerință.** Fără el, neprezentările la o probă
  gratuită ajung frecvent la o treime.
- **Conversia care contează e probă ținută → înscriere**, nu programare → înscriere. A doua
  amestecă două probleme diferite: dacă oamenii vin, și dacă le place cursul.

## Întrebări deschise

- **Cine răspunde lead-urilor, și în cât timp?** Rămâne deschisă, și e singura care poate opri
  pornirea sistemului: riscul scris mai sus spune că un lead colectat și necontactat e mai rău decât
  unul necolectat. Platforma a făcut ce putea face fără răspuns — cererile fără responsabil sunt
  primele pe ecran și sunt numărate în mesajul de dimineață — dar un nume și un termen sunt o decizie
  a școlii, nu o valoare implicită.
- ~~Câte probe simultane suportă o grupă fără să deranjeze cursul?~~ Nu e o limită separată: proba
  ocupă un loc din cele 10 ale sălii, deci limita e capacitatea grupei. Vezi
  [Decizii luate](#decizii-luate).
- Care e beneficiul la recomandare, și cine îl suportă?
