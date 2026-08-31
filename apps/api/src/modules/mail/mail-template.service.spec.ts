import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MailTemplateService } from './mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('MailTemplateService', () => {
    let service: MailTemplateService;
    let repo: MockRepository;

    beforeEach(async () => {
        repo = createMockRepository();
        repo.find!.mockResolvedValue([]);
        repo.findOne!.mockResolvedValue(null);
        repo.create!.mockImplementation((row: unknown) => row);
        repo.save!.mockImplementation((row: unknown) => Promise.resolve(row));

        const module: TestingModule = await Test.createTestingModule({
            providers: [MailTemplateService, provideMockRepository(MailTemplate, repo)],
        }).compile();
        service = module.get(MailTemplateService);
    });

    describe('render', () => {
        it('renders the shipped default when the school has not edited', async () => {
            const mail = await service.render('email-confirmation', { firstName: 'Ana', confirmUrl: 'https://x' });

            expect(mail.subject).toBe('Confirmă adresa de email — IT Bridge School');
            expect(mail.bodyText).toContain('Bună, Ana!');
            expect(mail.bodyText).toContain('https://x');
            // The templates promise both variants; the parent-facing ones ship HTML.
            expect(mail.bodyHtml).toContain('Bună, Ana!');
        });

        it("the school's wording wins when a row exists", async () => {
            repo.findOne!.mockResolvedValue({ key: 'email-confirmation', subject: 'Salut, {{firstName}}', bodyText: 'Nou: {{confirmUrl}}', bodyHtml: null });

            const mail = await service.render('email-confirmation', { firstName: 'Ana', confirmUrl: 'https://x' });

            expect(mail.subject).toBe('Salut, Ana');
            expect(mail.bodyHtml).toBeNull();
        });

        it('404s on a key the code never sends — an edit cannot invent a message type', async () => {
            await expect(service.render('newsletter', {})).rejects.toThrow(NotFoundException);
        });
    });

    describe('the editor', () => {
        it('list marks which templates the school touched', async () => {
            repo.find!.mockResolvedValue([{ key: 'account-approved', version: 3, updatedAt: new Date() }]);

            const list = await service.list();

            expect(list.find((row) => row.key === 'account-approved')).toMatchObject({ customized: true, version: 3 });
            expect(list.find((row) => row.key === 'email-confirmation')).toMatchObject({ customized: false, version: 1 });
        });

        it('get carries the default alongside, so the editor can show what revert restores', async () => {
            const detail = await service.get('account-rejected');
            expect(detail.default.subject).toBe(detail.subject);
            expect(detail.variables.map((variable) => variable.name)).toEqual(['firstName', 'officeEmail']);
        });

        it('the first save writes version 2 — version 1 is the code', async () => {
            await service.save('account-approved', { subject: 'S', bodyText: 'B', bodyHtml: null });
            expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
        });

        it('a later save bumps what is there', async () => {
            const row = { key: 'account-approved', subject: 'S', bodyText: 'B', bodyHtml: null, version: 4 };
            repo.findOne!.mockResolvedValue(row);

            await service.save('account-approved', { subject: 'S2', bodyText: 'B2', bodyHtml: null });

            expect(row.version).toBe(5);
            expect(row.subject).toBe('S2');
        });

        it('revert deletes the row — the default needs no restoring, it never left the code', async () => {
            await service.revert('account-approved');
            expect(repo.delete).toHaveBeenCalledWith({ key: 'account-approved' });
        });

        it('preview renders the unsaved draft with the sample data, so a typo is caught before saving', async () => {
            const preview = await service.preview('email-confirmation', { subject: 'Bine ai venit, {{firstName}}' });
            expect(preview.subject).toBe('Bine ai venit, Ana');
        });
    });
});
