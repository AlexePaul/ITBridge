import { SCHOOL_EMAIL, SCHOOL_PHONE } from "./school";
import { MODULE_WEEKS_MAX, MODULE_WEEKS_MIN, PRICE_ONE_CHILD } from "./courses";

/**
 * The day the facts on the fact-carrying pages were last checked, or the pages
 * themselves last changed in a way a reader would notice. Update this one line
 * when a price, an address or a timetable changes, and when titles, headings or
 * descriptions are rewritten — `lastmod` in the sitemap reads it too.
 *
 * Machine-readable because `dateModified` in the structured data reads it, and
 * a date is how a model settles a contradiction between two sources: prices and
 * timetables outlive their accuracy in search results, in directories and in the
 * memory of assistants trained a year ago, and an undated page loses that
 * argument to a confident older one.
 */
export const CONTENT_UPDATED_ISO = "2026-09-13";

const MONTHS_RO = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

/**
 * The same day as a reader sees it, derived rather than retyped — two constants
 * spelling one date is two constants that eventually disagree.
 */
export const CONTENT_UPDATED = `${MONTHS_RO[Number(CONTENT_UPDATED_ISO.slice(5, 7)) - 1]} ${CONTENT_UPDATED_ISO.slice(0, 4)}`;

export interface PageSeo {
  path: string;
  /** The whole <title>, brand included. */
  title: string;
  description: string;
  /** One line for llms.txt — what a reader would find here. */
  summary: string;
  priority: number;
}

const STATIC_PAGES: PageSeo[] = [
  {
    path: "/",
    // "IT" is the word parents type — "cursuri it" is the one Romanian query
    // Search Console shows for this site — and it appeared in no title outside
    // the brand. The suffix pushes this past 60 characters; Google shows the
    // site name on its own line from the WebSite node, so the part it may
    // truncate is the part it already prints.
    title: "Cursuri IT și programare pentru copii în București | IT Bridge School",
    // The service first, then the price, then both sectors: a snippet is read
    // against the query, and "cursuri it sector 6" should find its words in it.
    description:
      "Cursuri IT și programare pentru copii în București, de la clasa 0 la BAC. Grupe mici, " +
      `${PRICE_ONE_CHILD} lei pe lună, în Drumul Taberei (Sector 6) și Străulești (Sector 1).`,
    summary:
      "Prezentarea școlii: ce se învață, cele două locații din București, prețuri și contact.",
    priority: 1,
  },
  {
    path: "/cursuri",
    title: "Cursuri de programare pentru copii, 6–19 ani | IT Bridge School",
    // "Informatică" here and "IT" on the home page: the two pages used to open
    // with the same phrase and compete for it. Each now owns one.
    // The price inside the first eighty characters: a snippet is cut at about
    // 155 on a desktop and 120 on a phone, and the price is what gets the click.
    description:
      `Cursuri de informatică și programare pentru copii de 6–19 ani, ${PRICE_ONE_CHILD} lei pe lună. ` +
      "Șase niveluri, de la primii pași pe calculator la C++ și BAC, în module de " +
      `${MODULE_WEEKS_MIN}–${MODULE_WEEKS_MAX} săptămâni.`,
    summary:
      "Cele șase niveluri de curs pe vârste, cum decurge înscrierea, prețurile și întrebările frecvente.",
    priority: 0.9,
  },
  {
    path: "/despre-noi",
    title: "Profesorii: Alexe Vasile Paul și Alexe Ana Iulia | IT Bridge School",
    description:
      "Cine predă la IT Bridge School: Alexe Vasile Paul, programare și algoritmi, și Alexe Ana " +
      "Iulia, competențe digitale și creativitate.",
    summary: "Profesorii, formarea lor, valorile școlii și cele două locații.",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: "Contact: telefon, email și locațiile | IT Bridge School",
    description:
      `Telefon ${SCHOOL_PHONE}, email ${SCHOOL_EMAIL}. Două locații: Valea Oltului 73, Sector 6, ` +
      "și Șos. București-Târgoviște 19A, Sector 1.",
    summary: "Telefon, email, program de lucru, adresele și hărțile celor două locații.",
    priority: 0.7,
  },
  {
    path: "/proba",
    title: "Lecție de probă gratuită | IT Bridge School",
    description:
      "Programează online o lecție de probă gratuită, fără cont și fără telefon. Alegi ziua și ora " +
      "dintre grupele cu locuri libere, la Drumul Taberei sau Străulești.",
    summary:
      "Formularul prin care un părinte își programează singur o lecție de probă gratuită, alegând " +
      "ora dintre grupele care au loc liber.",
    // Second only to the home page: it is the conversion path the whole site leads to, and the one
    // page a search result should land on when somebody types „lecție de probă programare copii".
    priority: 0.9,
  },
];

const LOCATIONS_INDEX: PageSeo = {
  path: "/locatii",
  // The hub is where a sector-level search should land — "cursuri it sector 6"
  // has no neighbourhood in it — so the sectors are in the title. No brand
  // suffix, as on the two location pages, for the same reason of length.
  title: "Locații: cursuri IT pentru copii în Sectorul 6 și Sectorul 1",
  // A hyphen in the street name, as in school.ts and in the PostalAddress on
  // the same page: a matcher reads an en dash as a different address.
  description:
    "Cursuri IT pentru copii la două adrese din București: Valea Oltului 73, Drumul Taberei " +
    "(Sector 6), și Șos. București-Târgoviște 19A, Străulești (Sector 1).",
  summary: "Cele două locații, cu adresă și zonele pe care le acoperă fiecare.",
  priority: 0.8,
};

// Written one at a time, on purpose. A template over SCHOOL_LOCATIONS would
// give the two pages the same sentence with the neighbourhood swapped — the
// pattern the pages themselves are built to avoid — and would put a URL in the
// sitemap for any third location before the page existed.
const LOCATION_PAGES: PageSeo[] = [
  {
    path: "/locatii/drumul-taberei",
    // No brand suffix on the two location titles: with it they run to 70 and 66
    // characters and Google truncates it away anyway. The neighbourhood is the
    // whole point of the page, and the site name still reaches the SERP through
    // og:site_name and the WebSite node.
    // Three words for one thing, one per place: "IT" in the title, "informatică"
    // in the H1, "programare" in the description. A local search is typed with
    // any of them, and usually with the sector.
    title: "Cursuri IT pentru copii în Drumul Taberei, Sector 6",
    description:
      "Cursuri IT și programare pentru copii în Drumul Taberei, pe Valea Oltului 73, Sector 6, " +
      `la 600–850 m de metroul M5. Grupe mici, ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Locația din Drumul Taberei: cum ajungi cu metroul M5 sau cu autobuzul, program, preț și " +
      "întrebări frecvente.",
    priority: 0.8,
  },
  {
    path: "/locatii/straulesti",
    title: "Cursuri IT pentru copii în Străulești, Sector 1",
    description:
      "Cursuri IT și programare pentru copii în Străulești, pe Șos. București-Târgoviște 19A, " +
      `Sector 1, aproape de Bucureștii Noi și Chitila. ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Locația din Străulești: din ce zone vin copiii, cum ajungi cu mașina sau cu metroul M4, " +
      "program și preț.",
    priority: 0.8,
  },
];

// The legal pages — E22 S2. In the sitemap so they are found and checked (the a11y run reads the
// sitemap back), at the bottom of the list because nobody searches for them.
const LEGAL_PAGES: PageSeo[] = [
  {
    path: "/termeni",
    title: "Termeni și condiții | IT Bridge School",
    description:
      "Termenii de utilizare a contului de părinte: ce e contul, ce poți face din portal, cum se " +
      "facturează, ce se întâmplă cu datele la retragere.",
    summary: "Termenii contului de părinte, acceptați la înregistrare.",
    priority: 0.2,
  },
  {
    path: "/confidentialitate",
    title: "Politica de confidențialitate | IT Bridge School",
    description:
      "Ce date păstrăm despre familie și despre copil, de ce, cât timp, cu cine le împărțim și ce " +
      "drepturi ai.",
    summary: "Nota de informare privind prelucrarea datelor familiei și ale copilului.",
    priority: 0.2,
  },
  {
    path: "/cookies",
    title: "Politica de cookie-uri | IT Bridge School",
    description:
      "Cele patru cookie-uri proprii ale portalului, ce ține browserul în afara lor, și harta Google " +
      "care se încarcă doar dacă o ceri.",
    summary: "Cookie-urile site-ului și ale portalului, și singurul terț.",
    priority: 0.2,
  },
];

export const PUBLIC_PAGES: PageSeo[] = [
  ...STATIC_PAGES,
  LOCATIONS_INDEX,
  ...LOCATION_PAGES,
  ...LEGAL_PAGES,
];

export const pageSeo = (path: string): PageSeo => {
  const page = PUBLIC_PAGES.find((entry) => entry.path === path);
  if (!page) throw new Error(`No SEO copy declared for ${path}`);
  return page;
};
