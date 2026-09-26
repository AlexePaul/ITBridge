import type { ActiveSession } from "~/types/auth.types";

/**
 * How the portal names an open session — terms §4.5: „Portalul reține tipul de browser al fiecărei
 * sesiuni deschise, ca să-l poți recunoaște în listă și să-l închizi dacă nu e al tău."
 *
 * The server keeps the browser's own description, trimmed; a family recognises „Chrome pe Android"
 * where it would not recognise the string behind it. Order matters: Edge and Opera say „Chrome" too,
 * and Chrome says „Safari".
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispozitiv necunoscut";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser necunoscut";

  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iPhone sau iPad"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "Mac"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  return system ? `${browser} pe ${system}` : browser;
}

/** This browser's session first, then the others by when their token was issued, newest first. */
export function orderSessions(sessions: readonly ActiveSession[]): ActiveSession[] {
  return [...sessions].sort(
    (a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt)
  );
}
