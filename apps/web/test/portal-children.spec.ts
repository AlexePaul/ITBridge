import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkChildForm } from "~/composables/useChildForm";

/**
 * A family adds and corrects its children from Profil — terms §5 and §6, privacy notice §8.
 *
 * The rules are the server's (`CreateChildDto`, `ChildService`); what is tested here is that the
 * portal asks the same questions in the same words before it sends anything, and that the page
 * offers removal only where the server would allow it.
 */
const PROFILE = readFileSync(new URL("../app/pages/user/profile.vue", import.meta.url), "utf8");
const FORM = readFileSync(
  new URL("../app/components/PortalChildForm.vue", import.meta.url),
  "utf8"
);
const DASHBOARD = readFileSync(new URL("../app/pages/user/dashboard.vue", import.meta.url), "utf8");

describe("the child form's checks", () => {
  const today = "2026-09-26";

  it("takes the three fields terms §5 names, with the names trimmed", () => {
    const { errors, data } = checkChildForm(
      { firstName: "  Maria ", lastName: "Pop-Ionescu ", birthDate: "2016-04-02" },
      today
    );

    expect(errors).toEqual({});
    // As typed, apart from the spaces: the office's capitalising helper would write „Pop-ionescu".
    expect(data).toEqual({ firstName: "Maria", lastName: "Pop-Ionescu", birthDate: "2016-04-02" });
  });

  it("refuses a name of spaces and a name longer than the column, under the field", () => {
    const { errors, data } = checkChildForm(
      { firstName: "   ", lastName: "P".repeat(101), birthDate: "2016-04-02" },
      today
    );

    expect(data).toBeNull();
    expect(errors.firstName).toBe("Scrie prenumele copilului");
    expect(errors.lastName).toContain("cel mult 100 de caractere");
  });

  it("asks for a birth date, and refuses one after today while taking today itself", () => {
    expect(
      checkChildForm({ firstName: "Maria", lastName: "Pop", birthDate: "" }, today).errors.birthDate
    ).toBe("Alege data nașterii");
    expect(
      checkChildForm({ firstName: "Maria", lastName: "Pop", birthDate: "2026-09-27" }, today).errors
        .birthDate
    ).toBe("Data nașterii nu poate fi după ziua de azi");
    expect(
      checkChildForm({ firstName: "Maria", lastName: "Pop", birthDate: today }, today).data
    ).not.toBeNull();
  });
});

describe("Profil: the children block", () => {
  it("adds a child and corrects one with the same form", () => {
    expect(PROFILE).toMatch(/<PortalChildForm\s+v-if="editingChildId === child\.id"/);
    expect(PROFILE).toMatch(/<PortalChildForm\s+v-if="addingChild"/);
    expect(PROFILE).toContain("Adaugă un copil");
  });

  /** Only the school withdraws a child (terms §5); the server refuses the rest with CHILD_HAS_ENROLMENTS. */
  it("offers removal only for a child the school has placed nowhere, and asks twice", () => {
    expect(PROFILE).toMatch(/v-if="!child\.group"[\s\S]{0,800}onRemoveChild\(child\.id/);
    expect(PROFILE).toContain('"Sigur? Apasă din nou"');
    expect(PROFILE).toMatch(/if \(confirmingRemovalOf\.value !== childId\) \{/);
  });

  /** A row of identical „Corectează" buttons is a list of identical entries (E18/S6). */
  it("names the child in every control that acts on one", () => {
    expect(PROFILE).toContain("`Corectează datele: ${child.firstName} ${child.lastName}`");
    expect(PROFILE).toContain("`Șterge din cont: ${child.firstName} ${child.lastName}`");
  });

  it("reads the list and the consent switches again after a change", () => {
    expect(PROFILE).toMatch(
      /const refreshChildren = async \(\) => \{\s*await Promise\.all\(\[loadProfile\(\), loadConsents\(\)\]\);/
    );
  });

  it("says that adding a child is not enrolling it", () => {
    expect(PROFILE).toContain("Adăugarea nu înscrie copilul într-o grupă");
  });

  it("sends a family with no child on the account to Profil", () => {
    expect(DASHBOARD).toMatch(/<NuxtLink to="\/user\/profile" class="link">Profil<\/NuxtLink>/);
  });
});

describe("the child form", () => {
  it("answers in its own words, not the browser's", () => {
    expect(FORM).toContain('novalidate @submit.prevent="onSubmit"');
    expect(FORM).toContain(':max="today"');
  });

  it("keeps the names as the family typed them", () => {
    expect(FORM).not.toContain("normalizeName");
  });

  it("shows the server's refusal as it wrote it", () => {
    expect(FORM).toContain("apiErrorMessage(err)");
  });
});
