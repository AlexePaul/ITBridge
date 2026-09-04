import { describe, expect, it } from "vitest";
import {
  SCHOOL_ALTERNATE_NAMES,
  SCHOOL_EMAIL,
  SCHOOL_LOCATIONS,
  SCHOOL_PHONE_E164,
} from "../shared/school";
import { SUBJECTS_COVERED } from "../shared/courses";
import { pageSeo } from "../shared/seo";
import {
  courseListNode,
  ids,
  organizationNode,
  schoolGraph,
  webPageNode,
  websiteNode,
  withFaq,
  withImage,
} from "../shared/structured-data";

const site = "https://itbridgeschool.com";

/** Every `{ "@id": … }` reference anywhere inside a node, however deep. */
const references = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((entry) => references(entry, found));
  else if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    // A node with only an @id is a pointer; one with more is a definition.
    if (typeof node["@id"] === "string" && Object.keys(node).length === 1) found.push(node["@id"]);
    Object.values(node).forEach((entry) => references(entry, found));
  }
  return found;
};

describe("schoolGraph", () => {
  const graph = schoolGraph(site);

  it("resolves every @id it references, so no link is silently dropped", () => {
    const defined = new Set(graph.map((node) => node["@id"]));
    for (const ref of references(graph)) expect(defined).toContain(ref);
  });

  it("carries one node per address, and the organization points at each", () => {
    const organization = graph.find((node) => node["@id"] === ids.organization(site))!;
    const pointed = (organization.location as { "@id": string }[]).map((entry) => entry["@id"]);
    expect(pointed).toEqual(SCHOOL_LOCATIONS.map((location) => ids.location(site, location.slug)));
  });
});

describe("organizationNode", () => {
  const organization = organizationNode(site);

  it("declares the names parents actually search, on the site node as well", () => {
    expect(organization.alternateName).toEqual(SCHOOL_ALTERNATE_NAMES);
    expect(websiteNode(site).alternateName).toEqual(SCHOOL_ALTERNATE_NAMES);
  });

  it("knows about exactly the subjects the courses teach, each once", () => {
    expect(organization.knowsAbout).toBe(SUBJECTS_COVERED);
    expect(new Set(SUBJECTS_COVERED).size).toBe(SUBJECTS_COVERED.length);
    expect(SUBJECTS_COVERED).toContain("Scratch");
    expect(SUBJECTS_COVERED).toContain("C++");
  });

  it("has a contact point carrying the same phone and email as the node itself", () => {
    const contact = organization.contactPoint as Record<string, unknown>;
    expect(contact["@type"]).toBe("ContactPoint");
    expect(contact.telephone).toBe(SCHOOL_PHONE_E164);
    expect(contact.email).toBe(SCHOOL_EMAIL);
    expect(organization.telephone).toBe(SCHOOL_PHONE_E164);
  });
});

describe("page decorators", () => {
  const location = SCHOOL_LOCATIONS[1]!;
  const page = webPageNode(
    site,
    pageSeo(`/locatii/${location.slug}`),
    ids.location(site, location.slug)
  );

  it("withImage names the room in an absolute URL, whatever the site carries", () => {
    const withSlash = withImage(page, `${site}/`, location.image, location.imageAlt);
    const image = withSlash.primaryImageOfPage as Record<string, unknown>;
    expect(image.url).toBe(`${site}${location.image}`);
    expect(image.caption).toBe(location.imageAlt);
  });

  it("withImage composes over withFaq without losing the FAQPage type", () => {
    const decorated = withImage(
      withFaq(page, [{ question: "?", answer: "!" }]),
      site,
      location.image,
      ""
    );
    expect(decorated["@type"]).toEqual(["WebPage", "FAQPage"]);
    expect(decorated.mainEntity).toHaveLength(1);
    expect(decorated.primaryImageOfPage).toBeDefined();
  });

  it("withFaq strips the word joiner a heading needs, so the graph carries plain C++", () => {
    const decorated = withFaq(page, [
      { question: "Direct cu C\u2060+\u2060+?", answer: "Da, C\u2060+\u2060+ de la început." },
    ]);
    const [entry] = decorated.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(entry!.name).toBe("Direct cu C++?");
    expect(entry!.acceptedAnswer.text).toBe("Da, C++ de la început.");
  });

  it("courseListNode gives every course a distinct URL on this site", () => {
    const list = courseListNode(site);
    const urls = (list.itemListElement as { url: string }[]).map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith(`${site}/cursuri#`)).toBe(true);
  });
});
