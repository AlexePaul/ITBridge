import { PUBLIC_PAGES } from "#shared/seo";
import {
  COURSE_LEVELS,
  MODULE_WEEKS_MAX,
  MODULE_WEEKS_MIN,
  PRICE_ONE_CHILD,
  PRICE_TWO_CHILDREN,
  SESSION_HOURS,
} from "#shared/courses";
import { TEACHERS } from "#shared/teachers";
import {
  formatAddress,
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_LOCATIONS,
  SCHOOL_NAME,
  SCHOOL_PHONE,
} from "#shared/school";

/**
 * llms.txt is a proposal, not a standard, and the crawlers that matter largely
 * ignore it today — it is here because it costs one file, it cannot hurt, and
 * it is generated from the same constants as the pages, so it cannot drift into
 * saying something the site does not.
 */
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, "");

  // Every section is a markdown link list, as llms.txt asks for: a parser that
  // only keeps `- [name](url)` lines still comes away with all six levels and
  // both addresses, rather than an empty section.
  const locations = SCHOOL_LOCATIONS.map(
    (location) =>
      `- [${location.neighbourhood}](${siteUrl}/locatii/${location.slug}): ` +
      `${formatAddress(location)}, ${location.postalCode}. ` +
      `Acoperă ${location.areaServed.join(", ")}.`
  ).join("\n");

  const levels = COURSE_LEVELS.map(
    (course) =>
      `- [${course.title}](${siteUrl}/cursuri#${course.slug}) ` +
      `(${course.minAge}–${course.maxAge} ani), ${course.level}: ${course.topics}`
  ).join("\n");

  // Derived, not retyped: the header claims this file cannot drift from the
  // pages, and a hand-written subject list is exactly how it would.
  //
  // The label is "subjects covered", not "subjects taught", because `teaches`
  // is written for schema.org `Course.teaches`, which takes learning outcomes
  // as well as technologies — "Olimpiada de informatică" and "Strategie de
  // examen" are things a child leaves with, not things on a timetable. Under
  // the wider label every entry is accurate, and the list still cannot drift.
  const taught = [...new Set(COURSE_LEVELS.flatMap((course) => course.teaches))].join(", ");

  // One nested bullet per teacher. Both bios on a single line ran to four
  // sentences of unbroken prose.
  const teachers = TEACHERS.map(
    (teacher) => `  - ${teacher.name} (${teacher.role}): ${teacher.bio.replace(/\s+/g, " ")}`
  ).join("\n");

  const pages = PUBLIC_PAGES.map(
    (page) => `- [${page.title.split(" | ")[0]}](${siteUrl}${page.path}): ${page.summary}`
  ).join("\n");

  const body = `# ${SCHOOL_NAME}

> Școală de informatică pentru copii din București, cu două locații: Drumul Taberei (Sector 6) și Străulești (Sector 1). Cursuri de la clasa 0 până la pregătirea pentru Bacalaureat și olimpiade.

Date despre școală, valabile la data ultimei actualizări a site-ului:

- Un modul durează ${MODULE_WEEKS_MIN}–${MODULE_WEEKS_MAX} săptămâni, cu o ședință de ${String(SESSION_HOURS).replace(".", ",")} ore pe săptămână, în grupe mici.
- ${PRICE_ONE_CHILD} lei pe lună pentru un copil; ${PRICE_TWO_CHILDREN} lei pe lună pentru doi copii din aceeași familie (al doilea copil plătește ${PRICE_TWO_CHILDREN - PRICE_ONE_CHILD} lei).
- Tehnologii și subiecte acoperite: ${taught}.
- Se poate preda și Python. În general recomandăm C și C++, fiindcă acelea se dau la Bacalaureat și la olimpiada de informatică.
- Telefon: ${SCHOOL_PHONE}. Email: ${SCHOOL_EMAIL}.
- Program: ${SCHOOL_HOURS.join("; ")}.
- Profesori:
${teachers}

## Locații

${locations}

## Nivelurile de curs

${levels}

## Pagini

${pages}
`;

  setHeader(event, "content-type", "text/plain; charset=utf-8");
  setHeader(event, "cache-control", "public, max-age=3600");
  return body;
});
