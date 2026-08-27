import { useHead } from "#imports";

/**
 * One JSON-LD block per page, as a single @graph rather than a pile of
 * disconnected scripts — nodes reference each other by @id, which is what lets
 * a search engine read "this page is about this school at this address".
 */
export const useJsonLd = (nodes: Record<string, unknown>[]) => {
  const graph = { "@context": "https://schema.org", "@graph": nodes };

  useHead({
    script: [
      {
        type: "application/ld+json",
        // A "<" inside a string would end the script element early.
        innerHTML: JSON.stringify(graph).replace(/</g, "\\u003c"),
      },
    ],
  });
};
