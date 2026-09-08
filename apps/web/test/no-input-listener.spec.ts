import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No `@input` on a Nuxt UI text field.
 *
 * The handler runs, which is what makes this worth a guard: it runs **before** `v-model` writes the
 * character just typed, so anything it reads off the model is one keystroke behind. Vue merges a
 * listener arriving through `$attrs` with the component's own into an array and calls them in that
 * order — ours first, `UInput`'s `onInput` (which updates the model) second.
 *
 * The one instance of this in the repo was the "add a child from another group" search on
 * `/admin/attendance/group/[groupId]`, and it read as the search being broken rather than delayed.
 * Measured against seed data: typing `a` matched nothing, because the handler filtered on the empty
 * string and cleared the list; `aa` returned eleven children, filtering on `a`; `aaa` returned
 * nothing again. Typing a whole name — the only thing anybody does here — always ended in an empty
 * list, one letter short.
 *
 * Derive from the model instead: a `computed` over `searchQuery` cannot be out of step with it. A
 * `watch` also works when a side effect is genuinely wanted. What does not work is reading the
 * model from a listener that fires before it changes.
 *
 * `@change` and `@blur` are not covered: those are declared emits on the component and are emitted
 * after the model is updated, so they see the current value.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

/** `<UInput … @input="…"` and its siblings, across the newlines an attribute list always has. */
const INPUT_LISTENER = /<U(?:Input|InputNumber|Textarea|InputMenu)\b[^>]*?@input\s*=/s;

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return entry.endsWith(".vue") ? [path] : [];
  });

describe("app sources", () => {
  it("never listens for @input on a Nuxt UI text field", () => {
    const offenders = vueFiles(APP_DIR)
      .filter((path) => INPUT_LISTENER.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(APP_DIR.length + 1));

    expect(offenders).toEqual([]);
  });

  // The guard is only worth having if it can see one, and a regex over source is exactly the kind
  // of check that passes because it matches nothing at all.
  it("would notice one", () => {
    expect(
      INPUT_LISTENER.test(
        ["<UInput", '  v-model="searchQuery"', '  @input="filterChildren"', "/>"].join("\n")
      )
    ).toBe(true);
    // The shapes it must not flag: no listener at all, and the events that fire after the model.
    expect(INPUT_LISTENER.test('<UInput v-model="q" placeholder="Caută" />')).toBe(false);
    expect(INPUT_LISTENER.test('<UInput v-model="q" @change="save" @blur="save" />')).toBe(false);
  });
});
