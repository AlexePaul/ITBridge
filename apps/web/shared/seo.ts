import { SCHOOL_PHONE } from "./school";
import { PRICE_ONE_CHILD } from "./courses";

/** Shown on the pages that carry facts, so a reader can see how fresh they are. */
export const CONTENT_UPDATED = "august 2026";

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
      "Cursuri de informatică și programare pentru copii, de la clasa 0 la Bacalaureat, în grupe " +
      `mici, la Drumul Taberei și Străulești. ${PRICE_ONE_CHILD} lei pe lună, o ședință de 1,5 ore pe săptămână.`,
    summary:
      "Prezentarea școlii: ce se învață, cele două locații din București, prețuri și contact.",
    priority: 1,
  },
  {
    path: "/cursuri",
    title: "Cursuri de programare pentru copii, 6–19 ani | IT Bridge School",
    description:
      "Șase niveluri, de la primii pași pe calculator la C++, algoritmi și pregătire de BAC. " +
      `Module de 6–8 săptămâni, o ședință de 1,5 ore pe săptămână, ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Cele șase niveluri de curs pe vârste, cum decurge înscrierea, prețurile și întrebările frecvente.",
    priority: 0.9,
  },
  {
    path: "/despre-noi",
    title: "Profesorii IT Bridge School — Alexe Vasile Paul și Alexe Ana Iulia",
    description:
      "Cine predă: Alexe Vasile Paul, licențiat în Informatică la Universitatea din București, " +
      "programare și algoritmi, și Alexe Ana Iulia, competențe digitale și creativitate.",
    summary: "Profesorii, formarea lor, valorile școlii și cele două locații.",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: "Contact — telefon, email și cele două locații | IT Bridge School",
    description:
      `Sună la ${SCHOOL_PHONE} sau scrie la office@itbridgeschool.com. Cele două locații: ` +
      "Strada Valea Oltului 73, Sector 6, și Șoseaua București–Târgoviște 19A, Sector 1.",
    summary: "Telefon, email, program de lucru, adresele și hărțile celor două locații.",
    priority: 0.7,
  },
];

const LOCATIONS_INDEX: PageSeo = {
  path: "/locatii",
  title: "Locații — Drumul Taberei și Străulești | IT Bridge School",
  description:
    "IT Bridge School are două săli de curs în București: Strada Valea Oltului 73, în Drumul " +
    "Taberei, Sector 6, și Șoseaua București–Târgoviște 19A, în Străulești, Sector 1.",
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
    title: "Cursuri de informatică pentru copii în Drumul Taberei | IT Bridge School",
    description:
      "Sală de curs pe Strada Valea Oltului 73, Sector 6, la 600–850 de metri de trei stații de " +
      `metrou M5. Grupe mici, de la clasa 0 la Bacalaureat, ${PRICE_ONE_CHILD} lei pe lună.`,
    summary:
      "Locația din Drumul Taberei: cum ajungi cu metroul M5 sau cu autobuzul, program, preț și " +
      "întrebări frecvente.",
    priority: 0.8,
  },
  {
    path: "/locatii/straulesti",
    title: "Cursuri de informatică pentru copii în Străulești și Bucureștii Noi | IT Bridge School",
    description:
      "Sală de curs pe Șoseaua București–Târgoviște 19A, Sector 1, pentru familiile din " +
      `Străulești, Bucureștii Noi, Băneasa, Chitila și Mogoșoaia. Aceleași șase niveluri, ${PRICE_ONE_CHILD} lei pe lună.`,
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
