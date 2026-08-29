# E20 · Achiziție, lecții de probă și lead management

**Status:** propus · **Pistă:** Public · **Depinde de:** E17, E18 · **Blochează:** —

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

### S5 · Recomandări

Un părinte existent recomandă altul, cu legătură urmăribilă și beneficiu pentru amândoi — o reducere
la modulul următor, de pildă, aplicată prin [E15](E15-pricing-facturare.md).

Într-o școală pentru copii, e cel mai ieftin și mai eficient canal, pentru că părinții vorbesc
oricum între ei. Merită doar să fie sprijinit și măsurat.

Legătura duce la programarea la probă din S2, nu la o înscriere — capătul public al pâlniei e același
pentru toată lumea. Ce face recomandarea e să atașeze sursa lead-ului, ca beneficiul să poată fi
aplicat mai târziu fără ca cineva să-și amintească cine pe cine a trimis.

**Acceptanță:** un părinte generează o legătură de recomandare din portal, iar beneficiul se aplică
fără intervenție manuală în clipa în care adminul înscrie copilul recomandat.

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

- Cine răspunde lead-urilor, și în cât timp?
- ~~Câte probe simultane suportă o grupă fără să deranjeze cursul?~~ Nu e o limită separată: proba
  ocupă un loc din cele 10 ale sălii, deci limita e capacitatea grupei. Vezi
  [Decizii luate](#decizii-luate).
- Care e beneficiul la recomandare, și cine îl suportă?
