import {
  formatAddress,
  SCHOOL_EMAIL,
  SCHOOL_LOCATIONS,
  SCHOOL_NAME,
  SCHOOL_OPENING_HOURS,
  SCHOOL_PHONE_E164,
  SCHOOL_SOCIAL,
  type SchoolLocation,
} from "./school";
import { COURSE_LEVELS, PRICE_ONE_CHILD, SESSION_HOURS, type CourseLevel } from "./courses";

type Node = Record<string, unknown>;

const trimSlash = (url: string) => url.replace(/\/$/, "");

export const ids = {
  organization: (site: string) => `${trimSlash(site)}/#organizatie`,
  website: (site: string) => `${trimSlash(site)}/#site`,
  location: (site: string, slug: string) => `${trimSlash(site)}/locatii/${slug}#locatie`,
  page: (site: string, path: string) => `${trimSlash(site)}${path}#pagina`,
  course: (site: string, slug: string) => `${trimSlash(site)}/cursuri#${slug}`,
  person: (site: string, slug: string) => `${trimSlash(site)}/despre-noi#${slug}`,
};

const postalAddress = (location: SchoolLocation) => ({
  "@type": "PostalAddress",
  streetAddress: location.street,
  addressLocality: location.city,
  // Romanian addresses are read by sector, and that is the level Google uses.
  addressRegion: location.district,
  postalCode: location.postalCode,
  addressCountry: location.country,
});

const openingHours = () =>
  SCHOOL_OPENING_HOURS.filter((entry) => entry.opens).map((entry) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: entry.days.map((day) => `https://schema.org/${day}`),
    opens: entry.opens,
    closes: entry.closes,
  }));

/** The school itself — one node, referenced by everything else. */
export const organizationNode = (site: string): Node => ({
  "@type": ["EducationalOrganization", "LocalBusiness"],
  "@id": ids.organization(site),
  name: SCHOOL_NAME,
  url: `${trimSlash(site)}/`,
  logo: `${trimSlash(site)}/android-chrome-512x512.png`,
  image: `${trimSlash(site)}/images/og-default.jpg`,
  description:
    "Școală de informatică pentru copii din București, cu cursuri de la clasa 0 până la " +
    "pregătirea pentru Bacalaureat și olimpiade, în grupe mici, la două locații.",
  telephone: SCHOOL_PHONE_E164,
  email: SCHOOL_EMAIL,
  priceRange: `${PRICE_ONE_CHILD} RON`,
  currenciesAccepted: "RON",
  inLanguage: "ro-RO",
  address: postalAddress(SCHOOL_LOCATIONS[0]!),
  areaServed: SCHOOL_LOCATIONS.flatMap((location) => location.areaServed).map((area) => ({
    "@type": "Place",
    name: area,
  })),
  sameAs: [SCHOOL_SOCIAL.instagram, SCHOOL_SOCIAL.facebook, SCHOOL_SOCIAL.tiktok],
  location: SCHOOL_LOCATIONS.map((location) => ({ "@id": ids.location(site, location.slug) })),
  openingHoursSpecification: openingHours(),
});

/** One node per address: this is what local search reads. */
export const locationNode = (site: string, location: SchoolLocation): Node => ({
  "@type": ["EducationalOrganization", "LocalBusiness"],
  "@id": ids.location(site, location.slug),
  name: `${SCHOOL_NAME} — ${location.neighbourhood}`,
  parentOrganization: { "@id": ids.organization(site) },
  url: `${trimSlash(site)}/locatii/${location.slug}`,
  telephone: SCHOOL_PHONE_E164,
  email: SCHOOL_EMAIL,
  address: postalAddress(location),
  geo: {
    "@type": "GeoCoordinates",
    latitude: location.geo.latitude,
    longitude: location.geo.longitude,
  },
  hasMap: location.mapLink,
  areaServed: location.areaServed.map((area) => ({ "@type": "Place", name: area })),
  openingHoursSpecification: openingHours(),
  priceRange: `${PRICE_ONE_CHILD} RON`,
  image: `${trimSlash(site)}/images/clasa-01.jpg`,
});

export const websiteNode = (site: string): Node => ({
  "@type": "WebSite",
  "@id": ids.website(site),
  url: `${trimSlash(site)}/`,
  name: SCHOOL_NAME,
  inLanguage: "ro-RO",
  publisher: { "@id": ids.organization(site) },
});

export const webPageNode = (
  site: string,
  page: { path: string; title: string; description: string }
): Node => ({
  "@type": "WebPage",
  "@id": ids.page(site, page.path),
  url: `${trimSlash(site)}${page.path}`,
  name: page.title,
  description: page.description,
  isPartOf: { "@id": ids.website(site) },
  about: { "@id": ids.organization(site) },
  inLanguage: "ro-RO",
});

export const breadcrumbNode = (site: string, trail: { name: string; path: string }[]): Node => ({
  "@type": "BreadcrumbList",
  itemListElement: trail.map((step, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: step.name,
    item: `${trimSlash(site)}${step.path}`,
  })),
});

const isoDuration = (hours: number) => {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `PT${whole}H${minutes ? `${minutes}M` : ""}`;
};

export const courseNode = (site: string, course: CourseLevel): Node => ({
  "@type": "Course",
  "@id": ids.course(site, course.slug),
  name: `${course.title} — ${course.level}`,
  description: course.short,
  abstract: course.topics,
  url: ids.course(site, course.slug),
  provider: { "@id": ids.organization(site) },
  inLanguage: "ro-RO",
  teaches: course.teaches,
  educationalLevel: course.level,
  audience: {
    "@type": "EducationalAudience",
    educationalRole: "student",
    suggestedMinAge: course.minAge,
    suggestedMaxAge: course.maxAge,
  },
  offers: {
    "@type": "Offer",
    price: PRICE_ONE_CHILD,
    priceCurrency: "RON",
    category: "Taxă lunară",
    availability: "https://schema.org/InStock",
    url: `${trimSlash(site)}/cursuri`,
  },
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Onsite",
    courseWorkload: isoDuration(SESSION_HOURS),
    inLanguage: "ro-RO",
    location: SCHOOL_LOCATIONS.map((location) => ({ "@id": ids.location(site, location.slug) })),
  },
});

/**
 * Google retired the single-course rich result in 2025; the course *list*
 * survives, and it wants an ItemList of at least three courses with distinct
 * URLs on the same domain. The fragment URLs match the ids rendered on
 * /cursuri. The visual carousel is English-only, so this will not draw one on a
 * Romanian page — the markup is still an accurate description of the page, and
 * it is what an assistant reads.
 */
export const courseListNode = (site: string): Node => ({
  "@type": "ItemList",
  "@id": `${trimSlash(site)}/cursuri#niveluri`,
  name: "Nivelurile de curs la IT Bridge School",
  numberOfItems: COURSE_LEVELS.length,
  itemListElement: COURSE_LEVELS.map((course, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: ids.course(site, course.slug),
    item: courseNode(site, course),
  })),
});

export const allCourseNodes = (site: string) =>
  COURSE_LEVELS.map((course) => courseNode(site, course));

export const faqNode = (questions: { question: string; answer: string }[]): Node => ({
  "@type": "FAQPage",
  mainEntity: questions.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: { "@type": "Answer", text: entry.answer },
  })),
});

export const personNode = (
  site: string,
  teacher: { slug: string; name: string; role: string; bio: string; image: string }
): Node => ({
  "@type": "Person",
  "@id": ids.person(site, teacher.slug),
  name: teacher.name,
  jobTitle: teacher.role,
  description: teacher.bio,
  image: `${trimSlash(site)}${teacher.image}`,
  worksFor: { "@id": ids.organization(site) },
});

/** Used by llms.txt and by the location pages' summary line. */
export const locationSummary = (location: SchoolLocation) =>
  `${SCHOOL_NAME} — ${location.neighbourhood}, ${formatAddress(location)}`;
