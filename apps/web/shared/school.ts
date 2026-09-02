/**
 * The school's facts, in one place. The public pages, the structured data, the
 * sitemap and llms.txt all read from here — a phone number or an address that
 * disagrees with itself across a site is one of the most common reasons local
 * search ranks a business badly.
 */

export interface OpeningHours {
  /** schema.org day names, e.g. ["Monday", "Tuesday"]. */
  days: string[];
  /** 24h "HH:MM", or null when closed. */
  opens: string | null;
  closes: string | null;
  /** How it reads on the page. */
  label: string;
}

export interface SchoolLocation {
  slug: string;
  /** How the location is referred to in running text: "Drumul Taberei". */
  name: string;
  /** The neighbourhood a parent would search for. */
  neighbourhood: string;
  street: string;
  district: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  geo: { latitude: number; longitude: number };
  /** Neighbourhoods within a reasonable drive — used in copy and in areaServed. */
  areaServed: string[];
  mapEmbedUrl: string;
  mapLink: string;
  /** A photograph of this room, not of the other one. */
  image: string;
  imageAlt: string;
}

export const SCHOOL_NAME = "IT Bridge School";
/**
 * The other names the school goes by. Search Console shows parents typing
 * "it bridge" and "bridge school", and the social handles are `bridgeschool.*`.
 * An entity that declares its own nicknames is matched on them; one that does
 * not is matched on the dictionary words inside them — which is how a Romanian
 * school ended up ranking for "trade school" in English.
 */
export const SCHOOL_ALTERNATE_NAMES = ["IT Bridge", "Bridge School"];
export const SCHOOL_PHONE = "+40 732 273 347";
export const SCHOOL_PHONE_E164 = "+40732273347";
export const SCHOOL_PHONE_HREF = `tel:${SCHOOL_PHONE_E164}`;
export const SCHOOL_EMAIL = "office@itbridgeschool.com";

export const SCHOOL_SOCIAL = {
  instagram: "https://www.instagram.com/bridgeschool.cursurideit/",
  facebook: "https://www.facebook.com/profile.php?id=61583759176265",
  tiktok: "https://www.tiktok.com/@bridgeschool.it.cursuri",
};

export const SCHOOL_OPENING_HOURS: OpeningHours[] = [
  {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "20:00",
    label: "Luni–vineri: 9:00–20:00",
  },
  { days: ["Saturday"], opens: "09:00", closes: "16:00", label: "Sâmbătă: 9:00–16:00" },
  { days: ["Sunday"], opens: "09:00", closes: "12:00", label: "Duminică: 9:00–12:00" },
];

/** Kept for the pages that only print the hours. */
export const SCHOOL_HOURS = SCHOOL_OPENING_HOURS.map((entry) => entry.label);

export const SCHOOL_LOCATIONS: SchoolLocation[] = [
  {
    slug: "drumul-taberei",
    name: "Drumul Taberei",
    neighbourhood: "Drumul Taberei",
    street: "Strada Valea Oltului 73",
    district: "Sector 6",
    // Valea Oltului is split across three codes by street number — 061971 for
    // 1–55, 061972 for 57–75, 061973 for 77 upwards — so number 73 is 061972.
    // It read 061971 here and 061973 on the Google Business Profile, which is
    // the mismatch that matters: the postal code travels into the JSON-LD
    // PostalAddress, into llms.txt and onto all three location screens, and a
    // local listing is judged on whether those agree with the profile.
    postalCode: "061972",
    city: "București",
    region: "București",
    country: "RO",
    geo: { latitude: 44.415847, longitude: 26.013556 },
    areaServed: ["Drumul Taberei", "Militari", "Ghencea", "Răzoare", "Sector 6"],
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d5699.683885857019!2d26.013984!3d44.415889!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40b20041575f3945%3A0xfb045a6b8c5a127!2sStrada%20Valea%20Oltului%2073%2C%20Bucure%C8%99ti%2C%20Romania!5e0!3m2!1sen!2sus!4v1768175036715!5m2!1sen!2sus",
    mapLink:
      "https://www.google.com/maps/search/?api=1&query=Strada+Valea+Oltului+73%2C+Bucure%C8%99ti",
    image: "/images/clasa-02.jpg",
    imageAlt: "Sala de curs din Drumul Taberei, pe Strada Valea Oltului 73",
  },
  {
    slug: "straulesti",
    name: "Străulești",
    neighbourhood: "Străulești",
    street: "Șoseaua București-Târgoviște 19A",
    district: "Sector 1",
    postalCode: "013505",
    city: "București",
    region: "București",
    country: "RO",
    geo: { latitude: 44.510623, longitude: 26.020696 },
    areaServed: [
      "Străulești",
      "Bucureștii Noi",
      "Dămăroaia",
      "Băneasa",
      "Chitila",
      "Mogoșoaia",
      "Sector 1",
    ],
    mapEmbedUrl:
      "https://maps.google.com/maps?q=Soseaua%20Bucuresti-Targoviste%2019A%2C%20Bucuresti&z=16&hl=ro&output=embed",
    mapLink:
      "https://www.google.com/maps/search/?api=1&query=%C8%98oseaua+Bucure%C8%99ti-T%C3%A2rgovi%C8%99te+19A%2C+Bucure%C8%99ti",
    image: "/images/straulesti-01.jpg",
    imageAlt: "Sala de curs din Străulești, pe Șoseaua București-Târgoviște 19A",
  },
];

export const findLocation = (slug: string) =>
  SCHOOL_LOCATIONS.find((location) => location.slug === slug);

/** "Strada Valea Oltului 73, Sector 6, București" */
export const formatAddress = (location: SchoolLocation) =>
  `${location.street}, ${location.district}, ${location.city}`;
