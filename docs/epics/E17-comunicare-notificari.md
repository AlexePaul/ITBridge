# E17 · Comunicare și notificări

**Status:** propus · **Pistă:** Comunicare · **Depinde de:** E05, E06 · **Blochează:** E14, E20

## Problemă

Platforma nu trimite niciun mesaj. Nu există furnizor de email configurat, nu există șabloane, nu
există cozi, nu există evidență a ce s-a trimis. `@nestjs/mailer` sau echivalent nu apar în
dependențe.

Toată comunicarea cu părinții se face astăzi în afara platformei — cel mai probabil pe WhatsApp și
telefon. Funcționează la o locație și douăzeci de familii. La două locații nu mai scalează, iar
informația nu lasă urmă: nimeni nu poate spune dacă un părinte a fost anunțat de o anulare.

Șapte epic-uri depind de existența acestui canal:

| Epic | Ce trimite |
|---|---|
| [E11](E11-inscrieri-capacitate.md) | loc eliberat de pe lista de așteptare |
| [E12](E12-prezenta-orar.md) | absență, anulare de ședință, recuperare care expiră |
| [E13](E13-progres-evaluare.md) | raport de final de modul, certificat |
| [E14](E14-proiecte-elevi.md) | proiectele copilului, rezumat zilnic |
| [E15](E15-pricing-facturare.md) | factură emisă |
| [E16](E16-plati-fiscal.md) | confirmare de plată, memento de restanță |
| [E20](E20-achizitie-lead.md) | confirmare de programare la lecția de probă |

Dacă fiecare își construiește propriul mecanism, ai șapte implementări și un părinte care primește
șapte emailuri pe zi.

## Rezultat

Un singur sistem de mesaje, cu șabloane, preferințe și evidență. Un părinte primește ce trebuie,
când trebuie, atât cât a acceptat.

## În scop

- Furnizor de email transacțional și livrare fiabilă.
- Șabloane versionate, în română.
- Cozi cu reîncercare.
- Preferințe și dezabonare.
- Evidența livrărilor.
- Anunțuri către grupe și locații.
- Evaluarea unui canal secundar.

## În afara scopului

- Conținutul de marketing — vezi [E20](E20-achizitie-lead.md). Aici se construiește țeava.

## Story-uri

### S1 · Furnizor și livrabilitate

Un furnizor transacțional, cu procesare în UE de preferat, din motivele din
[E07](E07-securitate-gdpr.md). SPF, DKIM și DMARC configurate pe domeniu — fără ele, emailurile
ajung în spam, iar tot epicul devine inutil.

**Acceptanță:** un test de livrabilitate trece cu punctaj bun. Emailurile ajung în inbox la Gmail,
Yahoo și Outlook.

### S2 · Șabloane

Șabloane versionate, cu date interpolate, în română, responsive, cu variantă text. Previzualizabile
de admin înainte de trimitere.

**Acceptanță:** un șablon se modifică fără deploy. Fiecare are previzualizare cu date de test.

### S3 · Coadă și reîncercare

Trimiterea e asincronă, cu reîncercare la eșec temporar și oprire la eșec permanent. Nicio operațiune
de business nu așteaptă după un email — o factură se emite chiar dacă furnizorul de email e picat.

**Acceptanță:** furnizorul indisponibil o oră nu pierde niciun mesaj și nu blochează nimic.

### S4 · Preferințe și dezabonare

Fiecare părinte alege ce primește și cât de des: imediat, rezumat zilnic, rezumat săptămânal.
Mesajele tranzacționale — factură, plată, anulare de ședință — nu se pot opri. Cele opționale —
proiecte, marketing — da.

Distincția e și legală, și de bun-simț.

**Acceptanță:** dezabonarea de la marketing nu oprește facturile. Legătura de dezabonare
funcționează dintr-un click.

### S5 · Evidența livrărilor

Fiecare mesaj lasă înregistrare: destinatar, șablon, dată, stare, motiv de eșec. Adminul poate
răspunde la "a primit părintele anunțul de anulare?" — exact întrebarea care apare când cineva vine
degeaba la curs.

**Acceptanță:** întrebarea are răspuns din interfață, în sub un minut.

### S6 · Rezumate în loc de rafale

Un părinte cu doi copii, în zile diferite, cu proiecte, prezențe și o factură, ar putea primi zece
mesaje pe săptămână. Motorul de rezumate le adună într-unul singur, respectând preferința de
frecvență.

**Acceptanță:** un părinte cu doi copii nu primește mai mult de un email pe zi, cu excepția celor
tranzacționale urgente.

### S7 · Anunțuri

Un admin trimite un mesaj către o grupă, o locație sau toți părinții, cu previzualizare, confirmare
și evidență. Pentru "sâmbătă e zi liberă" sau "s-a schimbat sala".

**Acceptanță:** un anunț către o locație ajunge la toți părinții activi de acolo, cu raport de
livrare.

### S8 · Canal secundar

Evaluarea SMS sau WhatsApp Business pentru mesajele urgente — o anulare cu două ore înainte nu se
citește pe email. Costul per mesaj face diferența, deci se rezervă strict pentru urgențe.

**Acceptanță:** decizia e luată și documentată, cu costuri estimate.

## Dependențe

[E05](E05-robustete-backend.md) pentru rate limiting și configurație,
[E06](E06-observabilitate-operare.md) pentru alertare la eșecuri de livrare.

## Riscuri

**Prea multe mesaje și părinții se dezabonează.** Odată pierdut canalul, se recâștigă greu. S6 nu e
o rafinare, e o cerință de la început.

**Un email greșit trimis la toți nu se poate retrage.** Confirmare obligatorie și trimitere de test
către admin înainte de orice difuzare în masă.

**Adresele părinților sunt date personale.** `Profile.email` e opțional astăzi, deci unii părinți
nu au adresă în sistem. Colectarea trebuie făcută cu temei și scop clar.

## Definition of done

Toate epic-urile dependente folosesc acest sistem, niciunul nu trimite direct. Fiecare mesaj are
evidență. Preferințele sunt respectate.

## Întrebări deschise

- Câți părinți au adresă de email în sistem acum? Dacă puțini, colectarea e primul pas.
- Rămâne WhatsApp canalul principal pentru urgențe, în afara platformei?
- Cine scrie textele? Sunt fața școlii și merită scrise cu grijă, nu generate.
