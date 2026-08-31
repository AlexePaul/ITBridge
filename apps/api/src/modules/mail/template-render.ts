/**
 * The interpolation of E17/S2, kept deliberately small: `{{name}}` and nothing else.
 *
 * No conditionals, no loops — a template an admin edits in a textarea must not have a programming
 * language in it. A message that needs a list (the unmarked-attendance reminder, the project
 * delivery) precomputes the list into one variable before rendering.
 *
 * An unknown placeholder stays visible in the output instead of throwing or vanishing: the preview
 * screen is where a typo'd `{{variabla}}` gets caught, and it can only be caught if it can be seen.
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export interface TemplateFields {
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
}

function interpolate(text: string, data: Record<string, string>, escape: (value: string) => string): string {
    return text.replace(PLACEHOLDER, (whole, name: string) => (name in data ? escape(data[name]) : whole));
}

/** What `&` and friends must become before a value lands inside HTML somebody else wrote. */
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders one template with one set of values. Values are escaped in the HTML variant and left
 * alone in the text one — a parent named O'Brien&Co is a name, not markup.
 */
export function renderTemplate(fields: TemplateFields, data: Record<string, string>): TemplateFields {
    return {
        subject: interpolate(fields.subject, data, (value) => value),
        bodyText: interpolate(fields.bodyText, data, (value) => value),
        bodyHtml: fields.bodyHtml === null ? null : interpolate(fields.bodyHtml, data, escapeHtml),
    };
}
