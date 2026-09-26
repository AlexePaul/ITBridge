import { describe, expect, it } from "vitest";
import { stillSelectable } from "~/composables/useProjectSelection";

/**
 * The group documents screen's selection, after the list is read again — E14/S4.
 *
 * A document ticked and then deleted stayed ticked: the button counted it and the whole send failed
 * on its id (review of 25 September 2026).
 */
describe("stillSelectable", () => {
  it("drops a ticked document that is no longer on the list", () => {
    const projects = [
      { id: 1, status: "new" },
      { id: 3, status: "new" },
    ];

    expect([...stillSelectable(new Set([1, 2, 3]), projects)]).toEqual([1, 3]);
  });

  it("drops one that was sent meanwhile, which this button cannot send again", () => {
    const projects = [
      { id: 1, status: "sent" },
      { id: 2, status: "new" },
    ];

    expect([...stillSelectable(new Set([1, 2]), projects)]).toEqual([2]);
  });

  it("keeps what is still waiting, and adds nothing the person did not tick", () => {
    const projects = [
      { id: 1, status: "new" },
      { id: 2, status: "new" },
    ];

    expect([...stillSelectable(new Set([2]), projects)]).toEqual([2]);
  });
});
