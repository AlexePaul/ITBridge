# Plan de testare — platforma întreagă, pe stage

Pentru testarea de la cap la coadă, înaintea lansării: fiecare rol, fiecare drum pe care îl folosește
cineva într-o săptămână obișnuită, cu ce trebuie să se întâmple. Un punct e **trecut** când
rezultatul e exact cel descris; orice altceva e un bug, chiar și o propoziție în engleză.

Totul se face pe **`stage.itbridgeschool.com`**. Ordinea contează doar în interiorul unei secțiuni;
secțiunile se pot lua în orice ordine, cu excepția lui 2.1–2.3, care fac un cont nou de la zero.

## 0. Pregătire

**Conturi.** Stage rulează pe datele de seed. Parola tuturor conturilor de mai jos e cea din
`SEED_PASSWORD` de la ultima repopulare a stage-ului (pe laptop e `parola123`). **Începe cu date
proaspete**: repopularea de pe instanță, cu „azi" pus pe ziua testării, e în
[runbook.md](runbook.md), 3.14 — altfel testele de mai jos pornesc de la ce au lăsat în urmă
testările de dinainte.

| Cont                                                            | Ce e                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `admin`                                                         | biroul — și profesorul, fiindcă în MVP toți sunt admini |
| `ana.popescu`                                                   | părinte activ, cu copil înscris și facturi              |
| `bogdan.ionescu`                                                | părinte activ                                           |
| `david.georgescu`, `elena.stan`, `gabriela.radu`, `horia.barbu` | părinți activi                                          |
| `lucian.ionescu`                                                | cont confirmat, **așteaptă aprobarea** biroului         |
| `diana.moldovan`                                                | cont **neconfirmat** (n-a deschis linkul din email)     |

Familiile **fără cont**, trecute de birou: Cristina Dumitrescu, Florin Marin, Ioana Popescu.

**Emailurile nu pleacă de pe stage, dinadins** (`MAIL_OUTBOX_ENABLED=false`). Fiecare mesaj se scrie
totuși, cu tot cu linkurile din el: **Livrări** (`/admin/livrari`) → mesajul → „Vezi mesajul". Așa se
iau linkurile de confirmare, de resetare a parolei și de cont în testele de mai jos. Din același
motiv, pe tabloul de bord „Mesaje nelivrate" crește — pe stage e normal.

**SmartBill** e oprit sau în ciorne pe stage: facturile au PDF-ul platformei, nu număr fiscal.

**Un telefon** pentru secțiunile 2 și 4, sau browserul pe 390 px lățime.

**Când ceva nu merge:** notează ID-ul punctului (de exemplu **B9.2**), pașii, ce ai văzut și **codul
de pe ecran**, dacă apare unul („cod 3f2a9c1d"). Codul găsește eroarea pe `/admin/erori`, cu tot ce
trebuie pentru reparat — vezi [runbook.md](runbook.md), „Un bug". O captură de ecran ajută mereu.

## 1. Vizitatorul, fără cont

- [ ] **V1 · Site-ul public** — Acasă, Cursuri (cele șase pagini), Locații, Despre noi, Contact, pe
      desktop și pe telefon. → Fiecare pagină se încarcă, meniul merge pe telefon, niciun link nu duce
      la o pagină de eroare, prețurile și adresele sunt aceleași peste tot.
- [ ] **V2 · Fără cookie-uri** — prima vizită, în fereastră privată: DevTools → Application →
      Cookies. → Niciun cookie. Harta Google apare doar după „Încarcă harta" (pe paginile locațiilor).
- [ ] **V3 · Programare la probă** — `/proba`: vârsta copilului, o oră din listă, datele, trimite. →
      „Ne vedem atunci", cu ora și adresa. În admin, cererea apare la **Cereri și probe**, cu ora; iar
      confirmarea stă în Livrări.
- [ ] **V4 · Probă fără loc** — `/proba` cu o vârstă pentru care nu e nicio oră. → „Te contactăm
      noi", fără eroare; în admin, cererea e marcată „fără loc".
- [ ] **V5 · Greșeli de tastare pe `/proba`** — un email fără `@`, un telefon cu 5 cifre. → Mesaj în
      română sub câmp; nimic nu pleacă.
- [ ] **V6 · Contact** — trimite formularul. → Confirmare, sau, dacă formularul nu e configurat pe
      stage, o propoziție în română cu numărul de telefon — niciodată engleză.
- [ ] **V7 · Documentele** — `/termeni`, `/confidentialitate`, `/cookies`, `/acord-lucrari`. → Se
      citesc, titlurile au ancore, linkurile dintre ele merg.

## 2. Părintele

### Contul nou, de la zero

- [ ] **P1 · Înregistrare** — Autentificare → „Creează cont": utilizator, parolă (minim 6), prenume,
      nume, email, cele **două** bife. → „Contul a fost creat", apoi direct pasul doi (P2); după el,
      pe Acasă, cardul „De confirmat" cu butonul de retrimitere a linkului. Fără a doua bifă (clauzele
      neuzuale), formularul refuză și nu trimite nimic. Cu adresa unei familii trecute de birou, în
      loc de cont apare „Verifică-ți emailul" — e P21, din partea familiei.
- [ ] **P2 · Pasul doi** — imediat după: telefon, adresă, persoana de urgență. → Toate trei
      obligatorii; până nu le completezi, orice pagină a portalului te aduce înapoi aici.
- [ ] **P3 · Confirmarea emailului** — Livrări → mesajul de confirmare → linkul. → „Adresa ta este
      confirmată" și că urmează aprobarea biroului. Linkul folosit a doua oară spune că adresa e deja
      confirmată, fără să mai pomenească un link expirat.
- [ ] **P4 · Aprobarea** — ca admin, **Conturi în așteptare** → „Aprobă". Ca părinte, reîncarcă. →
      Portalul complet; mesajul de așteptare a dispărut.
- [ ] **P5 · Emailul acceptării** — Livrări. → Un mesaj care confirmă termenii și nota acceptate, cu
      versiunile lor.

### Portalul, cu `ana.popescu`

- [ ] **P6 · Acasă** — următoarea oră a copilului, cu grupa și adresa; dacă biroul l-a mutat pe
      săptămână, ora în care a fost mutat.
- [ ] **P7 · Comutatorul de copil** — la o familie cu doi copii, schimbă copilul. → Toate filele
      arată copilul ales, iar alegerea rămâne la trecerea între pagini.
- [ ] **P8 · Prezența** — calendarul lunii, cu prezent / absent / nemarcat; lunile anterioare. →
      Corespunde cu catalogul din admin (B4.6, T1).
- [ ] **P9 · Absențe** — ce a notat biroul și, dacă e cazul, mutarea: „va veni joi la grupa X".
- [ ] **P10 · Plăți** — facturile, cu **restul de plată** (nu totalul, dacă s-a plătit parțial),
      datele pentru transfer și reducerile. PDF-ul facturii se descarcă.
- [ ] **P11 · Proiecte** — doar lucrările trimise de birou; una încă „de verificat" nu apare.
- [ ] **P12 · Copiii din Profil** — adaugă un copil (data nașterii nu poate fi în viitor), corectează-i
      numele, șterge-l. → Merge; un copil **înscris** nu se poate șterge de aici, iar mesajul spune să
      suni la școală.
- [ ] **P13 · Sesiunile** — Profil → Sesiuni active: sesiunea de pe telefon și cea de pe laptop, cu
      „Sesiunea aceasta" marcată. Închide-o pe cealaltă. → Celălalt dispozitiv e scos la următoarea
      cerere (cel mult 15 minute).
- [ ] **P14 · Parola** — Profil → schimbă parola (cere parola actuală). → Celelalte sesiuni se închid.
- [ ] **P15 · „Ține-mă minte"** — autentificare fără bifă, închide browserul, redeschide. → Trebuie
      să te autentifici din nou. Cu bifă: rămâi autentificat.
- [ ] **P16 · Parola uitată** — deconectat, „Ți-ai uitat parola?" → Livrări → linkul (valabil o oră) →
      parolă nouă. → Te poți autentifica cu ea; linkul nu mai merge a doua oară.
- [ ] **P17 · Marketing** — Profil: comutatorul de mesaje promoționale. → Se salvează; un anunț de
      marketing (B6.1) nu mai ajunge la familie.
- [ ] **P18 · Acordul pentru lucrări** — Profil: pentru fiecare copil, dă și retrage acordul. →
      Confirmarea e în Livrări de fiecare dată. **Acorduri pentru lucrări** listează doar acordurile în
      vigoare, deci o retragere se vede prin copilul care dispare din listă, plus mesajul „Acord
      retras" către birou, în Livrări.
- [ ] **P19 · Datele mele** — Profil → „Descarcă datele mele". → Un fișier cu familia, copiii, facturile,
      acceptările; nimic despre altă familie.
- [ ] **P20 · Cererea de ștergere** — Profil → „Cere ștergerea contului" (două apăsări), apoi retrage-o. → Apare și dispare de
      la **Cereri de ștergere**; nimic nu se șterge fără biroul.

### Drumurile speciale

- [ ] **P21 · Cont pentru o familie trecută de birou** — ca admin, pagina familiei Florin Marin →
      completează un email → „Trimite linkul de cont". Livrări → linkul → alege utilizator și parolă. →
      Contul se creează, dar **nu vede familia** până nu-l aprobă biroul (Conturi în așteptare spune
      ce familie cere contul). După aprobare, vede copiii și facturile familiei.
- [ ] **P22 · Suspendarea** — ca admin, pagina familiei → suspendă, cu motiv. Ca părinte, încearcă să
      te autentifici. → Cu parola corectă: mesajul că contul e suspendat; cu una greșită: „parolă
      incorectă", ca oricui. Motivul e în Livrări. „Ridică suspendarea" redeschide contul.
- [ ] **P23 · Cont neconfirmat** — autentificare ca `diana.moldovan`, o înregistrare abandonată:
      n-a terminat nici pasul doi, nici confirmarea. → Întâi pasul doi (P2); după el, pe Acasă,
      cardul „De confirmat" cu butonul de retrimitere a linkului.
- [ ] **P24 · Termeni noi** — autentificare ca `david.georgescu`, care a acceptat o versiune mai veche
      a termenilor. → Ecranul „Am schimbat termenii", cu linkurile către secțiuni și cele două bife;
      după acceptare, portalul. Evidența din Profil arată ambele versiuni, fiecare cu ziua ei, iar
      emailul acceptării e în Livrări.

## 3. Biroul

- [ ] **B1 · Tabloul de bord** — cifrele (restanțe, cataloage nefăcute, cereri, conturi, contracte,
      proiecte, mesaje) și orele de azi. → Fiecare cifră duce la lista ei și spune același număr.

### Familii și copii

- [ ] **B2.1 · Familie de la telefon** — Profiluri → familie nouă, fără email și telefon. → Se
      salvează: aici doar numele și prenumele sunt obligatorii. Apăsat o dată cu formularul gol,
      arată ce lipsește; completat, se salvează **de la prima apăsare**.
- [ ] **B2.2 · Adresă deja folosită** — editează o familie cu emailul altei familii. → Refuz în
      română, „deja trecută la altă familie".
- [ ] **B2.3 · Copil nou** — pagina familiei din B2.1, care n-are încă niciun copil → „Adaugă
      Copil". → Apare la Copii.
- [ ] **B2.4 · Frați pe două familii** — o programare de pe `/proba` face o familie nouă pentru
      fiecare copil. Copilul → Editează → „Mută în altă familie". → Se mută cu tot ce are; familia
      rămasă goală se poate șterge din pagina ei.
- [ ] **B2.5 · Retragerea** — pagina familiei → retrage. → Refuzată cât are un copil înscris (mesajul
      spune ce să închizi întâi); după, apare la **Cereri de ștergere** cu ziua la care se șterg datele.

### Înscrieri, grupe, capacitate

- [ ] **B3.1 · Înscriere** — Grupe → grupa → „Gestionează" → „Adaugă" copilul. → O vârstă în afara
      grupei dă un avertisment care cere confirmare („Înscrie oricum"); o grupă plină refuză cu
      numere.
- [ ] **B3.2 · Contul părintelui** — adaugă un copil familiei lui `lucian.ionescu` (cont neaprobat) și
      înscrie-l. → Refuz: contul părintelui nu e activ.
- [ ] **B3.3 · Transfer** — mută un copil în altă grupă. → Grupa veche are un loc liber, oferit
      primei familii de pe lista ei de așteptare (mesaj în Livrări).
- [ ] **B3.4 · Proba** — Formarea grupelor → Probe fără decizie → Tudor Neagu (proba ținută din
      seed): „A rămas" îl face înscris, nefacturat până la decizie. Pe o altă probă, din Cereri și
      probe, „Pierdut…" o închide și locul se oferă listei. În ambele cazuri, cererea trece singură în
      starea ei.
- [ ] **B3.5 · Lista de așteptare** — o grupă plină: pune un copil pe listă, eliberează un loc. →
      Familia primește oferta de 48 de ore; locul oferit nu se mai vede ca liber.
- [ ] **B3.6 · Contractul** — Contracte nesemnate: „Semnat la" pe un rând. → Dispare din listă. O
      probă nu apare deloc aici: e gratuită și n-are contract.
- [ ] **B3.7 · Grupă nouă** — Locații și săli → locație, sală, apoi Grupe → grupă nouă. → Ora se
      suprapune cu altă grupă în aceeași sală: refuz. Orarul nu se scrie odată cu grupa: „Generează
      orarul" din Grupe îl scrie pe opt săptămâni, sărind vacanțele (sau jobul de la 04:30).
- [ ] **B3.8 · Grupa își schimbă ziua** — editează ziua sau ora unei grupe. → Orele viitoare se mută
      în săptămâna lor, familiile primesc **un** mesaj.
- [ ] **B3.9 · Formarea grupelor** — cererea neacoperită pe vârste și locații, plus probele fără
      decizie.

### Orarul și prezența

- [ ] **B4.1 · Anulare** — Orarul → o oră viitoare → anulează. → Familiile grupei au mesaj în
      Livrări; o oră cu prezențe nu se poate anula.
- [ ] **B4.2 · Mutare** — mută o oră în altă zi a aceleiași săptămâni. → Mesaj; o oră nu se mută
      într-un moment trecut; într-o sală prea mică, refuz cu numărul de copii.
- [ ] **B4.3 · Reactivare și recuperare** — reactivează ora anulată; recuperează o oră pierdută de
      sărbătoare (Recuperează, ferestrele din aceeași săptămână).
- [ ] **B4.4 · Calendarul școlar** — o vacanță de o săptămână. → Orele din ea se anulează, cu numele
      vacanței; ștergerea vacanței nu le reactivează.
- [ ] **B4.5 · Absență anunțată** — Absențe anunțate → notează că un copil lipsește la o oră → mută-l
      la altă grupă în aceeași săptămână. → Familia are mesaj; copilul apare în catalogul orei-gazdă,
      marcat ca venit din altă grupă.
- [ ] **B4.6 · Catalogul pe desktop** — Prezență → grupa → o oră → marchează și salvează. → Cifra
      „cataloage nefăcute" scade.

### Bani

- [ ] **B5.1 · Emiterea** — Emitere facturi → luna cea mai recentă **terminată** și încă neemisă. →
      Pe fiecare copil, ședințele numărate din cataloage; corectura pe copil are un motiv opțional.
      Emite. → Luna curentă e refuzată până i se termină ultima săptămână. Fiecare familie cu ceva de
      plată are emailul facturii în Livrări; o lună de 0 lei nu primește email.
- [ ] **B5.2 · PDF-ul** — Facturi → luna → o factură → PDF. → Se deschide, cu datele școlii, ale
      familiei și reducerile în cuvinte.
- [ ] **B5.3 · Încasare** — Restanțe → o familie → înregistrează plata. → Suma precompletată e
      **restul**; după salvare, familia iese din restanțe dacă a plătit tot, iar chitanța e în Livrări.
- [ ] **B5.4 · Transfer anunțat** — o plată prin transfer, cu bifa „doar anunțat". → Factura rămâne la
      restanțe, cu transferul lângă ea, și nu primește mementouri; din Plăți: „au intrat" (cu ziua) sau
      „n-a venit".
- [ ] **B5.5 · Storno** — Plăți → stornează o plată. → Factura redevine datorată.
- [ ] **B5.6 · Reduceri** — Reduceri: 50% pe luna viitoare pentru o familie; butonul de recomandare
      (+ / −) din pagina familiei. → Pe luna deja facturată, reducerea e refuzată.
- [ ] **B5.7 · Extrasul bancar** — Reconciliere → importă un CSV de la bancă. → Liniile cu numărul
      facturii în detalii sunt propuse sigur; confirmarea le face plăți.

### Comunicare

- [ ] **B6.1 · Anunț** — Anunțuri → către o grupă. → Numele unui copil în text dă avertisment; a doua
      trimitere identică în aceeași zi e refuzată; fiecare familie are mesajul în Livrări.
- [ ] **B6.2 · Șabloane** — Șabloane de email → editează textul unui șablon, previzualizează, salvează.
      → Mesajul următor folosește textul nou.
- [ ] **B6.3 · Livrări** — filtrele pe stare, destinatar și zile; un mesaj fără adresă numește familia.

### Restul

- [ ] **B7.1 · Cereri și probe** — deschide o cerere: fișa, notează ce a spus familia, „Am contactat",
      preia-o. → Se salvează câmp cu câmp; o cerere venită la telefon se adaugă de aici.
- [ ] **B7.2 · Rapoarte** — financiar (cele două calendare), ocupare, pâlnie, semnale.
- [ ] **B7.3 · Proiecte** — dacă agentul din birou e conectat: o lucrare salvată în folderul copilului
      apare „de verificat", apoi „trimis". Fără agent, se sare.
- [ ] **B7.4 · Erori** — `/admin/erori` după o zi de test. → Fiecare rând e un bug de raportat, cu
      codul lui; cifra din meniu scade când le marchezi rezolvate.

## 4. Profesorul, pe telefon

Tot ca `admin`, pe telefon (sau 390 px), la o oră din ziua de azi.

- [ ] **T1 · Catalogul de azi** — Prezența de azi → ora → atinge fiecare copil: prezent / absent. →
      Fiecare atingere se salvează singură; nu există buton de salvare.
- [ ] **T2 · „Sună părintele"** — la un copil absent. → Deschide apelul către numărul familiei. La un
      copil la probă la fel, cu numărul lăsat pe `/proba`: programează o probă pe o oră de azi care
      n-a început încă, apoi marcheaz-o absentă.
- [ ] **T3 · Fără rețea** — mod avion, marchează doi copii, scoate modul avion. → Marcajele stau în
      coadă (iconița de nor), apoi pleacă singure; nimic pierdut.
- [ ] **T4 · Altă zi** — săgețile sau data: o zi de săptămâna trecută. → Catalogul zilei aceleia, cu
      copiii grupei din ziua aceea; o zi din viitor nu se poate alege.
- [ ] **T5 · Copilul mutat** — ora-gazdă din B4.5. → Copilul mutat e în listă, cu grupa din care vine.

## 5. Ce nu se poate testa pe stage

- **Emailuri reale** — se citesc în Livrări (secțiunea 0).
- **Facturi fiscale SmartBill** — doar după contul real (vezi [lansare-platforma.md](lansare-platforma.md)).
- **Plata cu cardul** — nu există în MVP.
- **Miniaturile video** — cer `ffmpeg` pe instanță; imaginile și proiectele Scratch au miniatură.
- **Agentul din birou** — doar dacă e instalat pe calculatorul școlii.

## 6. La finalul fiecărei zile

- `/admin/erori`: ce a apărut nou, cu codul — fiecare rând e un bug, chiar dacă nimeni nu l-a observat
  pe ecran.
- Punctele picate, cu ID-ul lor, într-o listă: e ordinea în care se repară.
