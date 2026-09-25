import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { PublicationConsent } from 'src/entities/publication-consent.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { ConsentChannel } from 'src/enum/consent-channel.enum';
import { PublicationPurpose } from 'src/enum/publication-purpose.enum';
import { Role } from 'src/enum/role.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { adminFamilyUrl, consentTextUrl, profileUrl } from 'src/modules/auth/portal-urls';
import { romanianDay } from 'src/modules/invoice/money-words';
import { schoolDay } from 'src/common/school-clock';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { PUBLICATION_CONSENT_VERSIONS } from './publication-consent.texts';
import { consentsByPurpose, recordedByForOffice, recordedByInWords } from './publication-consent.rules';

/**
 * The answers, as the service builds them. `contract.ts` checks each against `@itbridge/types`, the
 * way it checks every computed shape: the enums here are the entity's, the contract's are literals.
 */
export interface PublicationConsentRecord {
    id: number;
    purpose: PublicationPurpose;
    textVersion: string;
    grantedAt: string;
    grantedVia: ConsentChannel;
    revokedAt: string | null;
    revokedVia: ConsentChannel | null;
}

export interface ChildConsents {
    childId: number;
    firstName: string;
    lastName: string;
    purposes: {
        purpose: PublicationPurpose;
        currentVersion: string;
        inForce: PublicationConsentRecord | null;
        history: PublicationConsentRecord[];
    }[];
}

export interface FamilyConsents {
    profileId: number;
    children: ChildConsents[];
}

export interface ConsentInForce {
    consentId: number;
    purpose: PublicationPurpose;
    textVersion: string;
    grantedAt: string;
    grantedVia: ConsentChannel;
    child: { id: number; firstName: string; lastName: string; birthDate: string };
    family: { id: number; firstName: string; lastName: string };
    group: { id: number; name: string } | null;
}

/** Who is asking, as the token says. */
export interface ConsentRequester {
    userId: number;
    role: Role;
}

/** A child with its family and the family's account — enough to check ownership and to write to them. */
type ChildWithFamily = Child & { parent: Profile };

/** "25 septembrie 2026", on the school's calendar. */
function dayInWords(at: Date): string {
    const day = schoolDay(at);
    return `${romanianDay(day)} ${day.slice(0, 4)}`;
}

function toRecord(row: PublicationConsent): PublicationConsentRecord {
    return {
        id: row.id,
        purpose: row.purpose,
        textVersion: row.textVersion,
        grantedAt: row.grantedAt.toISOString(),
        grantedVia: row.grantedVia,
        revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
        revokedVia: row.revokedVia,
    };
}

/**
 * A family's consent to use a child's work — E07 S2.
 *
 * **The rows are the answer.** Whether a child's work may be used today is whether a row for that
 * child and purpose has no `revokedAt`; nothing else in the platform keeps a second copy of it. The
 * epic asked for that in so many words — a snapshot anywhere else is for display speed, never a
 * place that can answer differently.
 *
 * **Both doors lead here, and they differ in one column.** The parent grants and withdraws for their
 * own children from the portal. The office does it for any family, from a signed paper form or a
 * phone call, which is the only way a family without an account can be served at all. The row says
 * which (`grantedVia`, `revokedVia`), the audit trail says who, and the family is told either way.
 *
 * **Withdrawing is the half that has to reach a person.** The platform publishes nothing: the public
 * site does not read from it, and the school's social pages are outside it. So "the work comes down"
 * cannot be a query that stops returning a row — it is somebody taking a post down. The office is
 * written to in the same transaction as the withdrawal, through the outbox, so the notice exists if
 * and only if the withdrawal does, and the dispatcher sends it within its next tick.
 */
@Injectable()
export class PublicationConsentService {
    constructor(
        @InjectRepository(Child) private readonly children: Repository<Child>,
        @InjectRepository(PublicationConsent) private readonly consents: Repository<PublicationConsent>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
    ) {}

    /** Every child of one family, every purpose, with the history. The caller decides whose family. */
    async forProfile(profileId: number): Promise<FamilyConsents> {
        const children = await this.children.find({ where: { parent: { id: profileId } }, order: { id: 'ASC' } });
        const rows = children.length
            ? await this.consents.find({ where: { child: { id: In(children.map((child) => child.id)) } }, relations: { child: true } })
            : [];

        return {
            profileId,
            children: children.map((child) =>
                this.stateOf(
                    child,
                    rows.filter((row) => row.child.id === child.id),
                ),
            ),
        };
    }

    /**
     * The children whose work may be used for `purpose` today — the office's list, read before a
     * work goes on the site or on a social page.
     *
     * This is the check the epic puts "at the moment of display": the site is static and the posts
     * are made by hand, so the moment of display is the moment somebody picks the work, and this is
     * what they pick from.
     */
    async inForce(purpose: PublicationPurpose): Promise<ConsentInForce[]> {
        const rows = await this.consents.find({
            where: { purpose, revokedAt: IsNull() },
            relations: { child: { parent: true, group: true } },
        });

        return rows
            .map((row) => ({
                consentId: row.id,
                purpose: row.purpose,
                textVersion: row.textVersion,
                grantedAt: row.grantedAt.toISOString(),
                grantedVia: row.grantedVia,
                child: {
                    id: row.child.id,
                    firstName: row.child.firstName,
                    lastName: row.child.lastName,
                    // TypeORM hands a `date` column back as `YYYY-MM-DD` text although the entity says
                    // `Date`; `toIsoDate` takes either, so the answer does not hang on which one arrives.
                    birthDate: toIsoDate(row.child.birthDate),
                },
                family: { id: row.child.parent.id, firstName: row.child.parent.firstName, lastName: row.child.parent.lastName },
                group: row.child.group ? { id: row.child.group.id, name: row.child.group.name } : null,
            }))
            .sort(
                (a, b) =>
                    a.child.lastName.localeCompare(b.child.lastName, 'ro') ||
                    a.child.firstName.localeCompare(b.child.firstName, 'ro') ||
                    a.child.id - b.child.id,
            );
    }

    /**
     * Records a consent. A second one while the first is in force is the same fact twice, so it
     * changes nothing — not even the day, the way a second acceptance of the terms does not move
     * the first.
     */
    async grant(childId: number, purpose: PublicationPurpose, requester: ConsentRequester, actor: Actor): Promise<ChildConsents> {
        const child = await this.childFor(childId, requester);
        const via = channelOf(requester);

        return this.dataSource.transaction(async (manager) => {
            const inserted = await manager
                .createQueryBuilder()
                .insert()
                .into(PublicationConsent)
                .values({ child: { id: child.id }, purpose, textVersion: PUBLICATION_CONSENT_VERSIONS[purpose], grantedVia: via })
                // The partial unique index is the rule; a conflict is the consent already in force,
                // which is the effect this request asked for.
                .orIgnore()
                .returning(['id', 'grantedAt', 'textVersion'])
                .execute();
            const written = (inserted.raw as { id: number; grantedAt: Date; textVersion: string }[])[0];

            if (written) {
                await this.audit.recordPersonalDataChange(
                    {
                        actor,
                        action: AuditAction.CREATED,
                        entityType: 'PublicationConsent',
                        entityId: written.id,
                        fields: ['purpose', 'textVersion', 'grantedAt', 'grantedVia'],
                        note: `acord pentru lucrările copilului #${child.id}, ${via === ConsentChannel.OFFICE ? 'consemnat de birou' : 'dat din portal'}`,
                    },
                    manager,
                );
                const mail = await this.mailTemplates.render('publication-consent-granted', {
                    firstName: child.parent.firstName,
                    childFirstName: child.firstName,
                    grantedOn: dayInWords(new Date(written.grantedAt)),
                    recordedBy: recordedByInWords(via),
                    version: written.textVersion,
                    consentUrl: consentTextUrl(),
                    profileUrl: profileUrl(),
                });
                await this.outbox.queueOrRecord(
                    familyRecipient(child.parent),
                    {
                        subject: mail.subject,
                        bodyText: mail.bodyText,
                        bodyHtml: mail.bodyHtml ?? undefined,
                        dedupeKey: `publication-consent-granted:${written.id}`,
                    },
                    manager,
                );
            }

            return this.stateOf(child, await manager.getRepository(PublicationConsent).find({ where: { child: { id: child.id } } }));
        });
    }

    /**
     * Withdraws the consent in force, if there is one. With nothing in force there is nothing to
     * withdraw and nobody to tell, so the answer is the state as it stands.
     */
    async revoke(childId: number, purpose: PublicationPurpose, requester: ConsentRequester, actor: Actor): Promise<ChildConsents> {
        const child = await this.childFor(childId, requester);
        const via = channelOf(requester);

        return this.dataSource.transaction(async (manager) => {
            const updated = await manager
                .createQueryBuilder()
                .update(PublicationConsent)
                .set({ revokedAt: () => 'now()', revokedVia: via })
                .where('child_id = :childId', { childId: child.id })
                .andWhere('purpose = :purpose', { purpose })
                .andWhere('"revokedAt" IS NULL')
                .returning(['id', 'grantedAt', 'revokedAt'])
                .execute();
            const revoked = (updated.raw as { id: number; grantedAt: Date; revokedAt: Date }[])[0];

            if (revoked) {
                await this.audit.recordPersonalDataChange(
                    {
                        actor,
                        action: AuditAction.UPDATED,
                        entityType: 'PublicationConsent',
                        entityId: revoked.id,
                        fields: ['revokedAt', 'revokedVia'],
                        note: `acord retras pentru lucrările copilului #${child.id}, ${via === ConsentChannel.OFFICE ? 'consemnat de birou' : 'din portal'}`,
                    },
                    manager,
                );
                await this.tellFamilyItWasWithdrawn(child, revoked, via, manager);
                await this.tellOffice(child, revoked, via, manager);
            }

            return this.stateOf(child, await manager.getRepository(PublicationConsent).find({ where: { child: { id: child.id } } }));
        });
    }

    private async tellFamilyItWasWithdrawn(
        child: ChildWithFamily,
        revoked: { id: number; revokedAt: Date },
        via: ConsentChannel,
        manager: EntityManager,
    ): Promise<void> {
        const mail = await this.mailTemplates.render('publication-consent-revoked', {
            firstName: child.parent.firstName,
            childFirstName: child.firstName,
            revokedOn: dayInWords(new Date(revoked.revokedAt)),
            recordedBy: recordedByInWords(via),
            profileUrl: profileUrl(),
        });
        await this.outbox.queueOrRecord(
            familyRecipient(child.parent),
            { subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml ?? undefined, dedupeKey: `publication-consent-revoked:${revoked.id}` },
            manager,
        );
    }

    /**
     * The notice that something may have to come down. Always sent, whoever withdrew: two people run
     * the office, and the one who recorded the withdrawal is not necessarily the one who posted.
     */
    private async tellOffice(
        child: ChildWithFamily,
        revoked: { id: number; grantedAt: Date; revokedAt: Date },
        via: ConsentChannel,
        manager: EntityManager,
    ): Promise<void> {
        const mail = await this.mailTemplates.render('publication-consent-revoked-office', {
            childName: `${child.firstName} ${child.lastName}`.trim(),
            familyName: `${child.parent.firstName} ${child.parent.lastName}`.trim(),
            grantedOn: dayInWords(new Date(revoked.grantedAt)),
            revokedOn: dayInWords(new Date(revoked.revokedAt)),
            recordedBy: recordedByForOffice(via),
            familyUrl: adminFamilyUrl(child.parent.id),
        });
        await this.outbox.queue(
            {
                to: officeAddress(),
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml ?? undefined,
                dedupeKey: `publication-consent-revoked-office:${revoked.id}`,
            },
            manager,
        );
    }

    /**
     * The child, if the requester may decide for it: an admin for any child, a parent for their own.
     * `?.` on the account, because a family an admin typed in has none — and then only the office
     * can decide for it, which is right, since only the office can hold its paper form.
     */
    private async childFor(childId: number, requester: ConsentRequester): Promise<ChildWithFamily> {
        const child = await this.children.findOne({ where: { id: childId }, relations: { parent: { user: true } } });
        if (!child || !child.parent) throw new NotFoundException('Child not found');
        if (requester.role !== Role.ADMIN && child.parent.user?.id !== requester.userId) {
            throw new ForbiddenException("You may only decide for your own children's work");
        }
        return child;
    }

    private stateOf(child: Pick<Child, 'id' | 'firstName' | 'lastName'>, rows: PublicationConsent[]): ChildConsents {
        return {
            childId: child.id,
            firstName: child.firstName,
            lastName: child.lastName,
            purposes: consentsByPurpose(rows).map((state) => ({
                purpose: state.purpose,
                currentVersion: PUBLICATION_CONSENT_VERSIONS[state.purpose],
                inForce: state.inForce ? toRecord(state.inForce) : null,
                history: state.history.map(toRecord),
            })),
        };
    }
}

/** The office transcribes, the parent decides in person — the row keeps which. */
function channelOf(requester: ConsentRequester): ConsentChannel {
    return requester.role === Role.ADMIN ? ConsentChannel.OFFICE : ConsentChannel.PORTAL;
}

/**
 * The family's address, and whether it counts as proven. No account at all is not "unconfirmed":
 * that is the family an admin typed in from a phone call, and the address they gave is the one the
 * school was told to use — the rule the announcements already follow.
 */
function familyRecipient(parent: Profile): { email: string | null; confirmed: boolean } {
    return { email: parent.email ?? null, confirmed: !parent.user || parent.user.emailConfirmedAt !== null };
}
