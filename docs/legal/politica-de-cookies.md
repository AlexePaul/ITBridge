# Politica de cookie-uri

**Versiunea 0.2 · ciornă din 8 septembrie 2026 · neverificată de un avocat · nepublicată.**
Nu mai are fapte marcate `[[…]]`: cele două pe care le avea erau despre hartă, iar E07 S5 le-a
răspuns în cod — harta stă acum în spatele unui buton, iar alegerea nu se scrie nicăieri. Ce mai
lipsește înainte de publicare e în [README](README.md).

---

## 1. Ce e un cookie și de ce contează

Un cookie e un mic text pe care browserul îl păstrează pentru un site și îl trimite înapoi la
fiecare pagină. Unele sunt necesare ca să funcționeze ceva — de exemplu să rămâi autentificat —,
altele servesc la urmărirea vizitatorilor. Legea 506/2004 și GDPR spun că pentru a doua categorie
ne trebuie acordul tău înainte să le punem; pentru prima, nu.

Site-ul `itbridgeschool.com` și portalul de părinte pun **numai cookie-uri necesare**, toate ale
noastre. Singurul lucru de la un terț e harta Google de pe paginile locațiilor, care se încarcă
doar dacă o ceri.

## 2. Cookie-urile noastre

| Nume               | Cine îl primește    | La ce servește                                      | Cât ține                                                                       |
| ------------------ | ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `accessToken`      | cine se autentifică | tokenul de acces la portal                          | cookie de sesiune; tokenul din el expiră în 15 minute și se reînnoiește singur |
| `refreshToken`     | cine se autentifică | reînnoiește accesul fără reautentificare            | cookie de sesiune; tokenul din el expiră în cel mult 7 zile                    |
| `portalChild`      | părinții            | ține minte ce copil ai ales în portal, între pagini | cookie de sesiune                                                              |
| `selectedLocation` | personalul școlii   | ține minte locația filtrată în zona de administrare | cookie de sesiune                                                              |

„Cookie de sesiune" înseamnă că dispare când închizi browserul. Niciunul nu conține date despre
tine sau despre copil — doar tokenuri și un identificator numeric — și niciunul nu e citit de
altcineva decât de platforma noastră.

Vizitatorii site-ului public, care nu se autentifică, **nu primesc niciun cookie**.

Toate patru sunt strict necesare în sensul Legii 506/2004, art. 4: fără primele două nu poți
rămâne autentificat, iar ultimele două apar doar după o alegere pe care o faci tu — copilul sau
locația — și dispar odată cu sesiunea. De asta nu cerem acord pentru ele.

## 3. Ce ține browserul în afară de cookie-uri

Site-ul folosește și memoria locală a browserului (`localStorage`), tot pe domeniul nostru, și
tot pe paginile publice, nu doar în portal:

- `nuxt-color-mode` — dacă vrei temă deschisă, închisă, sau cea a sistemului tău. Se scrie pe orice
  pagină, de la prima, cu valoarea `system` până alegi altceva.
- `attendance-pending-marks-v1` — doar pentru personalul școlii, în portal: marcajele de prezență
  care așteaptă o conexiune atunci când rețeaua din sală pică.

Niciuna nu e un cookie, deci nu se trimite nicăieri cu fiecare cerere, și nimic din ele nu pleacă
spre altcineva. Prima ține o preferință de afișare pe care ai exprimat-o tu, a doua ține munca
făcută offline a unui profesor; amândouă sunt strict necesare în același sens ca și cookie-urile de
mai sus, deci nu cerem acord nici pentru ele.

## 4. Harta Google

Pe paginile „Drumul Taberei" și „Străulești" e o hartă încorporată de la Google Maps. Când se
încarcă, browserul tău cere harta de la Google, iar Google primește adresa ta IP și poate pune
cookie-uri ale lui — `NID`, care ține până la 13 luni —, după propria
[politică de confidențialitate](https://policies.google.com/privacy). Google LLC e certificată în
Cadrul UE–SUA de protecție a datelor, deci transferul spre SUA e acoperit.

De aceea **harta nu se încarcă până nu apeși pe ea**. Până atunci vezi adresa, o legătură către
Google Maps care se deschide în altă filă, și un buton. Dacă nu apeși, Google nu află că ai fost
pe pagină.

## 5. Cum le controlezi

- Cookie-urile noastre le ștergi din setările browserului; la următoarea autentificare se pun la
  loc, fiindcă fără ele nu poți rămâne autentificat. Nu există o setare „fără cookie-uri
  necesare" — ar însemna „fără portal".
- Harta o încarci sau nu, la fiecare vizită: alegerea ține cât stai pe site — apeși o dată și
  amândouă paginile de locație o respectă —, dar nu o scriem nicăieri, deci la vizita următoare
  întrebăm din nou. Un cookie care ține minte acordul ar fi fost legal fără acord, dar ar fi
  costat propoziția de mai sus: că un vizitator care nu se autentifică nu primește niciun cookie.
- Nu folosim unelte de analiză a traficului, pixeli de rețele sociale sau reclame, deci nu există
  nimic de refuzat în plus. Dacă vreodată adăugăm așa ceva, documentul ăsta se schimbă înainte, iar
  scripturile nu pornesc fără acordul tău.

## 6. Legătura cu celelalte documente

Ce facem cu datele pe care le aflăm din cookie-uri și loguri e în
[Politica de confidențialitate](politica-de-confidentialitate.md), §3.1 și §3.9. Contul și regulile
lui sunt în [Termeni și condiții](termeni-si-conditii.md).
