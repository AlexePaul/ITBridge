import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { TEMPLATE_DEFAULTS, templateDefault } from './template-defaults';
import { renderTemplate, TemplateFields } from './template-render';

/**
 * Templates: the defaults in code, the school's edits in the database — E17/S2.
 *
 * `render` is what the senders call; everything else serves the admin editor. The set of template
 * keys is closed (it is the list in `template-defaults.ts`): an edit customizes wording, it cannot
 * invent a message type, because a message type without a sender is a row nothing will ever read.
 */
@Injectable()
export class MailTemplateService {
    constructor(@InjectRepository(MailTemplate) private readonly templateRepository: Repository<MailTemplate>) {}

    /** Every template, defaults merged with whatever the school customized. */
    async list() {
        const overrides = await this.templateRepository.find();
        const overrideByKey = new Map(overrides.map((row) => [row.key, row]));

        return TEMPLATE_DEFAULTS.map((definition) => {
            const override = overrideByKey.get(definition.key);
            return {
                key: definition.key,
                name: definition.name,
                description: definition.description,
                customized: override !== undefined,
                version: override?.version ?? 1,
                updatedAt: override?.updatedAt ?? null,
            };
        });
    }

    /** One template in full: current fields, the default to compare against, variables, sample data. */
    async get(key: string) {
        const definition = templateDefault(key);
        if (!definition) throw new NotFoundException('No such mail template');
        const override = await this.templateRepository.findOne({ where: { key } });

        return {
            key: definition.key,
            name: definition.name,
            description: definition.description,
            variables: definition.variables,
            sampleData: definition.sampleData,
            customized: override !== null,
            version: override?.version ?? 1,
            subject: override?.subject ?? definition.subject,
            bodyText: override?.bodyText ?? definition.bodyText,
            bodyHtml: override ? override.bodyHtml : definition.bodyHtml,
            default: { subject: definition.subject, bodyText: definition.bodyText, bodyHtml: definition.bodyHtml },
        };
    }

    /**
     * What the senders call. The school's wording wins when it exists; the code's when it does not.
     */
    async render(key: string, data: Record<string, string>): Promise<TemplateFields> {
        const definition = templateDefault(key);
        if (!definition) throw new NotFoundException('No such mail template');
        const override = await this.templateRepository.findOne({ where: { key } });

        const fields: TemplateFields = override
            ? { subject: override.subject, bodyText: override.bodyText, bodyHtml: override.bodyHtml }
            : { subject: definition.subject, bodyText: definition.bodyText, bodyHtml: definition.bodyHtml };
        return renderTemplate(fields, data);
    }

    /**
     * The preview: the given fields (or the saved/default ones) rendered with the sample data.
     * Taking unsaved fields is the point — the editor previews what is typed, not what was saved,
     * so a broken placeholder is caught before it can be saved at all.
     */
    async preview(key: string, draft?: Partial<TemplateFields>) {
        const definition = templateDefault(key);
        if (!definition) throw new NotFoundException('No such mail template');
        const current = await this.get(key);

        const fields: TemplateFields = {
            subject: draft?.subject ?? current.subject,
            bodyText: draft?.bodyText ?? current.bodyText,
            bodyHtml: draft?.bodyHtml !== undefined ? draft.bodyHtml : current.bodyHtml,
        };
        return renderTemplate(fields, definition.sampleData);
    }

    /** Saves the school's wording. An upsert; the version counts the saves. */
    async save(key: string, fields: TemplateFields) {
        const definition = templateDefault(key);
        if (!definition) throw new NotFoundException('No such mail template');

        const existing = await this.templateRepository.findOne({ where: { key } });
        if (existing) {
            existing.subject = fields.subject;
            existing.bodyText = fields.bodyText;
            existing.bodyHtml = fields.bodyHtml;
            existing.version += 1;
            await this.templateRepository.save(existing);
        } else {
            await this.templateRepository.save(
                this.templateRepository.create({ key, subject: fields.subject, bodyText: fields.bodyText, bodyHtml: fields.bodyHtml, version: 2 }),
            );
        }
        return this.get(key);
    }

    /** Back to the wording the code ships. Deleting the row is the whole operation. */
    async revert(key: string) {
        if (!templateDefault(key)) throw new NotFoundException('No such mail template');
        await this.templateRepository.delete({ key });
        return this.get(key);
    }
}
