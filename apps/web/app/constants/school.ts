export interface SchoolLocation {
  name: string;
  address: string;
  city: string;
  /** Google Maps embed URL, or null while the address is still being confirmed. */
  mapEmbedUrl: string | null;
}

export const SCHOOL_PHONE = "+40 732 273 347";
export const SCHOOL_PHONE_HREF = "tel:+40732273347";
export const SCHOOL_EMAIL = "office@itbridgeschool.com";

export const SCHOOL_HOURS = ["Luni–vineri: 9:00–18:00", "Sâmbătă: 10:00–14:00", "Duminică: închis"];

export const SCHOOL_SOCIAL = {
  instagram: "https://www.instagram.com/itbridgeschool",
  facebook: "https://www.facebook.com/share/19z5TxEu7F/",
  tiktok: "https://www.tiktok.com/@itbridgeschool",
};

export const SCHOOL_LOCATIONS: SchoolLocation[] = [
  {
    name: "Locația 1 — Valea Oltului",
    address: "Strada Valea Oltului 73",
    city: "București, România",
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d5699.683885857019!2d26.013984!3d44.415889!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40b20041575f3945%3A0xfb045a6b8c5a127!2sStrada%20Valea%20Oltului%2073%2C%20Bucure%C8%99ti%2C%20Romania!5e0!3m2!1sen!2sus!4v1768175036715!5m2!1sen!2sus",
  },
  {
    name: "Locația 2 — Șoseaua București–Târgoviște",
    address: "Șoseaua București–Târgoviște 19A",
    city: "Sector 1, București",
    mapEmbedUrl:
      "https://maps.google.com/maps?q=Soseaua%20Bucuresti-Targoviste%2019A%2C%20Bucuresti&z=16&hl=ro&output=embed",
  },
];
