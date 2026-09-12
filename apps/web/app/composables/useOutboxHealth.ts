import type { Overview } from "~/types/overview.types";

/**
 * The „Mesaje nelivrate" tile, kept away from the screen — E17/S5.
 *
 * Pure, like the report helpers in `useEarlySignals.ts`, and here for the same reason: both
 * functions below carry a judgement rather than a format, and a judgement inside a `.vue` is one
 * nothing can test.
 */

export type OutboxHealth = Overview["messagesNotDelivered"];

/**
 * How many families the school has not reached.
 *
 * All three added, and that is the whole fix. The tile counted `undeliverable` alone, so a message
 * the provider permanently refused read as zero, and a dispatcher that had stopped running read as
 * zero as well — its messages stay `pending`, which from the table looks exactly like a message
 * waiting out a backoff. A tile that can show zero while the queue is dead is worse than no tile,
 * because it is read as an answer.
 */
export function notDeliveredTotal(health: OutboxHealth): number {
  return health.failed + health.undeliverable + health.stuck;
}

/**
 * The one line under the number, and which of the three failures gets it.
 *
 * **The queue wins whenever it is stuck**, even with failed messages beside it, because the three
 * want different people. `failed` and `undeliverable` are rows an admin opens and acts on, one
 * family at a time. A stuck queue is nobody's message in particular — it means nothing is being
 * sent at all, so the failed ones behind it are a symptom rather than the work. Telling an admin to
 * „check the families" then sends them looking for a family that does not exist.
 *
 * The threshold comes from the server, never from here: the screen names the line, it does not
 * draw a second one.
 */
export function notDeliveredNote(health: OutboxHealth): string | undefined {
  if (health.stuck > 0) {
    return `coada nu s-a mișcat de ${health.stuckAfterMinutes} de minute`;
  }
  const families = health.failed + health.undeliverable;
  if (families === 0) return undefined;
  return families === 1 ? "o familie neanunțată" : "familii neanunțate";
}
