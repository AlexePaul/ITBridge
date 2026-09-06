# E21 · Raportare și analytics

**Status:** în lucru — **S1, S2, S4 și S5 livrate** (S5 prin [E20](E20-achizitie-lead.md) S4), fiecare cu ce n-a intrat scris în dreptul lui; **S3 și S6 scoase din scop** · **Pistă:** Business · **Depinde de:** E12, E15, E16 · **Blochează:** —

## Problemă

Platforma colectează date, dar nu răspunde la nicio întrebare de business.

`apps/web/app/pages/admin/dashboard.vue` există, dar nu există niciun endpoint de agregare în backend — nicio
rută de statistici, niciun raport. Deci fiecare întrebare se rezolvă prin numărat manual în liste,
sau nu se rezolvă deloc.

Întrebări la care nu se poate răspunde astăzi:

- Câți copii activi sunt, pe locație și pe modul?
- Care e venitul lunar, și cum evoluează?
- Câți părinți au restanțe, și de cât timp?
- Ce grupe sunt sub capacitate, și cât ne costă asta?
- Câți copii nu s-au reînscris după ce au terminat un modul, și de ce?
- Care locație merge mai bine?
- Cât costă să aducem o familie nouă?
- Care e rata de prezență, și scade pe parcursul modulului?

Ultima e deosebit de utilă: prezența în scădere e cel mai bun predictor de abandon, cu câteva
săptămâni înainte să se întâmple. Datele există deja în `Attendance`; nimic nu le citește.

Cu două locații, întrebarea "cum merge?" nu mai are răspuns intuitiv.

## Rezultat

Un tablou de bord care răspunde la întrebările de conducere fără muncă manuală, și un set de
semnale care avertizează înainte ca o problemă să devină vizibilă în bani.

## În scop

- Tablou de bord operațional.
- Rapoarte financiare.
- Retenție și abandon.
- Ocupare și capacitate.
- Pâlnia de achiziție.
- Export pentru contabil.
- Semnale timpurii.

## În afara scopului

- Sănătatea tehnică a sistemului — vezi [E06](E06-observabilitate-operare.md). Aici e sănătatea
  școlii.
- Depozit de date sau unelte de business intelligence. La dimensiunea asta, rapoarte în aplicație,
  direct din Postgres.

## Story-uri

### S1 · Tablou de bord operațional

Prima pagină pentru admin: copii activi pe locație, grupe active, prezența săptămânii, facturi
neîncasate, probe programate, alerte. Filtrabil pe locație, comparabil cu perioada anterioară.

**Acceptanță:** răspunde la "cum stăm?" în zece secunde, fără alt clic.

**Livrat**, pe `/admin/dashboard` — care până acum era un placeholder ce scria, textual, că nu știe
ce va fi pe el.

**Regula care ține ecranul onest: fiecare număr e cerut de la cine deține deja întrebarea.**
Cataloagele nemarcate vin din `ClassSessionService.findUnmarkedSessions`, aceeași metodă pe care o
folosește mementoul zilnic; restanțele din `ArrearsService.list`, care le derivă din plățile
reușite; ocuparea din `EnrollmentService.occupancyOf`, care numără proba ca loc ocupat (D7). Nimic
nu se rederivă aici, și ăsta e motivul pentru care modulul există ca modul: un ecran care și-ar
calcula singur „nemarcat" ar fi a doua definiție, iar a doua definiție e mereu cea care divergează —
de obicei chiar cea de pe ecranul la care lumea se uită în treacăt, tocmai fiindcă la o privire nu
verifică nimeni.

Testele de integrare verifică **acordul**, nu aritmetica: citesc și tabloul, și ecranul pe care îl
rezumă, și le compară. Suma restanțelor se potrivește la leu cu lista de restanțe; numărul de conturi
în așteptare cu ecranul de aprobări; grupele aproape pline cu ce spune ocuparea.

**Ce arată, și de ce fiecare:** orele de azi cu marcat/nemarcat, fiindcă e gestul zilnic;
restanțele în lei și în **familii**, nu în facturi, fiindcă o familie cu două luni neplătite e un
telefon, nu două; cataloagele nefăcute din ultima săptămână, **fără ziua în curs** — ce nu e marcat
azi nu e restanță, e muncă în desfășurare; conturile în așteptare, fiindcă
[E11](E11-inscrieri-capacitate.md) S2 numește exact riscul ca un admin care nu deschide ecranul
vineri să transforme o înscriere în tăcere; proiectele netrimise; mesajele nelivrate din
[E17](E17-comunicare-notificari.md) S5, care merită o cifră tocmai fiindcă o familie neanunțată nu
știe că n-a fost anunțată și deci nu se plânge nimeni.

**Fiecare dală duce la ecranul care rezolvă**, fiindcă un tablou care doar raportează e un tablou pe
care lumea nu-l mai deschide.

**Ce nu s-a făcut din story:** filtrarea pe locație și comparația cu perioada anterioară. Prima e
utilă abia când numerele diferă mult între adrese, a doua cere serii istorice pe care nimic nu le
scrie încă — și ar fi fost, amândouă, sofisticare pusă înaintea primei utilizări.

### S2 · Rapoarte financiare

Venit facturat față de venit încasat, pe lună și pe modul, pe locație. Restanțe cu vechime. Venit
mediu pe familie. Evoluție în timp.

Distincția între facturat și încasat e esențială și lipsește complet astăzi: se poate factura foarte
bine și încasa prost.

**Acceptanță:** raportul se potrivește cu evidența contabilului, la leu.

**Livrat**, pe `/admin/rapoarte`, fila „Bani", din `GET /reports/finance?from=YYYY-MM&to=YYYY-MM` —
implicit ultimele douăsprezece luni, cu luna în curs.

**Două calendare, amândouă afișate, niciunul ascuns în celălalt.** „Încasat pentru lună" e suma
plăților reușite pe facturile lunii, oricând au venit — diferența față de facturat e ce mai
datorează luna. „Încasat în lună" e suma plăților reușite datate în lună, pentru orice factură —
cifra pe care o are banca și contabilul. Cele două diferă exact când o familie plătește târziu, adică
exact când un raport despre bani merită citit; un raport care ar alege una și ar numi-o „încasat" ar
fi corect în lunile liniștite și greșit în celelalte. Numerarul și transferul se împart pe al doilea
calendar, fiindcă acela e al extrasului.

**Doar plățile `succeeded` sunt bani.** O plată anunțată, una eșuată și una stornată rămân rânduri,
fiindcă încercarea face parte din poveste, și apar în `basis` fiindcă cine citește merită să știe că
există — dar niciuna nu scade nimic, nici aici, nici în `PaymentService.recomputeInvoiceStatus`, care
e definiția la care raportul se supune. Lunile `waived` se numără, nu se adună: n-au bani în ele, iar
o familie cu luna anulată la zero nu diluează media pe familie.

**Restanțele nu se rederivă.** Vechimea vine de la `ArrearsService.list`, aceeași metodă din spatele
ecranului `/admin/restante`, împărțită pe cele patru benzi — regula din S1, „fiecare număr e cerut de
la cine deține deja întrebarea", ținută și aici. Testele de integrare verifică acordul, la leu, cu
lista de plăți, cu lista de restanțe și cu lista de facturi.

**Ce n-a intrat, și de ce.** *Pe modul*: modulele sunt E10, scos din MVP, iar factura n-are linii. *Pe
locație*: o factură e a familiei, iar o familie poate avea copii la ambele adrese — același motiv
pentru care restanțele nu se grupează pe locație. Niciuna dintre axe nu se poate deriva din rândurile
care există, iar una inventată ar fi exact raportul de care avertizează Riscurile: construit pe date
care nu sunt acolo. *Potrivirea cu contabilul*, adică acceptanța, nu se poate bifa înainte de E01 S4:
nu există date reale de potrivit. Raportul spune pe ce s-a calculat — câte facturi, câte plăți, câte
neincluse — tocmai ca prima potrivire să aibă de unde porni.

### S3 · Retenție și abandon

Câți copii continuă la modulul următor, pe grupă, pe profesor, pe locație, pe modul. Motivele de
abandon, din [E11](E11-inscrieri-capacitate.md). Durata medie a relației cu o familie.

E cea mai importantă familie de indicatori din tot epicul. Într-o școală cu module, retenția
determină totul: e mult mai ieftin să păstrezi o familie decât să aduci una nouă.

**Acceptanță:** rata de reînscriere e vizibilă pe modul și pe profesor, cu evoluție în timp.

**Scos din MVP prin decizie (septembrie 2026)**, și nu din dezacord cu paragraful de mai sus, care
rămâne în picioare. Acceptanța cere **modulul** ([E10](E10-curriculum-module.md)) și
**profesorul pe grupă** ([E09](E09-personal-roluri.md)), amândouă în afara MVP-ului, deci cele două
axe pe care se citește rata nu există. Ce s-ar putea construi acum — „câți copii erau înscriși în
septembrie și mai sunt în decembrie" — se numără din ecranul de grupe, iar un raport care spune
același lucru cu un aer mai sigur nu adaugă nimic. Se reia odată cu E10.

**Retenția de aici sunt copiii care nu se mai întorc**, nu retenția datelor din
[E04](E04-migrari-date.md) S5 și [E22](E22-termeni-si-date.md) S3. Același cuvânt, două lucruri fără
nicio legătură între ele — și singura confuzie care poate face pe cineva să creadă că story-ul ăsta e
o obligație legală amânată.

### S4 · Ocupare

Locuri ocupate față de capacitate, pe grupă, sală și locație. Grupele sub prag, cu venitul pierdut
estimat. Orele moarte în care sălile stau goale.

**Acceptanță:** răspunde la "putem deschide o grupă nouă, sau întâi le umplem pe cele existente?".

**Livrat**, pe `/admin/rapoarte`, fila „Locuri", din `GET /reports/occupancy`: fiecare grupă activă,
cea mai goală prima, cu locuri ocupate din capacitate, coada de așteptare, gradul de umplere și venitul
pierdut estimat; sălile, fiecare cu orele ei moarte; și totalul pe adresă.

**„Ocupat" e cerut de la `EnrollmentService.occupancyOf`**, o dată pentru fiecare grupă, exact ca pe
tabloul de bord. Acolo e definit ce înseamnă un loc luat — un copil la probă stă pe un scaun (D7) —
iar o numărare scrisă aici ar fi a doua definiție, liberă să uite probele și să-i spună patronului că
o sală plină mai are loc. Câteva interogări mici pe fiecare grupă, la o încărcare de pagină, e prețul unui singur răspuns.

**Orele moarte se măsoară pe orarul școlii, nu pe ceas.** Nu există o grilă fixă de ore, deci singura
definiție onestă a unei ore în care o sală *putea* ține curs e o oră în care altă sală a ținut. O sală
goală marți la 16:00 cât timp cealaltă adresă predă la ora aia e o oră moartă; o duminică dimineață în
care nu predă nimeni nu e. Regula e `deadSlotsOf` din `apps/api/src/modules/dashboard/reports.rules.ts`.

**Două numere sunt propuneri, și raportul le arată ca atare.** Pragul sub care o grupă e „sub prag"
e 60% (`OCCUPANCY_THRESHOLD`) — story-ul cere „pragul de rentabilitate", dar nimeni n-a spus care e —
iar venitul pierdut e locurile libere înmulțite cu prețul de listă al primului copil pe o lună de
patru ședințe, 350 de lei (`LOST_REVENUE_PER_SEAT_MONTHLY`, din `pricing.ts`, nu o copie). E o
estimare de sus: frații și reducerile o fac mai mică, iar un loc gol fiindcă banda de vârstă nu se
potrivește n-a fost niciodată venit. Ambele apar pe ecran, lângă cifrele pe care le produc, ca să nu
fie luate drept prognoză. Grupele și sălile inactive nu apar: nu pot primi un copil nou, deci nu sunt
un răspuns la „unde îl punem".

### S5 · Pâlnia

Indicatorii din [E20](E20-achizitie-lead.md), cu conversii între etape, pe sursă și pe locație, și
cost de achiziție dacă există cheltuială de marketing.

**Acceptanță:** se vede care canal aduce familii care rămân, nu doar familii.

**Livrat, dar în celălalt epic:** fila „Pâlnia" din `/admin/rapoarte` a venit cu
[E20](E20-achizitie-lead.md) S4, servită de `GET /reports/funnel` și numărată în
`lead-funnel.service.ts` — modulul care deține lead-urile, exact regula epicului ăstuia. Story-ul
rămâne aici ca să nu pară că întrebarea n-a primit răspuns; ce se citește pe ecran e scris acolo.

Două jumătăți de acceptanță rămân deschise, amândouă din lipsă de intrare, nu de cod: **costul de
achiziție** cere o cheltuială de marketing înregistrată undeva, iar nicăieri în platformă nu se
scrie una; iar **„familii care rămân"** cere retenția din S3, care e scoasă din scop. Ce se vede azi
e care canal aduce familii, nu care canal aduce familii care rămân.

### S6 · Export pentru contabil

Un export lunar în formatul cerut, cu facturi, plăți și storno, care nu cere reformatare manuală.

**Acceptanță:** contabilul confirmă că îl poate folosi direct.

**Scos din scop prin decizie (septembrie 2026): contabilul își ia datele din SmartBill.** Odată ce
facturile pleacă prin [E16](E16-plati-fiscal.md) S2, SmartBill e locul unde ele există oficial, cu
seria, cu storno-urile și în formatul pe care contabilul îl folosește deja. Un export din baza
noastră ar fi a doua versiune a acelorași cifre, întreținută de noi — exact ce refuză epicul ăsta la
fiecare raport: cine deține întrebarea dă răspunsul.

Condiția e explicită, ca să nu se piardă: **decizia stă pe premisa că facturile chiar ajung în
SmartBill.** Dacă E16 S0 iese prost și emiterea rămâne la noi, întrebarea se întoarce aici, iar
întrebarea deschisă de mai jos — în ce format îl vrea contabilul — redevine blocantă.

### S7 · Semnale timpurii

Alerte pe tipare care prevestesc probleme: prezența unui copil în scădere trei ședințe la rând, o
grupă cu prezență generală în scădere, o familie cu două facturi restante, o grupă care coboară sub
pragul de rentabilitate.

Intervenția devine posibilă cât mai e ceva de făcut.

**Acceptanță:** o scădere de prezență generează alertă înainte de abandon, verificat retroactiv pe
datele istorice.

## Dependențe

[E12](E12-prezenta-orar.md) pentru prezență, [E15](E15-pricing-facturare.md) și
[E16](E16-plati-fiscal.md) pentru bani.

## Riscuri

**Rapoartele construite pe date incomplete induc în eroare mai rău decât lipsa lor.** Dacă prezența
nu se marchează consecvent, rata de prezență e ficțiune. Fiecare raport trebuie să arate pe ce date
se bazează și cât de complete sunt.

**Interogările de agregare pe tabele care cresc vor încetini.** La dimensiunea actuală nu e o
problemă, dar rapoartele trebuie scrise cu indici de la început, nu optimizate după ce încep să
doară.

**Prea mulți indicatori și niciunul nu e urmărit.** Mai bine cinci cifre citite săptămânal decât
cincizeci ignorate.

## Definition of done

Întrebările din secțiunea Problemă au toate răspuns, din interfață, fără muncă manuală. Rapoartele
financiare se potrivesc cu contabilitatea. Semnalele timpurii au prins măcar un caz real.

## Întrebări deschise

- Care sunt cele cinci cifre pe care le-ai vrea în fiecare luni dimineață? Restul e secundar. S1, S2
  și S4 au fost construite pe cifrele pe care le numește textul epicului; răspunsul poate schimba ce
  stă în față, nu ce există.
- ~~În ce format vrea contabilul exportul?~~ **Fără obiect** cât timp facturile pleacă prin
  SmartBill: exportul (S6) e scos din scop, iar formatul e al lor. Se repune dacă emiterea rămâne la
  noi — vezi S6.
- ~~Se compară locațiile între ele în mod deschis?~~ **Fără obiect azi**: singurele roluri sunt
  `ADMIN` și `PARENT` (E09 e scos din MVP), deci orice cifră pe locație o văd doar proprietarii, nu o
  echipă. Raportul de ocupare le pune una lângă alta. Se repune în discuție la primul profesor care nu
  e proprietar, odată cu E09.
- Care e pragul de rentabilitate al unei grupe, în locuri sau în procente? S4 folosește 60% și spune
  pe ecran că e o propunere.
