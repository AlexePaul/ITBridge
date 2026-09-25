import { TEMPLATE_DEFAULTS } from '../modules/mail/template-defaults';
import { SEEDED_TEMPLATE_EDITS } from './seed-templates';

/**
 * A seeded edit is the wording stage sends, so it has to be one a sender can fill.
 *
 * The renderer leaves an unknown placeholder visible on purpose — it is how the editor's preview
 * shows a typo — which means nothing downstream refuses one: a family simply reads `{{grupa}}`.
 * That is what the seed shipped until 25 September 2026, alongside an edit keyed on a message that
 * does not exist. Both are caught here, on the pull request, rather than in somebody's inbox.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

const placeholdersIn = (text: string | null): string[] => (text === null ? [] : [...text.matchAll(PLACEHOLDER)].map((match) => match[1]));

describe('the seeded template edits', () => {
    it.each(SEEDED_TEMPLATE_EDITS.map((edit) => [edit.key, edit] as const))('%s is a message some sender writes', (key) => {
        expect(TEMPLATE_DEFAULTS.map((definition) => definition.key)).toContain(key);
    });

    it.each(SEEDED_TEMPLATE_EDITS.map((edit) => [edit.key, edit] as const))('%s uses only the variables its sender fills', (key, edit) => {
        const declared = TEMPLATE_DEFAULTS.find((definition) => definition.key === key)?.variables.map((variable) => variable.name) ?? [];
        const used = [...placeholdersIn(edit.subject), ...placeholdersIn(edit.bodyText), ...placeholdersIn(edit.bodyHtml)];

        expect(used.length).toBeGreaterThan(0);
        expect(used.filter((name) => !declared.includes(name))).toEqual([]);
    });

    // The sweep has to see the defect it was written for, or it passes for the wrong reason.
    it('would notice the placeholders the seed used to carry', () => {
        const declared = TEMPLATE_DEFAULTS.find((definition) => definition.key === 'class-cancelled')?.variables.map((variable) => variable.name) ?? [];
        expect(placeholdersIn('Ora de {{grupa}} din {{data}}').filter((name) => !declared.includes(name))).toEqual(['grupa', 'data']);
    });
});
