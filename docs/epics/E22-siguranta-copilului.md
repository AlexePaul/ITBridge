# E22 · Siguranța copilului

**Status:** propus · **Pistă:** Domeniu · **Depinde de:** E04 · **Blochează:** —

## Problemă

Cele 21 de epic-uri de dinainte modelează banii, prezența, proiectele și marketingul. Niciunul nu
modelează grija față de copil ca **persoană fizică aflată în incinta școlii**.

O căutare după `alergi`, `medical`, `urgen`, `custod` și `preluare` în tot `docs/epics/` returnează
patru rezultate, toate în [E17](E17-comunicare-notificari.md) și toate despre canalul de mesaje
urgente — nimic despre copil. Zero rezultate pentru celelalte patru cuvinte.

Codul spune același lucru. `apps/api/src/entities/child.entity.ts` are exact `firstName`,
`lastName`, `birthDate` și `createdAt`, plus legătura către `Profile` și cea către `Group`.
`CreateChildDto` (`apps/api/src/modules/child/dto/createChild.dto.ts`) cere exact trei câmpuri și
`parentId`. Deci platforma știe **cine e copilul și unde e programat**, și nimic despre ce trebuie
făcut dacă i se face rău.

Partea importantă: **informația asta există deja.** Un părinte care are un copil cu alergie la nuci
i-a spus profesorului. Cine are voie să ia copilul de la ora 19:00 s-a stabilit la ușă. Un
diagnostic care schimbă felul în care se ține ora e cunoscut. Doar că trăiește într-un thread de
WhatsApp — care e simultan:

- **cel mai prost loc posibil pentru date de sănătate sub GDPR**: categorie specială la art. 9, fără
  temei înregistrat, fără control de acces, fără termen de păstrare, pe telefonul personal al
  cuiva, la un procesator cu care școala nu are niciun contract (vezi [E07](E07-securitate-gdpr.md)
  S7);
- **indisponibil exact atunci când contează**: profesorul care suplinește nu e în conversația aia,
  iar la ora 18:00 într-o sală cu opt copii nimeni nu derulează șase luni de mesaje.

E22 nu inventează un proces. **Mută un proces care există deja într-un loc unde poate fi guvernat**
— cu temei, cu acces restrâns, cu urmă în audit log — și îl pune pe ecranul pe care profesorul îl
are oricum deschis.

Costul întârzierii nu se măsoară în software. Restul epic-urilor, dacă alunecă, produc facturi
târzii sau rapoarte lipsă. Ăsta produce un profesor care nu știe ce să facă.

## Rezultat

Profesorul care intră în sală vede, fără să caute, ce trebuie să știe despre copiii din fața lui:
alergii și afecțiuni, pe cine sună, cine are voie să ia copilul. Datele au temei legal explicit,
sunt vizibile doar cui îi trebuie, iar o modificare lasă urmă. Ce s-a întâmplat neobișnuit la o
ședință se scrie într-un loc care nu e o conversație privată.

## În scop

- Câmpuri de siguranță pe `Child`, cu formularul care le colectează.
- Fișa de siguranță a grupei, ca secțiune în ecranul de prezență.
- Temei legal, consimțământ explicit și restrângerea accesului pentru datele de sănătate.
- Nota de incident, ca text liber legat de copil și ședință.

## În afara scopului

- **Registru de incidente cu tipuri, scară de gravitate și flux de rezoluție.** Un formular cu
  taxonomie și cinci trepte de gravitate presupune un volum care nu există: la două cadre didactice
  și câteva zeci de familii, notele de incident se numără în unități pe an. Costul real al unui
  astfel de registru nu e construcția, ci că nimeni nu-l completează corect, deci câmpurile devin
  zgomot, iar textul liber — singurul lucru citit — ajunge oricum în „observații". Se scrie direct
  textul liber. Imutabilitatea, care e adevărata cerință, vine din audit log-ul
  [E07](E07-securitate-gdpr.md) S3, nu dintr-un model propriu.

- **Custodia modelată ca funcționalitate**, cu hotărâre judecătorească, părinte restricționat și
  reguli de decizie. E cel mult un caz pe an, iar un model greșit e mai periculos decât lipsa lui:
  o platformă care afișează „preluare permisă" pe baza unui câmp completat acum doi ani înlocuiește
  judecata omului de la ușă cu o bifă învechită. Rămâne un câmp liber de restricții la preluare,
  care spune „sună întâi", plus telefonul.

- **Detecție automată de orice**: recunoaștere facială la preluare, corelarea absențelor cu semne
  de risc, alertare pe cuvinte-cheie din notele de incident. Nimic din astea nu are date pe care să
  se antreneze la dimensiunea școlii, iar un fals pozitiv într-un domeniu ca ăsta costă o acuzație
  nefondată la adresa unei familii. Deciziile le ia omul; platforma îi pune informația în față.

- **Protocolul „copil așteptat care nu a ajuns"**. Aparține [E12](E12-prezenta-orar.md) S7, unde
  există deja mementoul către profesor pentru prezența nemarcată și notificarea către părinte la
  absență neanunțată. Ce se schimbă acolo e pragul, nu mecanismul — la un copil de 8 ani, o absență
  neanunțată e un telefon în primele minute, nu o notificare de seară.

- Textul juridic al acordurilor. Îl scrie un avocat, ca restul documentelor din
  [E07](E07-securitate-gdpr.md) S5.

## Story-uri

### S1 · Câmpuri de siguranță pe `Child`

O migrare și o secțiune nouă în formularul de copil
(`apps/web/app/pages/admin/profiles/[profileId]/children/new.vue` și
`apps/web/app/pages/admin/children/[childId]/edit.vue`):

- **contact de urgență** — nume, telefon, relația cu copilul; minimum unul, **distinct de titularul
  contului**, fiindcă scenariul întreg e „părintele nu răspunde";
- **alergii, afecțiuni, medicație** — text liber, cu întrebarea pusă explicit, nu ca observație
  generală;
- **observații pentru profesor** — aici intră ADHD, spectrul autist, anxietatea: lucruri care
  schimbă felul în care se ține ora, nu diagnostice de gestionat;
- **persoane autorizate la preluare** — nume și telefon, ca listă;
- **restricții la preluare** — câmp liber (vezi „În afara scopului");
- **poate pleca singur** — boolean, cu implicit `false`.

Toate opționale în afară de contactul de urgență, care devine obligatoriu la înscrierea activă din
[E11](E11-inscrieri-capacitate.md) S1 — nu la crearea profilului, fiindcă profilul fără date de
contact e un flux intenționat (un admin creează un `Profile` fără cont) și nu se strică aici.

Câmpurile de text opționale primesc `@EmptyToUndefined()` din
`apps/api/src/common/empty-to-undefined.ts` înaintea validatorilor. Fără el, un formular netastat
trimite `''`, iar `@IsOptional() @Length(1, …)` respinge exact payload-ul pe care formularul îl
produce mereu — capcana care a făcut ecranul de completare a profilului imposibil de trecut.

**Acceptanță:** un copil nu poate ajunge în starea de înscriere activă fără cel puțin un contact de
urgență cu telefon, iar cel salvat nu e numărul titularului de cont. Restul câmpurilor se salvează
goale fără eroare.

### S2 · Fișa de siguranță a grupei

**Nu un ecran nou.** O secțiune în ecranul de marcare a prezenței din [E12](E12-prezenta-orar.md)
S6 — azi `apps/web/app/pages/admin/attendance/group/[groupId].vue`, care afișează deja grupa, ziua,
intervalul, locația și sala.

Pentru grupa deschisă: lista copiilor cu un semn vizibil pe cei care au alergii, afecțiuni sau
observații, deschis cu o apăsare; telefonul părintelui și cel de urgență, apelabile direct; cine
are voie să ia copilul; cine poate pleca singur.

E cel mai mare câștig operațional din tot epicul, la cel mai mic cost, tocmai pentru că ecranul se
construiește oricum în E12 S6 și e deja singurul lucru pe care profesorul îl are deschis în timpul
orei. Un ecran separat, oricât de bun, nu s-ar deschide niciodată la momentul potrivit.

Aceeași cerință ca ecranul-gazdă: funcționează pe conexiune slabă. Fișa e cu atât mai mult un caz
de citire offline — momentul în care e nevoie de ea e exact momentul în care nimeni nu are răbdare
să aștepte rețeaua.

**Acceptanță:** un profesor care intră la ora lui vede în sub cinci secunde, fără să caute, care
copii din sală au ceva de știut și pe cine sună. Un suplinitor care nu a mai văzut grupa vede
exact același lucru.

### S3 · Temei și acces pentru datele de sănătate

Alergiile, afecțiunile și medicația sunt **categorie specială** sub GDPR (art. 9). Nu se pot
prelucra pe interesul legitim și nici pe executarea contractului; temeiul practicabil aici e
**consimțământul explicit, art. 9(2)(a)**, dat de părinte.

Trei lucruri:

1. **Bifă separată la înscriere**, cu text propriu — nu ascunsă în acceptarea generală a termenilor.
   Reutilizează entitatea de consimțământ din [E07](E07-securitate-gdpr.md) S2, cu propriul scop, nu
   una paralelă. Refuzul e o stare validă: copilul se înscrie, iar câmpurile rămân goale, cu
   consecința spusă părintelui pe loc.
2. **Un rând în inventarul din [E07](E07-securitate-gdpr.md) S1** pentru fiecare câmp: unde e
   stocat, temeiul, cine îl vede, cât se păstrează. Termenul de păstrare se aliniază cu politica de
   retenție din [E04](E04-migrari-date.md) S5 — datele de sănătate ale unui copil care a plecat de
   trei ani nu au niciun motiv să existe.
3. **Vizibilitate restrânsă la profesorul grupei și la admin.** Deci S3 cere rolul `TEACHER` din
   [E09](E09-personal-roluri.md) S2, care e singurul loc unde „grupele lui" devine o noțiune pe care
   backend-ul o poate impune. Restrângerea se face în service, după tiparul din
   `apps/api/src/modules/invoice/invoice.service.ts:92` — și **numai cu `andWhere`**: un `where`
   pus după restrângere o șterge fără niciun semn, exact cum a scăpat `PaymentService.findOne`.

Fiecare citire și fiecare modificare intră în audit log-ul [E07](E07-securitate-gdpr.md) S3. La
restul platformei se înregistrează modificarea; aici merită și citirea, fiindcă întrebarea care se
pune după un incident nu e „cine a schimbat", ci „cine a văzut".

Câmpurile astea nu circulă niciodată prin query string. `apps/api/src/common/redact-url.ts`
redactează cheile sensibile din URL, iar `request-logger.middleware.ts` nu scrie deloc corpul
cererii — protecția există, dar e legată de body, nu de URL.

**Acceptanță:** un părinte primește 403 pe datele de siguranță ale altui copil; un profesor,
pe copiii din afara grupelor lui. Pentru orice câmp de sănătate din bază se poate arăta ce
consimțământ îl acoperă și cine l-a citit ultima dată.

### S4 · Notă de incident

Text liber legat de un copil și de o ședință, plus **cine a fost anunțat și când**. Atât. Fără
tipuri, fără scară de gravitate, fără flux de rezoluție, fără responsabil și termen.

Ce trebuie să acopere, concret: „s-a lovit la genunchi, am pus gheață, am sunat mama la 18:10,
a răspuns"; „a plecat cu bunicul, care e pe lista de preluare"; „refuza să intre în sală, am stat cu
el pe hol 20 de minute". Trei situații care azi se spun verbal și dispar.

Vizibilitatea e cea din S3. Nota se scrie de profesor sau de admin, se poate corecta, iar
istoricul modificărilor stă în audit log — deci nu e nevoie de imutabilitate în model.

Ce e **explicit exclus**: notificarea automată a părintelui la scrierea unei note. Cine anunță
părintele e omul care a fost acolo, prin telefon, în minutele următoare; câmpul „cine a fost anunțat
și când" înregistrează faptul, nu îl produce.

**Acceptanță:** o notă scrisă la finalul orei se regăsește pe fișa copilului șase luni mai târziu,
cu autorul, momentul și cine a fost anunțat.

## Dependențe

[E04](E04-migrari-date.md) pentru migrări — S1 e o schimbare de schemă, iar `synchronize` e `false`.
E singura dependență care blochează începutul epicului; restul se leagă de story-uri, nu de el
întreg.

[E07](E07-securitate-gdpr.md) pentru S3 și S4, și asta e o dependență de model, nu doar de ordine.
Consimțământul de la S3 e un scop nou pe entitatea `(Profile, Child, scop)` din
[E07](E07-securitate-gdpr.md) S2, nu un al doilea mecanism — vezi „Decizii luate"; fiecare câmp de
sănătate cere un rând în inventarul din [E07](E07-securitate-gdpr.md) S1; iar urma pe care se
sprijină și S3 („cine a văzut"), și S4, care renunță tocmai de aceea la imutabilitate în model, e
audit log-ul din [E07](E07-securitate-gdpr.md) S3. Fără ele, S3 și S4 se pot construi, dar nu se pot
încheia: „temei legal înregistrat, vizibilă doar cui îi trebuie, cu urmă la fiecare atingere" din
Definition of done nu are ce să bifeze, iar un consimțământ construit local aici ar fi exact al
doilea loc de revocat și de exportat pe care epicul îl refuză explicit.

S2 nu are sens înainte de [E12](E12-prezenta-orar.md) S6, fiindcă e o secțiune în ecranul construit
acolo. S3 nu poate restrânge accesul înainte de rolul `TEACHER` din [E09](E09-personal-roluri.md)
S2 — până atunci „profesorul grupei" nu există ca subiect pe care backend-ul să-l poată verifica.
Nici una din cele două nu e o dependență de model, ci de ordine.

Ordonarea recomandată: **S1 în val 2** — câteva coloane și o secțiune de formular, nimic nu o
blochează; **S2 și S3 în val 3**, odată cu [E09](E09-personal-roluri.md) și
[E12](E12-prezenta-orar.md). S3 presupune atunci și [E07](E07-securitate-gdpr.md) livrat, care se
poate strecura oriunde după val 1. S4 urmează S3, fiindcă împarte aceeași regulă de vizibilitate.

**E22 nu blochează [E20](E20-achizitie-lead.md).** Contactul de urgență cerut la programarea pentru
lecția de probă e un câmp în formularul de acolo, nu o dependență de modelul de aici: proba se ține
înainte să existe un `Child` în bază.

## Riscuri

**Datele de sănătate sunt categorie specială — greșeala de acces costă altfel decât la restul
platformei.** O factură văzută de cine nu trebuie e o problemă de confidențialitate; diagnosticul
unui copil văzut de un părinte din altă familie e o încălcare care se raportează la ANSPDCP în 72
de ore și, mai important, e un lucru pe care familia nu-l uită. Concret, asta înseamnă că tiparul de
autorizare din CLAUDE.md nu e o recomandare aici: restrângerea se face în service, se testează în
`apps/api/test/*.e2e-spec.ts` cu doi profesori reali și două grupe, nu doar prin forma interogării
în testele unitare, iar `apps/api/src/authorization.spec.ts` trebuie să vadă endpoint-urile noi cu
guard-ele puse.

**Câmpul completat o dată și nemaiactualizat e mai periculos decât câmpul gol.** Un profesor care
citește „fără alergii" scris acum trei ani se comportă altfel decât unul care nu găsește nimic
scris. Alergiile apar, medicația se schimbă, persoanele autorizate la preluare se schimbă și mai
des. Fișa trebuie să arate **când a fost confirmată ultima dată**, iar reconfirmarea la fiecare
înscriere nouă de modul e cel mai ieftin moment de a o cere — familia e deja în formular.

**Datele de sănătate intră în export și în ștergere.** [E07](E07-securitate-gdpr.md) S4 promite
exportul complet și ștergerea la cerere. Un câmp adăugat aici și uitat acolo transformă o promisiune
îndeplinită într-una parțială, care e mai rău decât una neîncepută. Aceeași grijă pentru backup-uri
din [E04](E04-migrari-date.md) S4: un export de bază de date descărcat pe laptopul cuiva conține
acum date de art. 9.

**Riscul opus e la fel de real: prea multă ceremonie și fișa rămâne goală.** Dacă adăugarea unei
alergii cere trei ecrane și un consimțământ resemnat, informația rămâne pe WhatsApp și epicul nu a
schimbat nimic — a adăugat doar niște coloane. Măsura de succes nu e că schema există, ci că fișele
sunt completate.

## Definition of done

Un profesor care intră într-o sală în care nu a mai predat vede, de pe telefon și fără să caute, ce
trebuie să știe despre fiecare copil din fața lui și pe cine sună dacă e nevoie. Informația care azi
e într-un thread de WhatsApp e în platformă, cu temei legal înregistrat, vizibilă doar cui îi
trebuie, cu urmă la fiecare atingere. Un incident lasă o notă care se regăsește peste un an.

Verificarea negativă contează la fel de mult: niciun părinte și niciun profesor nu poate citi datele
de sănătate ale unui copil care nu e al lui, respectiv nu e în grupele lui, iar asta e demonstrat
printr-un test de integrare, nu prin inspecția codului.

## Decizii luate

**Câmpuri pe `Child`, nu entități noi.** Contactele de urgență și persoanele autorizate la preluare
ar putea fi o entitate `ChildContact` cu roluri și flag-uri. La una-două persoane per copil, un
tabel separat adaugă un join, un CRUD, un ecran și o cascadă de ștergere pentru zero capacitate
suplimentară. Dacă apare vreodată nevoia de a lega aceeași persoană de mai mulți copii, e o
extragere ulterioară, pe date puține.

**Fișa e o secțiune în ecranul de prezență, nu un ecran propriu.** Argumentul nu e economia de
muncă, ci momentul: informația trebuie să fie acolo unde profesorul se uită oricum. Un ecran
separat s-ar deschide în ziua în care se face configurarea și niciodată în timpul orei.

**Nota de incident e text liber; imutabilitatea vine din [E07](E07-securitate-gdpr.md) S3.** Nu se
construiește un registru cu stări și versiuni pentru câteva note pe an, când audit log-ul care se
construiește oricum răspunde la aceeași întrebare — cine a scris ce și când.

**Consimțământul reutilizează entitatea din [E07](E07-securitate-gdpr.md) S2**, cu un scop propriu.
Un al doilea mecanism de consimțământ ar însemna două locuri de revocat și două de exportat, iar
primul uitat ar fi cel de aici.

**„Poate pleca singur" are implicit `false`.** Un default care lasă un copil să plece nesupravegheat
pentru că nimeni nu a completat câmpul e singurul default inacceptabil din tot epicul.

## Întrebări deschise

- **Cine e persoana de contact în caz de urgență dacă părintele nu răspunde?** Azi nu există niciun
  răspuns scris — profesorul sună părintele, și dacă acesta nu răspunde, sună din nou.
  **Recomandare:** minimum două numere per copil, al doilea obligatoriu diferit de titularul
  contului, plus regula scrisă „la 112 se sună fără să se aștepte confirmarea părintelui". *De
  confirmat.* Motivul pentru care nu e o decizie tehnică: e un angajament pe care școala îl ia față
  de familii și trebuie să apară în contractul de înscriere, nu doar în software.

- **Unde se ține fișa azi și cine o actualizează?** E întrebarea care decide dacă S1 e o migrare
  simplă sau o culegere de date de la zero, și niciun răspuns din cod nu o poate da.
  **Recomandare:** o oră de inventariere înainte de S1 — ce știe fiecare profesor, unde e scris,
  câte familii au comunicat deja ceva. *De confirmat.* Dacă răspunsul e „la doi oameni în cap",
  S1 trebuie să fie însoțit de o campanie de completare, altfel livrează o schemă goală.

- **Datele de siguranță se cer la înscriere sau la programarea probei?** La probă, copilul e deja
  în sală cu un adult străin. **Recomandare:** contactul de urgență se cere la programarea probei
  ([E20](E20-achizitie-lead.md) S2), restul câmpurilor la înscrierea activă. *De confirmat.*
  Motivul: fiecare câmp în plus la programarea probei scade conversia, iar E20 vinde explicit un
  flux „sub două minute".

- **Cât se păstrează datele de sănătate după plecarea copilului?** Nu e o alegere liberă — se leagă
  de retenția din [E04](E04-migrari-date.md) S5, care e ea însăși blocată pe o discuție cu
  contabilul. **Recomandare:** ștergere la 12 luni după încheierea ultimei înscrieri, separat și
  mai devreme decât facturile, care au termen legal propriu. *De confirmat.*

- **Acordul art. 9(2)(a) se ia ca bifă în platformă sau rămâne hârtie semnată?** Aceeași întrebare
  se pune în [E07](E07-securitate-gdpr.md) pentru acordul de imagine, și merită un singur răspuns
  pentru amândouă. **Recomandare:** bifă în platformă, cu versiunea textului înregistrată, ca la
  restul consimțămintelor. *De confirmat.* Un consimțământ pe hârtie nu poate fi revocat cu efect
  automat, ceea ce e exact ce cere [E07](E07-securitate-gdpr.md) S2.
