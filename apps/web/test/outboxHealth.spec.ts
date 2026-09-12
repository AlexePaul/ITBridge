import { describe, expect, it } from "vitest";
import {
  notDeliveredNote,
  notDeliveredTotal,
  type OutboxHealth,
} from "../app/composables/useOutboxHealth";

/**
 * The „Mesaje nelivrate" tile — E17/S5.
 *
 * The defect this replaces was a tile that counted one of three failures and called the answer
 * „nelivrate". Both functions here exist so that the number and the sentence under it can be
 * driven, rather than read.
 */
const health = (over: Partial<OutboxHealth> = {}): OutboxHealth => ({
  failed: 0,
  undeliverable: 0,
  stuck: 0,
  stuckAfterMinutes: 15,
  ...over,
});

describe("notDeliveredTotal", () => {
  it("adds all three, because they answer one question", () => {
    expect(notDeliveredTotal(health({ failed: 2, undeliverable: 3, stuck: 4 }))).toBe(9);
  });

  it("is zero only when all three are", () => {
    expect(notDeliveredTotal(health())).toBe(0);
  });

  it.each([
    ["failed", { failed: 1 }],
    ["undeliverable", { undeliverable: 1 }],
    ["stuck", { stuck: 1 }],
  ])("never reads zero while %s has one", (_name, over) => {
    // The bug, stated as a property: a tile that could still say zero with a dead queue behind it
    // would be the same defect with more arithmetic in front of it.
    expect(notDeliveredTotal(health(over))).toBe(1);
  });

  it("does not mistake the threshold for a message", () => {
    expect(notDeliveredTotal(health({ stuckAfterMinutes: 999 }))).toBe(0);
  });
});

describe("notDeliveredNote", () => {
  it("says nothing when nothing is wrong", () => {
    expect(notDeliveredNote(health())).toBeUndefined();
  });

  it("counts the noun for one family", () => {
    expect(notDeliveredNote(health({ undeliverable: 1 }))).toBe("o familie neanunțată");
  });

  it("counts the noun for several", () => {
    expect(notDeliveredNote(health({ failed: 2 }))).toBe("familii neanunțate");
  });

  it("adds the two family failures together before choosing the noun", () => {
    expect(notDeliveredNote(health({ failed: 1, undeliverable: 1 }))).toBe("familii neanunțate");
  });

  it("gives the line to the queue when the queue is stuck", () => {
    expect(notDeliveredNote(health({ stuck: 3 }))).toBe("coada nu s-a mișcat de 15 de minute");
  });

  it("still gives the line to the queue when families are failing behind it", () => {
    // The rule with the judgement in it. A stuck queue means nothing is being sent at all, so the
    // failed messages behind it are a symptom; sending an admin to check families would send them
    // looking for a family that does not exist.
    expect(notDeliveredNote(health({ failed: 5, undeliverable: 2, stuck: 1 }))).toBe(
      "coada nu s-a mișcat de 15 de minute"
    );
  });

  it("names the server's threshold rather than one of its own", () => {
    expect(notDeliveredNote(health({ stuck: 1, stuckAfterMinutes: 30 }))).toContain("30");
  });
});
