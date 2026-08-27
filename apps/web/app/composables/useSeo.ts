import { useHead, useRuntimeConfig, useSeoMeta } from "#imports";

export interface SeoInput {
  /** The full <title>, brand included. Kept whole so each page reads as a sentence. */
  title: string;
  description: string;
  /** Path with a leading slash, no domain — the canonical is built from it. */
  path: string;
  /** Absolute-from-root path to the sharing image. */
  image?: string;
  imageAlt?: string;
  /** Pages that exist for the reader but have nothing to offer a search engine. */
  noindex?: boolean;
}

const SITE_NAME = "IT Bridge School";
// A 1200x630 card, so a WhatsApp or Facebook preview is not a letterboxed portrait.
const DEFAULT_IMAGE = "/images/og-default.jpg";

/**
 * One place where a page says what it is: title, description, canonical, and
 * the cards Facebook, WhatsApp and X read. The layout deliberately sets no
 * title of its own, so this is the only writer.
 */
export const useSeo = (input: SeoInput) => {
  const siteUrl = useRuntimeConfig().public.siteUrl as string;
  const base = siteUrl.replace(/\/$/, "");
  const canonical = `${base}${input.path}`;
  const image = `${base}${input.image ?? DEFAULT_IMAGE}`;

  useSeoMeta({
    title: input.title,
    description: input.description,
    ogTitle: input.title,
    ogDescription: input.description,
    ogType: "website",
    ogUrl: canonical,
    ogSiteName: SITE_NAME,
    ogLocale: "ro_RO",
    ogImage: image,
    ogImageAlt: input.imageAlt ?? SITE_NAME,
    twitterCard: "summary_large_image",
    twitterTitle: input.title,
    twitterDescription: input.description,
    twitterImage: image,
    robots: input.noindex ? "noindex, follow" : "index, follow, max-image-preview:large",
  });

  useHead({
    titleTemplate: null,
    link: [{ rel: "canonical", href: canonical }],
  });
};
