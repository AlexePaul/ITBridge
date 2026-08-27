import { PUBLIC_PAGES } from "#shared/seo";
import { COURSE_LEVELS, PRICE_ONE_CHILD, PRICE_TWO_CHILDREN } from "#shared/courses";
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

  const locations = SCHOOL_LOCATIONS.map(
    (location) =>
      `- ${location.neighbourhood}: ${formatAddress(location)}, ${location.postalCode}. ` +
      `Acoperă ${location.areaServed.join(", ")}. ${siteUrl}/locatii/${location.slug}`
  ).join("\n");

  const levels = COURSE_LEVELS.map(
    (course) =>
      `- ${course.title} (${course.minAge}–${course.maxAge} ani), ${course.level}: ${course.topics}`
  ).join("\n");

  const pages = PUBLIC_PAGES.map(
    (page) => `- [${page.title.split(" | ")[0]}](${siteUrl}${page.path}): ${page.summary}`
  ).join("\n");

  const body = `# ${SCHOOL_NAME}

> Școală de informatică pentru copii din București, cu două locații: Drumul Taberei (Sector 6) și Străulești (Sector 1). Cursuri de la clasa 0 până la pregătirea pentru Bacalaureat și olimpiade.

Fapte verificabile, valabile la data ultimei actualizări a site-ului:

- Un modul durează 6–8 săptămâni, cu o ședință de 1,5 ore pe săptămână, în grupe mici.
- ${PRICE_ONE_CHILD} lei pe lună pentru un copil; ${PRICE_TWO_CHILDREN} lei pe lună pentru doi copii din aceeași familie (al doilea copil plătește ${PRICE_TWO_CHILDREN - PRICE_ONE_CHILD} lei).
- Se predau Scratch, Office, HTML, CSS, JavaScript, C și C++, algoritmi, structuri de date și SQL. Nu se predă Python.
- Telefon: ${SCHOOL_PHONE}. Email: ${SCHOOL_EMAIL}.
- Program: ${SCHOOL_HOURS.join("; ")}.
- Profesori: Alexe Vasile Paul (programare și algoritmi; licențiat în Informatică la Universitatea din București, a predat la nivel universitar, programator backend) și Alexe Ana Iulia (competențe digitale și creativitate; Office, Canva, Tinkercad, Scratch).

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
