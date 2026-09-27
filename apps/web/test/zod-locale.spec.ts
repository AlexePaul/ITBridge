import { describe, expect, it } from "vitest";
import { z } from "zod";
import setZodLocale from "~/plugins/00.zod-locale";

/**
 * A schema that names no message falls back to zod's own words, and those have to be Romanian: the
 * office read "Invalid input" under an email field (QA of 27 September 2026).
 */
describe("zod's own messages", () => {
  it("are Romanian once the plugin has run", () => {
    (setZodLocale as unknown as () => void)();

    const email = z.string().email().safeParse("abc");
    const tooLong = z.string().max(3).safeParse("abcdef");

    expect(email.error?.issues[0]?.message).toBe("Format invalid: adresă de email");
    expect(tooLong.error?.issues[0]?.message).toMatch(/^Prea mare/);
  });
});
