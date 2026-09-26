import { validateHeaderValue } from 'http';
import { attachmentDisposition } from './s3.service';

/**
 * The name a download is saved under. "Descarcă tot" answered 500 for every child whose name has a
 * Romanian letter in it — Node will not write a header character above U+00FF — while Andrei's
 * worked (review of 25 September 2026).
 */
describe('attachmentDisposition', () => {
    it.each(['proiecte-ștefan.zip', 'proiecte-mălina.zip', 'proiecte-ionuț.zip', 'proiecte-răzvan.zip', 'Desen cu „ghilimele".png', 'robot 🤖.sb3'])(
        'is a header Node can write, for %s',
        (name) => {
            expect(() => validateHeaderValue('Content-Disposition', attachmentDisposition(name))).not.toThrow();
        },
    );

    it('carries the name as the family wrote it, for every browser since 2011', () => {
        expect(attachmentDisposition('proiecte-ștefan.zip')).toContain("filename*=UTF-8''proiecte-%C8%99tefan.zip");
    });

    it('falls back to the letters without their marks, not to question marks', () => {
        expect(attachmentDisposition('proiecte-ștefan.zip')).toContain('filename="proiecte-stefan.zip"');
        expect(attachmentDisposition('Mălina Țîru.png')).toContain('filename="Malina Tiru.png"');
    });

    it('still keeps a quote or a line break from ending the parameter early', () => {
        const header = attachmentDisposition('a"b\r\nSet-Cookie: x=1.png');

        expect(header.startsWith('attachment; filename="abSet-Cookie: x=1.png"; ')).toBe(true);
        expect(header).not.toMatch(/[\r\n]/);
    });

    it('leaves a plain name as it was', () => {
        expect(attachmentDisposition('proiecte-andrei.zip')).toBe(`attachment; filename="proiecte-andrei.zip"; filename*=UTF-8''proiecte-andrei.zip`);
    });
});
