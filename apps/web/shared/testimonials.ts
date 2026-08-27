export interface Testimonial {
  quote: string;
  /** How the parent is credited. No names — these are children's parents. */
  source: string;
}

/**
 * Real messages from parents, published with their consent.
 *
 * Deliberately not marked up as schema.org Review or AggregateRating: reviews a
 * business collects on its own site are self-serving, Google does not show rich
 * results for them, and marking them up anyway is the kind of thing that earns
 * a manual action. They are here to be read by a parent, and quoted by an
 * assistant, as plain text.
 */
export const TESTIMONIALS = {
  /** The home page pull-quote. */
  home: {
    quote:
      "Cel mai mult mă bucură faptul că a început să vadă calculatorul altfel. Nu îl mai percepe " +
      "doar ca pe un mijloc de distracție, ci ca pe un instrument cu ajutorul căruia poate crea, " +
      "experimenta și învăța. Vine de la cursuri entuziasmat și abia așteaptă să ne arate ce a făcut.",
    source: "Mama unei eleve din clasa a IV-a",
  },
  /** On the courses page, where a parent is deciding: one small child, one result. */
  courses: [
    {
      quote:
        "De când a început cursurile de IT, am observat că fiul meu este mult mai curios și mai " +
        "dornic să descopere lucruri noi. Îmi place foarte mult că la fiecare întâlnire învață " +
        "ceva practic, dar și că se distrează. Se vede că profesorii au răbdare și știu să " +
        "lucreze cu cei mici.",
      source: "Mama lui Andrei, elev în clasa a III-a",
    },
    {
      quote:
        "Când ne-a spus nota de la Informatică, am știut că toată munca a meritat. A obținut 9,80 " +
        "la Bacalaureat, iar noi, ca părinți, nu puteam fi mai mândri. Mulțumim pentru răbdare, " +
        "explicații și pentru că l-ați ajutat să aibă încredere în el!",
      source: "Mama unui absolvent de clasa a XII-a",
    },
  ] satisfies Testimonial[],
  /** On the about page, under the two teachers it is about. */
  about: {
    quote:
      "Suntem extrem de mulțumiți de rezultatul obținut la Bacalaureat. A luat o notă foarte mare " +
      "la Informatică, iar pentru noi a fost dovada că toată munca și pregătirea din timpul " +
      "anului au dat rezultate. Ne bucurăm enorm că am ales să continue pregătirea alături de voi.",
    source: "Mama unui absolvent de clasa a XII-a",
  },
} satisfies Record<string, Testimonial | Testimonial[]>;
