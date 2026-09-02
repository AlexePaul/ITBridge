export interface CourseLevel {
  slug: string;
  /** The ordinal shown on the page. */
  num: string;
  title: string;
  level: string;
  /** Under 60 characters — Google truncates Course.description there. */
  short: string;
  /** What a parent would search: "8 ani". */
  minAge: number;
  maxAge: number;
  topics: string;
  /** The technologies and subjects taught, for structured data. */
  teaches: string[];
}

export const COURSE_LEVELS: CourseLevel[] = [
  {
    slug: "clasa-0-2",
    num: "01",
    title: "Clasa 0–2",
    level: "Inițiere",
    short: "Primii pași pe calculator și desen digital, 6–9 ani.",
    minAge: 6,
    maxAge: 9,
    topics:
      "Cunoașterea calculatorului, folosirea mouse-ului și a tastaturii, jocuri educative, " +
      "primele concepte de bază și creativitate prin desen digital 2D și 3D.",
    teaches: [
      "Utilizarea calculatorului",
      "Desen digital 2D",
      "Modelare 3D cu Tinkercad",
      "Canva",
      "Jocuri educative",
    ],
  },
  {
    slug: "clasa-3-4",
    num: "02",
    title: "Clasa 3–4",
    level: "Începători",
    short: "Office, siguranță online și primul Scratch, 9–11 ani.",
    minAge: 9,
    maxAge: 11,
    topics:
      "Noțiuni de bază în informatică, sisteme de operare, aplicații Office (Word, PowerPoint, " +
      "Excel), internet și siguranță online, primele programe în Scratch.",
    teaches: [
      "Microsoft Word",
      "Microsoft PowerPoint",
      "Microsoft Excel",
      "Siguranță online",
      "Scratch",
    ],
  },
  {
    slug: "clasa-5-6",
    num: "03",
    title: "Clasa 5–6",
    level: "Intermediar",
    short: "Algoritmi, Scratch și primele pagini web, 11–13 ani.",
    minAge: 11,
    maxAge: 13,
    topics:
      "Introducere în algoritmi, programare în Scratch, proiecte practice și primele site-uri " +
      "web simple.",
    teaches: ["Algoritmi", "Scratch", "HTML", "CSS"],
  },
  {
    slug: "clasa-7-8",
    num: "04",
    title: "Clasa 7–8",
    level: "Intermediar–avansat",
    short: "C++, HTML, CSS, JavaScript și olimpiadă, 13–15 ani.",
    minAge: 13,
    maxAge: 15,
    topics:
      "Programare în C++, algoritmi și instrucțiuni de bază, site-uri web cu HTML, CSS și " +
      "JavaScript, introducere în baze de date și pregătire pentru olimpiade școlare.",
    teaches: [
      "C++",
      "Algoritmi",
      "HTML",
      "CSS",
      "JavaScript",
      "Baze de date",
      "Olimpiada de informatică",
    ],
  },
  {
    slug: "clasa-9-12",
    num: "05",
    title: "Clasa 9–12",
    level: "Avansat",
    short: "C/C++, structuri de date, SQL și BAC, 15–19 ani.",
    minAge: 15,
    maxAge: 19,
    topics:
      "Algoritmi și complexitate, programare în C/C++, structuri de date avansate, probleme de " +
      "concurs, baze de date SQL, pregătire pentru BAC și olimpiadă.",
    teaches: ["C", "C++", "Structuri de date", "Complexitate", "SQL", "Bacalaureat informatică"],
  },
  {
    slug: "pregatire-bacalaureat",
    num: "06",
    title: "Pregătire Bacalaureat",
    level: "Avansat",
    short: "Probleme tip pentru Bacalaureatul de informatică.",
    minAge: 17,
    maxAge: 19,
    topics:
      "Probleme tip pentru Bacalaureat, algoritmi de concurs, timp și strategie de examen, " +
      "feedback și corecții la fiecare ședință.",
    teaches: ["Bacalaureat informatică", "Algoritmi de concurs", "Strategie de examen"],
  },
];

/**
 * Every technology and subject across the six levels, each once, in the order
 * the levels introduce them. Derived, not retyped: llms.txt prints it and the
 * organization node claims it as `knowsAbout`, and a second hand-written list
 * is the one that would drift.
 */
export const SUBJECTS_COVERED = [...new Set(COURSE_LEVELS.flatMap((course) => course.teaches))];

/** What a module costs and how long it runs — stated once, quoted everywhere. */
export const PRICE_ONE_CHILD = 350;
export const PRICE_TWO_CHILDREN = 600;
export const SESSION_HOURS = 1.5;
export const MODULE_WEEKS_MIN = 6;
export const MODULE_WEEKS_MAX = 8;
