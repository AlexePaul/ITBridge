import {
  SCHOOL_ALTERNATE_NAMES,
  SCHOOL_EMAIL,
  SCHOOL_LOCATIONS,
  SCHOOL_NAME,
  SCHOOL_OPENING_HOURS,
  SCHOOL_PHONE_E164,
  SCHOOL_SOCIAL,
  type SchoolLocation,
} from "./school";
import {
  COURSE_LEVELS,
  MODULE_WEEKS_MIN,
  PRICE_ONE_CHILD,
  PRICE_TWO_CHILDREN,
  SESSION_HOURS,
  SUBJECTS_COVERED,
  type CourseLevel,
} from "./courses";
import { CONTENT_UPDATED_ISO } from "./seo";

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
  // The sector belongs on the street line: schema.org's addressRegion is a
  // first-level division, and in Romania that is the municipality itself.
  streetAddress: `${location.street}, ${location.district}`,
  addressLocality: location.city,
  addressRegion: location.region,
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
  alternateName: SCHOOL_ALTERNATE_NAMES,
  url: `${trimSlash(site)}/`,
  logo: `${trimSlash(site)}/android-chrome-512x512.png`,
  image: `${trimSlash(site)}/images/og-default.jpg`,
  description:
    "Școală de informatică pentru copii din București, cu cursuri de la clasa 0 până la " +
    "pregătirea pentru Bacalaureat și olimpiade, în grupe mici, la două locații.",
  // What the school is about, in the words the course pages already use. An
  // assistant deciding whether this is a place for "Scratch pentru copii"
  // reads this line before it reads six course descriptions.
  knowsAbout: SUBJECTS_COVERED,
  knowsLanguage: "ro",
  telephone: SCHOOL_PHONE_E164,
  email: SCHOOL_EMAIL,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    telephone: SCHOOL_PHONE_E164,
    email: SCHOOL_EMAIL,
    availableLanguage: "ro",
    areaServed: "RO",
  },
  priceRange: `${PRICE_ONE_CHILD}–${PRICE_TWO_CHILDREN} RON`,
  currenciesAccepted: "RON",
  address: postalAddress(SCHOOL_LOCATIONS[0]!),
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
  priceRange: `${PRICE_ONE_CHILD}–${PRICE_TWO_CHILDREN} RON`,
  image: `${trimSlash(site)}${location.image}`,
});

/**
 * The nodes every page carries. The organization references both addresses, so
 * both address nodes have to travel with it — a @id pointing at a node that is
 * not in the document is a dangling reference, and a parser drops the link.
 */
export const schoolGraph = (site: string): Node[] => [
  organizationNode(site),
  websiteNode(site),
  ...SCHOOL_LOCATIONS.map((location) => locationNode(site, location)),
];

export const websiteNode = (site: string): Node => ({
  "@type": "WebSite",
  "@id": ids.website(site),
  url: `${trimSlash(site)}/`,
  name: SCHOOL_NAME,
  // This is the node the site name in a result comes from, and alternateName
  // is where it takes the short form.
  alternateName: SCHOOL_ALTERNATE_NAMES,
  inLanguage: "ro-RO",
  publisher: { "@id": ids.organization(site) },
});

export const webPageNode = (
  site: string,
  page: { path: string; title: string; description: string },
  /** A location page is about that address, not only about the school. */
  about?: string
): Node => ({
  "@type": "WebPage",
  "@id": ids.page(site, page.path),
  url: `${trimSlash(site)}${page.path}`,
  name: page.title,
  description: page.description,
  isPartOf: { "@id": ids.website(site) },
  about: { "@id": about ?? ids.organization(site) },
  inLanguage: "ro-RO",
  // The one signal that lets a reader — human or machine — tell this page from
  // an older copy of the same facts still sitting in an index or a directory.
  dateModified: CONTENT_UPDATED_ISO,
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
  // suggestedMinAge/MaxAge live on PeopleAudience; EducationalAudience does not
  // carry them, and a property outside its domain is discarded.
  audience: {
    "@type": "PeopleAudience",
    suggestedMinAge: course.minAge,
    suggestedMaxAge: course.maxAge,
  },
  offers: {
    "@type": "Offer",
    // "Subscription" is one of the four values Google reads here; the Romanian
    // label it used to carry was simply dropped.
    category: "Subscription",
    availability: "https://schema.org/InStock",
    url: `${trimSlash(site)}/cursuri`,
    price: PRICE_ONE_CHILD,
    priceCurrency: "RON",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: PRICE_ONE_CHILD,
      priceCurrency: "RON",
      unitText: "lună",
      referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
    },
  },
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Onsite",
    // One 1.5-hour session a week, for the 6 weeks at the floor of the 6–8
    // week range. courseWorkload is the total; the schedule is the rhythm.
    courseWorkload: isoDuration(SESSION_HOURS * MODULE_WEEKS_MIN),
    courseSchedule: {
      "@type": "Schedule",
      repeatFrequency: "P1W",
      repeatCount: MODULE_WEEKS_MIN,
      duration: isoDuration(SESSION_HOURS),
    },
    inLanguage: "ro-RO",
    // No `location`: every level exists at the school, but which of them runs
    // at which address in a given module is set at enrolment, and the pages
    // say exactly that. Naming both addresses would assert twelve concurrent
    // groups. The two addresses are in the graph as their own nodes.
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

/**
 * Folded into the page node rather than emitted beside it: FAQPage is a
 * subclass of WebPage, so a separate node would describe the same URL twice
 * with two competing entities.
 */
export const withFaq = (page: Node, questions: { question: string; answer: string }[]): Node => ({
  ...page,
  "@type": ["WebPage", "FAQPage"],
  mainEntity: questions.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: { "@type": "Answer", text: entry.answer },
  })),
});

/**
 * The picture that stands for the page — on a location page, that room and not
 * the other one. Without it a search engine chooses, and the first image in the
 * document is not always the one that answers "what does this place look like".
 */
export const withImage = (page: Node, site: string, path: string, caption: string): Node => ({
  ...page,
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: `${trimSlash(site)}${path}`,
    caption,
  },
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
