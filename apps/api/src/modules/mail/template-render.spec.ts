import { escapeHtml, renderTemplate } from './template-render';

describe('renderTemplate', () => {
    const fields = { subject: 'Cont nou: {{name}}', bodyText: 'Bună, {{name}}!\n{{url}}', bodyHtml: '<p>Bună, {{name}}!</p>' };

    it('replaces every placeholder, in all three fields', () => {
        const rendered = renderTemplate(fields, { name: 'Ana', url: 'https://x' });

        expect(rendered.subject).toBe('Cont nou: Ana');
        expect(rendered.bodyText).toBe('Bună, Ana!\nhttps://x');
        expect(rendered.bodyHtml).toBe('<p>Bună, Ana!</p>');
    });

    it('tolerates whitespace inside the braces — admins type {{ name }} too', () => {
        expect(renderTemplate({ subject: '{{ name }}', bodyText: '', bodyHtml: null }, { name: 'Ana' }).subject).toBe('Ana');
    });

    it('leaves an unknown placeholder visible, so the preview can catch the typo', () => {
        expect(renderTemplate({ subject: '{{nmae}}', bodyText: '', bodyHtml: null }, { name: 'Ana' }).subject).toBe('{{nmae}}');
    });

    it('escapes values in the HTML variant and not in the text one', () => {
        const rendered = renderTemplate({ subject: '', bodyText: '{{who}}', bodyHtml: '{{who}}' }, { who: "O'Brien & <Co>" });

        // A parent named after a tag is a name, not markup.
        expect(rendered.bodyText).toBe("O'Brien & <Co>");
        expect(rendered.bodyHtml).toBe("O'Brien &amp; &lt;Co&gt;");
    });

    it('keeps a null HTML body null — text-only stays text-only', () => {
        expect(renderTemplate({ subject: '', bodyText: '', bodyHtml: null }, {}).bodyHtml).toBeNull();
    });
});

describe('escapeHtml', () => {
    it('covers the four characters that matter', () => {
        expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    });
});
