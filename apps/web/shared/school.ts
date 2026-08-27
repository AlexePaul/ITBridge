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
  /** How the area is named in titles — sometimes wider than the neighbourhood. */
  searchName: string;
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
}

export const SCHOOL_NAME = "IT Bridge School";
export const SCHOOL_LEGAL_NAME = "IT Bridge School";
export const SCHOOL_PHONE = "+40 732 273 347";
export const SCHOOL_PHONE_E164 = "+40732273347";
export const SCHOOL_PHONE_HREF = `tel:${SCHOOL_PHONE_E164}`;
export const SCHOOL_EMAIL = "office@itbridgeschool.com";

export const SCHOOL_SOCIAL = {
  instagram: "https://www.instagram.com/itbridgeschool",
  facebook: "https://www.facebook.com/share/19z5TxEu7F/",
  tiktok: "https://www.tiktok.com/@itbridgeschool",
};

export const SCHOOL_OPENING_HOURS: OpeningHours[] = [
  {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "18:00",
    label: "Luni–vineri: 9:00–18:00",
  },
  { days: ["Saturday"], opens: "10:00", closes: "14:00", label: "Sâmbătă: 10:00–14:00" },
  { days: ["Sunday"], opens: null, closes: null, label: "Duminică: închis" },
];

/** Kept for the pages that only print the hours. */
export const SCHOOL_HOURS = SCHOOL_OPENING_HOURS.map((entry) => entry.label);

export const SCHOOL_LOCATIONS: SchoolLocation[] = [
  {
    slug: "drumul-taberei",
    name: "Drumul Taberei",
    neighbourhood: "Drumul Taberei",
    searchName: "Drumul Taberei",
    street: "Strada Valea Oltului 73",
    district: "Sector 6",
    postalCode: "061971",
    city: "București",
    region: "București",
    country: "RO",
    geo: { latitude: 44.415847, longitude: 26.013556 },
    areaServed: ["Drumul Taberei", "Militari", "Ghencea", "Răzoare", "Sector 6"],
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d5699.683885857019!2d26.013984!3d44.415889!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40b20041575f3945%3A0xfb045a6b8c5a127!2sStrada%20Valea%20Oltului%2073%2C%20Bucure%C8%99ti%2C%20Romania!5e0!3m2!1sen!2sus!4v1768175036715!5m2!1sen!2sus",
    mapLink:
      "https://www.google.com/maps/search/?api=1&query=Strada+Valea+Oltului+73%2C+Bucure%C8%99ti",
  },
  {
    slug: "straulesti",
    name: "Străulești",
    neighbourhood: "Străulești",
    searchName: "Străulești și Bucureștii Noi",
    street: "Șoseaua București–Târgoviște 19A",
    district: "Sector 1",
    postalCode: "013534",
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
  },
];

export const findLocation = (slug: string) =>
  SCHOOL_LOCATIONS.find((location) => location.slug === slug);

/** "Strada Valea Oltului 73, Sector 6, București" */
export const formatAddress = (location: SchoolLocation) =>
  `${location.street}, ${location.district}, ${location.city}`;
