import { describe, expect, it } from "vitest";
import { COURSE_LEVELS, SUBJECTS_COVERED } from "../shared/courses";
import { PUBLIC_PAGES } from "../shared/seo";
import {
  courseSubjects,
  findSubject,
  SUBJECTS,
  subjectAges,
  subjectLevels,
  subjectLevelsLine,
} from "../shared/subjects";

describe("SUBJECTS", () => {
  it("stands only for things a level's programme actually names", () => {
    for (const subject of SUBJECTS) {
      for (const entry of subject.teaches) expect(SUBJECTS_COVERED).toContain(entry);
    }
  });

  it("is taught at at least one level, listed in curriculum order", () => {
    for (const subject of SUBJECTS) {
      const nums = subjectLevels(subject).map((level) => level.num);
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual([...nums].sort());
    }
  });

  it("has exactly one public page per subject, and no page for a subject that does not exist", () => {
    const declared = PUBLIC_PAGES.map((page) => page.path).filter((path) =>
      path.startsWith("/cursuri/")
    );
    expect(declared.sort()).toEqual(SUBJECTS.map((subject) => `/cursuri/${subject.slug}`).sort());
  });

  it("has unique slugs, each of which findSubject resolves", () => {
    expect(new Set(SUBJECTS.map((subject) => subject.slug)).size).toBe(SUBJECTS.length);
    for (const subject of SUBJECTS) expect(findSubject(subject.slug)).toBe(subject);
  });

  it("reads the level–subject relation the same in both directions", () => {
    for (const level of COURSE_LEVELS) {
      for (const subject of courseSubjects(level)) expect(subjectLevels(subject)).toContain(level);
    }
    for (const subject of SUBJECTS) {
      for (const level of subjectLevels(subject)) expect(courseSubjects(level)).toContain(subject);
    }
  });

  it("spans the ages of every level the subject is taught at", () => {
    expect(subjectAges(findSubject("scratch")!)).toBe("9–13 ani");
    expect(subjectAges(findSubject("cpp")!)).toBe("13–19 ani");
    expect(subjectAges(findSubject("canva")!)).toBe("6–9 ani");
  });

  it("derives the Bacalaureat page from the two levels whose programme names the exam", () => {
    const bac = findSubject("bac-informatica")!;
    expect(subjectLevels(bac).map((level) => level.num)).toEqual(["05", "06"]);
    expect(subjectAges(bac)).toBe("15–19 ani");
  });

  it("names the levels as a sentence would", () => {
    expect(subjectLevelsLine(findSubject("scratch")!)).toBe("clasa 3–4 și clasa 5–6");
    expect(subjectLevelsLine(findSubject("canva")!)).toBe("clasa 0–2");
  });

  it("points every project at an image the site serves, with a description", () => {
    for (const subject of SUBJECTS) {
      for (const project of subject.projects) {
        expect(project.image).toMatch(/^\/images\/lucrari\/[a-z]+\/[a-z0-9-]+\.(jpe?g|png)$/);
        expect(project.alt.length).toBeGreaterThan(10);
        expect(project.caption.length).toBeGreaterThan(0);
      }
    }
  });
});
