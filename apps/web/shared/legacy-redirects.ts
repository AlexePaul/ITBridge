/**
 * Paths from the WordPress site that used to serve itbridgeschool.ro.
 *
 * That domain now redirects here permanently and keeps the path, so a link
 * saved years ago — from a directory, a Facebook post, a parent's bookmark —
 * arrives as `itbridgeschool.com/<old path>` and would land on a route this
 * app never had. The paths below were recovered from the Wayback Machine and
 * from the sample URLs Search Console still holds for the old property.
 *
 * `/politica-de-cookies` is deliberately absent: that page is genuinely gone,
 * and a 404 says so more honestly than a redirect to somewhere unrelated.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/cursuri-inscrieri": "/cursuri",
  "/lectii-online": "/cursuri",
};

/**
 * The map as Nitro route rules. Each path is registered twice: bare, and with
 * a wildcard, so `/lectii-online`, `/lectii-online/` and any deeper URL the old
 * site may have served all land on the same page.
 */
export const legacyRouteRules = () =>
  Object.fromEntries(
    Object.entries(LEGACY_REDIRECTS).flatMap(([from, to]) => {
      const rule = { redirect: { to, statusCode: 301 } };
      return [
        [from, rule],
        [`${from}/**`, rule],
      ];
    })
  );
