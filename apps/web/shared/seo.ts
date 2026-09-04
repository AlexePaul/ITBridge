import { SCHOOL_EMAIL, SCHOOL_PHONE } from "./school";
import { MODULE_WEEKS_MAX, MODULE_WEEKS_MIN, PRICE_ONE_CHILD, SESSION_HOURS } from "./courses";

const sessionLength = String(SESSION_HOURS).replace(".", ",");

/**
 * The day the facts on the fact-carrying pages were last checked. Update this
 * one line when a price, an address or a timetable changes.
 *
 * Machine-readable because `dateModified` in the structured data reads it, and
 * a date is how a model settles a contradiction between two sources: prices and
 * timetables outlive their accuracy in search results, in directories and in the
 * memory of assistants trained a year ago, and an undated page loses that
 * argument to a confident older one.
 */
export const CONTENT_UPDATED_ISO = "2026-08-28";

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
    title: "Cursuri de programare pentru copii în București | IT Bridge School",
    description:
      `${PRICE_ONE_CHILD} lei pe lună, grupe mici, două locații (Drumul Taberei și Străulești). ` +
      "Informatică și programare pentru copii, de la clasa 0 până la Bacalaureat.",
    summary:
      "Prezentarea școlii: ce se învață, cele două locații din București, prețuri și contact.",
    priority: 1,
  },
  {
    path: "/cursuri",
    title: "Cursuri de programare pentru copii, 6–19 ani | IT Bridge School",
    description:
      `Șase niveluri, de la primii pași pe calculator la C++ și pregătire de BAC. Module de ` +
      `${MODULE_WEEKS_MIN}–${MODULE_WEEKS_MAX} săptămâni, o ședință de ${sessionLength} ore, ` +
      `${PRICE_ONE_CHILD} lei pe lună.`,
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
  title: "Locații: Drumul Taberei și Străulești | IT Bridge School",
  description:
    "Două săli de curs în București: Valea Oltului 73, în Drumul Taberei, și Șos. București–" +
    "Târgoviște 19A, în Străulești. Aceeași programă la amândouă.",
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
    // No brand suffix on the two location titles: with it they run to 72 and 68
    // characters and Google truncates it away anyway. The neighbourhood is the
    // whole point of the page, and the site name still reaches the SERP through
    // og:site_name and the WebSite node.
    title: "Cursuri de informatică pentru copii în Drumul Taberei",
    description:
      "Cursuri de programare pentru copii pe Valea Oltului 73, Sector 6, la 600–850 m de trei " +
      `stații de metrou M5. Grupe mici, ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Locația din Drumul Taberei: cum ajungi cu metroul M5 sau cu autobuzul, program, preț și " +
      "întrebări frecvente.",
    priority: 0.8,
  },
  {
    path: "/locatii/straulesti",
    title: "Cursuri de informatică pentru copii în Străulești",
    description:
      "Cursuri de programare pentru copii pe Șos. București-Târgoviște 19A, Sector 1, pentru " +
      `Străulești, Bucureștii Noi, Chitila și Mogoșoaia. ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Locația din Străulești: din ce zone vin copiii, cum ajungi cu mașina sau cu metroul M4, " +
      "program și preț.",
    priority: 0.8,
  },
];

export const PUBLIC_PAGES: PageSeo[] = [...STATIC_PAGES, LOCATIONS_INDEX, ...LOCATION_PAGES];

export const pageSeo = (path: string): PageSeo => {
  const page = PUBLIC_PAGES.find((entry) => entry.path === path);
  if (!page) throw new Error(`No SEO copy declared for ${path}`);
  return page;
};
