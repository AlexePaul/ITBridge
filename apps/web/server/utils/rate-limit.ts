/**
 * A fixed-window counter, per key, in the instance's own memory.
 *
 * Be honest about what this is worth on Vercel: every serverless instance gets
 * its own Map, and a burst spread across instances is counted several times
 * over rather than once. It is not a defence against a distributed flood — that
 * needs shared state we do not have without a backend.
 *
 * What it does buy, and the reason it is here: one script hammering the contact
 * route usually lands on a warm instance, and that is the case that would
 * otherwise turn into thousands of emails and a burned Resend quota. The
 * honeypot catches the crawlers; this catches the loop.
 */

interface Window {
  count: number;
  /** Epoch ms at which the window resets. */
  expiresAt: number;
}

const windows = new Map<string, Window>();

/** Bounds the Map when a lot of distinct keys pass through one warm instance. */
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds until the window resets — what a Retry-After header wants. */
  retryAfter: number;
}

export const rateLimit = (
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult => {
  const existing = windows.get(key);

  if (!existing || existing.expiresAt <= now) {
    // Expired entries are only noticed when their own key is asked for again, so
    // sweep on growth as well, otherwise a instance that sees many keys never
    // gives the memory back.
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [trackedKey, window] of windows) {
        if (window.expiresAt <= now) windows.delete(trackedKey);
      }
      // Still full: every window is live, so drop the map rather than grow
      // without bound. Costs one over-permissive window, which beats a leak.
      if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    }

    windows.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.expiresAt - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
};

/** Test seam — the Map outlives a single test otherwise. */
export const resetRateLimits = () => windows.clear();
