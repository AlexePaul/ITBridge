import { COURSE_LEVELS, type CourseLevel } from "./courses";

/**
 * A piece of work by a child, shown on the subject's page.
 *
 * The file goes under `public/images/lucrari/<subject slug>/`, sized like the
 * room photographs — about 1200px on the long edge, JPEG — and `<NuxtPicture>`
 * resizes and converts it on the way out. A PowerPoint or a Canva design is
 * exported as an image first, one slide or one poster per file: a browser
 * shows an image, and cannot show a .pptx.
 */
export interface SubjectProject {
  image: string;
  /** What is in the picture, for a reader who cannot see it. */
  alt: string;
  /** What the child made, in the child's own terms: "Afiș pentru ziua școlii". */
  caption: string;
  /** First name and age, with the parent's consent: "Ilinca, 8 ani". Omitted otherwise. */
  by?: string;
  /** A Scratch project's public page on scratch.mit.edu, so a parent can play it. */
  link?: string;
}

export interface Subject {
  slug: string;
  /** How the tool is called in running text and in a link: "Scratch". */
  name: string;
  /**
   * The `teaches` entries in COURSE_LEVELS this subject stands for. The levels
   * a subject is taught at are derived from these, never listed by hand, so a
   * page cannot claim a level whose programme does not name the tool.
   */
  teaches: string[];
  /** Work by children who took the course. Empty until the school adds some. */
  projects: SubjectProject[];
}

/** In the order a child meets them: the youngest level first. */
export const SUBJECTS: Subject[] = [
  { slug: "canva", name: "Canva", teaches: ["Canva"], projects: [] },
  { slug: "tinkercad", name: "Tinkercad", teaches: ["Modelare 3D cu Tinkercad"], projects: [] },
  {
    slug: "office",
    name: "Office",
    teaches: ["Microsoft Word", "Microsoft PowerPoint", "Microsoft Excel"],
    projects: [],
  },
  { slug: "scratch", name: "Scratch", teaches: ["Scratch"], projects: [] },
  { slug: "cpp", name: "C++", teaches: ["C++", "C"], projects: [] },
];

export const findSubject = (slug: string) => SUBJECTS.find((subject) => subject.slug === slug);

/** The levels whose programme names the subject, in curriculum order. */
export const subjectLevels = (subject: Subject): CourseLevel[] =>
  COURSE_LEVELS.filter((level) => level.teaches.some((entry) => subject.teaches.includes(entry)));

/** The subjects a level's programme names — the same relation, read the other way. */
export const courseSubjects = (level: CourseLevel): Subject[] =>
  SUBJECTS.filter((subject) => subject.teaches.some((entry) => level.teaches.includes(entry)));

/** "9–13 ani": from the youngest level's floor to the oldest level's ceiling. */
export const subjectAges = (subject: Subject) => {
  const levels = subjectLevels(subject);
  return `${levels[0]!.minAge}–${levels[levels.length - 1]!.maxAge} ani`;
};

/** "clasa 3–4 și clasa 5–6", as it reads in a sentence. */
export const subjectLevelsLine = (subject: Subject) => {
  const titles = subjectLevels(subject).map((level) => level.title.toLowerCase());
  if (titles.length <= 1) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} și ${titles[titles.length - 1]}`;
};
