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

// One per subject, written out like the locations: the title is the phrase a
// parent types, and a template would give five pages one sentence with the
// tool's name swapped. The paths have to match SUBJECTS in subjects.ts —
// a test holds the two lists together.
const SUBJECT_PAGES: PageSeo[] = [
  {
    path: "/cursuri/canva",
    title: "Canva pentru copii, 6–9 ani | IT Bridge School",
    description:
      "Afișe, felicitări și colaje făcute de copii de 6–9 ani, la primul nivel de curs. Text, " +
      "imagine și culoare pe o pagină, cu un rezultat pe care îl arată acasă.",
    summary: "Ce fac copiii de 6–9 ani în Canva, la ce nivel se predă și lucrări ale copiilor.",
    priority: 0.8,
  },
  {
    path: "/cursuri/tinkercad",
    title: "Tinkercad pentru copii, 6–9 ani | IT Bridge School",
    description:
      "Primele obiecte 3D la 6–9 ani: o casă, o mașină, un breloc cu numele lor, din forme unite " +
      "și scobite în Tinkercad. Grupe mici, la Drumul Taberei și Străulești.",
    summary: "Modelare 3D în Tinkercad la 6–9 ani: ce construiesc copiii și ce învață pe drum.",
    priority: 0.8,
  },
  {
    path: "/cursuri/office",
    title: "Word, PowerPoint și Excel pentru copii | IT Bridge School",
    description:
      "Office pentru copii de 9–11 ani: un referat cu titluri și imagini în Word, o prezentare " +
      "în PowerPoint, un tabel cu o formulă în Excel. Ce cere școala, învățat cu structură.",
    summary:
      "Word, PowerPoint și Excel la 9–11 ani: ce lucrări fac copiii și de ce înainte de programare.",
    priority: 0.8,
  },
  {
    path: "/cursuri/scratch",
    title: "Cursuri Scratch pentru copii, 9–13 ani | IT Bridge School",
    description:
      "Primul joc scris de copil, la 9–13 ani: personaje, scor, bucle și condiții în Scratch. " +
      "Aceleași idei pe care le va scrie în C++ peste doi ani, fără sintaxă.",
    summary:
      "Scratch la 9–13 ani: primul joc, ce noțiuni de programare rămân și la ce nivel se predă.",
    priority: 0.8,
  },
  {
    path: "/cursuri/cpp",
    title: "Cursuri C++, 13–19 ani: olimpiadă și BAC | IT Bridge School",
    description:
      "C++ de la prima instrucțiune la Bacalaureat, 13–19 ani: algoritmi, vectori, structuri de " +
      "date, probleme de olimpiadă. Programa după care se dau examenele.",
    summary:
      "C++ la 13–19 ani: ce probleme rezolvă elevii la fiecare nivel, de ce C++ și nu Python, BAC.",
    priority: 0.8,
  },
];

export const PUBLIC_PAGES: PageSeo[] = [
  ...STATIC_PAGES,
  LOCATIONS_INDEX,
  ...LOCATION_PAGES,
  ...SUBJECT_PAGES,
];

export const pageSeo = (path: string): PageSeo => {
  const page = PUBLIC_PAGES.find((entry) => entry.path === path);
  if (!page) throw new Error(`No SEO copy declared for ${path}`);
  return page;
};
