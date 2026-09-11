import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { Discount } from 'src/entities/discount.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { SessionCountOverride } from 'src/entities/session-count-override.entity';
import { Project } from 'src/entities/project.entity';
import { Lead } from 'src/entities/lead.entity';
import { leadsOfFamily } from './family-rows';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Session } from 'src/entities/session.entity';
import { DocumentAcceptance } from 'src/entities/document-acceptance.entity';
import { EmailConfirmation } from 'src/entities/email-confirmation.entity';
import { PasswordReset } from 'src/entities/password-reset.entity';
import type { FamilyExport } from './export.types';

/**
 * Everything the school holds about one family, in one document — E07 S4, the access right.
 *
 * The map is `linkedVia` in the data inventory (E07 S1): for every table that holds personal data
 * about a family, it names the path from the row back to the `Profile`. The queries below are that
 * map, written out. They are written out rather than generated because the shape of the answer
 * matters — a family opening this should recognise their own life in it, not read a dump of
 * normalised tables — and `export.spec.ts` closes the gap the hand-writing opens: it fails if the
 * inventory names a table this service does not read.
 *
 * Two things deliberately absent:
 *
 * - **Nothing about other families.** A class session tells you when the group met; it is the
 *   school's timetable, and it is included. Who else sat in the room is not.
 * - **No credential ever leaves.** Password and token hashes are personal data, and they are in the
 *   inventory as such — but handing them back is handing back a thing whose only use is to be
 *   guessed against. What a family gets is that a session exists, when it started and from what
 *   device, which is the fact they might actually want.
 *
 * **One caveat, and it is the data model's rather than this service's.** A trial booked from the
 * public form writes a *shell* `Profile` with no account (E20/S2, deliberately: those columns are
 * unique and a public form must not write into a real family's row). If that family later
 * registers, `register` writes a second `Profile`, and joining the two is an admin's job at
 * enrolment. Until they are joined, `GET /privacy/export` — which starts from the account — cannot
 * see the lead, because as far as the database is concerned it belongs to somebody else. That is
 * what the admin route is for: the office can export the shell profile by id.
 */
@Injectable()
export class ExportService {
    constructor(
        @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
        @InjectRepository(Child) private readonly children: Repository<Child>,
        @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
        @InjectRepository(Discount) private readonly discounts: Repository<Discount>,
        @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
        @InjectRepository(WaitlistEntry) private readonly waitlist: Repository<WaitlistEntry>,
        @InjectRepository(Attendance) private readonly attendances: Repository<Attendance>,
        @InjectRepository(AbsenceNotice) private readonly absences: Repository<AbsenceNotice>,
        @InjectRepository(SessionCountOverride) private readonly overrides: Repository<SessionCountOverride>,
        @InjectRepository(Project) private readonly projects: Repository<Project>,
        @InjectRepository(Lead) private readonly leads: Repository<Lead>,
        @InjectRepository(OutboxMessage) private readonly outbox: Repository<OutboxMessage>,
        @InjectRepository(Session) private readonly sessions: Repository<Session>,
        @InjectRepository(DocumentAcceptance) private readonly acceptances: Repository<DocumentAcceptance>,
        @InjectRepository(EmailConfirmation) private readonly confirmations: Repository<EmailConfirmation>,
        @InjectRepository(PasswordReset) private readonly passwordResets: Repository<PasswordReset>,
    ) {}

    /** Which tables this service reads. `export.spec.ts` compares it with the inventory. */
    static readonly COVERS = [
        'Profile',
        'User',
        'Child',
        'Enrollment',
        'WaitlistEntry',
        'Attendance',
        'AbsenceNotice',
        'SessionCountOverride',
        'Invoice',
        'Payment',
        'Discount',
        'Project',
        'ProjectVersion',
        'ProjectFile',
        'ProjectLink',
        'Lead',
        'OutboxMessage',
        'Session',
        'EmailConfirmation',
        'PasswordReset',
        'DocumentAcceptance',
    ] as const;

    async forProfile(profileId: number): Promise<FamilyExport> {
        const profile = await this.profiles.findOne({ where: { id: profileId }, relations: { user: true } });
        if (!profile) throw new NotFoundException('Profile not found');

        const children = await this.children.find({
            where: { parent: { id: profileId } },
            relations: { group: { room: { location: true } } },
            order: { id: 'ASC' },
        });
        const childIds = children.map((child) => child.id);

        // Every child list below goes through `ofChildren`, which short-circuits an empty id set.
        // `In([])` is not an error and not a match either, so the six queries would run and return
        // nothing; the guard says out loud that a family with no children exports as empty rather
        // than arriving there by accident.
        const ofChildren = async <T>(run: () => Promise<T[]>): Promise<T[]> => (childIds.length ? run() : []);

        const [enrollments, waitlist, attendances, absences, overrides, projects] = await Promise.all([
            ofChildren(() => this.enrollments.find({ where: { child: { id: In(childIds) } }, relations: { child: true, group: true }, order: { id: 'ASC' } })),
            ofChildren(() => this.waitlist.find({ where: { child: { id: In(childIds) } }, relations: { child: true, group: true }, order: { id: 'ASC' } })),
            ofChildren(() =>
                this.attendances.find({
                    where: { child: { id: In(childIds) } },
                    relations: { child: true, classSession: { group: true } },
                    order: { id: 'ASC' },
                }),
            ),
            ofChildren(() =>
                this.absences.find({ where: { child: { id: In(childIds) } }, relations: { child: true, classSession: true }, order: { id: 'ASC' } }),
            ),
            ofChildren(() => this.overrides.find({ where: { child: { id: In(childIds) } }, relations: { child: true }, order: { id: 'ASC' } })),
            ofChildren(() =>
                this.projects.find({
                    where: { child: { id: In(childIds) } },
                    relations: { child: true, versions: { files: true }, links: true },
                    order: { id: 'ASC' },
                }),
            ),
        ]);

        const invoices = await this.invoices.find({ where: { parent: { id: profileId } }, order: { id: 'ASC' } });
        const invoiceIds = invoices.map((invoice) => invoice.id);
        const payments = invoiceIds.length
            ? await this.payments.find({ where: { invoice: { id: In(invoiceIds) } }, relations: { invoice: true }, order: { id: 'ASC' } })
            : [];
        const discounts = await this.discounts.find({ where: { parent: { id: profileId } }, order: { id: 'ASC' } });
        // Not `{ profile: { id } }` alone: a lead an admin typed in from a phone call has no link
        // to either the family or the child, so the family's first contact with the school would be
        // missing from the copy of "everything we hold about you". See `leadsOfFamily`.
        const leads = await this.leads.find({ where: leadsOfFamily(profile), order: { id: 'ASC' } });

        // The queue has no relation to a profile — it is shared, and it also writes to the office —
        // so it is searched by address, exactly as the inventory says E07 S4 would have to.
        const messages = profile.email ? await this.outbox.find({ where: { to: profile.email }, order: { id: 'ASC' } }) : [];

        const userId = profile.user?.id;
        const [sessions, acceptances, confirmations, resets] = userId
            ? await Promise.all([
                  this.sessions.find({ where: { user: { id: userId } }, order: { id: 'ASC' } }),
                  this.acceptances.find({ where: { user: { id: userId } }, order: { id: 'ASC' } }),
                  this.confirmations.find({ where: { user: { id: userId } }, order: { id: 'ASC' } }),
                  this.passwordResets.find({ where: { user: { id: userId } }, order: { id: 'ASC' } }),
              ])
            : [[], [], [], []];

        return {
            generatedAt: new Date().toISOString(),
            parinte: {
                nume: `${profile.firstName} ${profile.lastName}`.trim(),
                email: profile.email ?? null,
                telefon: profile.phone ?? null,
                adresa: profile.address ?? null,
                contactDeUrgenta: profile.emergencyContactName
                    ? {
                          nume: profile.emergencyContactName,
                          relatie: profile.emergencyContactRelation ?? null,
                          telefon: profile.emergencyContactPhone ?? null,
                      }
                    : null,
                acceptaComunicariComerciale: profile.marketingOptIn,
            },
            cont: profile.user
                ? {
                      utilizator: profile.user.username,
                      rol: profile.user.role,
                      creatLa: profile.user.createdAt?.toISOString() ?? null,
                      emailConfirmatLa: profile.user.emailConfirmedAt?.toISOString() ?? null,
                      stareAprobare: profile.user.approvalStatus,
                      aprobatLa: profile.user.approvalDecidedAt?.toISOString() ?? null,
                  }
                : null,
            copii: children.map((child) => ({
                nume: `${child.firstName} ${child.lastName}`.trim(),
                dataNasterii: toDay(child.birthDate),
                inregistratLa: child.createdAt?.toISOString() ?? null,
                grupa: child.group ? child.group.name : null,
                locatie: child.group?.room?.location?.name ?? null,
                inscrieri: enrollments
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({
                        grupa: row.group?.name ?? null,
                        stare: row.status,
                        de: toDay(row.startDate),
                        pana: toDay(row.endDate),
                        motivIesire: row.exitReason ?? null,
                        contractSemnatLa: toDay(row.contractSignedAt),
                    })),
                listaDeAsteptare: waitlist
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({
                        grupa: row.group?.name ?? null,
                        stare: row.status,
                        cerutLa: row.createdAt?.toISOString() ?? null,
                        oferitLa: row.offeredAt?.toISOString() ?? null,
                        raspunsPanaLa: row.respondBy?.toISOString() ?? null,
                        nota: row.note ?? null,
                    })),
                prezente: attendances
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({
                        data: toDay(row.classSession?.date),
                        grupa: row.classSession?.group?.name ?? null,
                        prezent: row.present,
                        tip: row.type,
                    })),
                absenteAnuntate: absences
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({
                        data: toDay(row.classSession?.date),
                        motiv: row.reason ?? null,
                        inTermen: row.inTime,
                        anuntatLa: row.createdAt?.toISOString() ?? null,
                    })),
                corecturiDeSedinte: overrides
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({ luna: row.monthIssued, sedinte: row.sessions, motiv: row.reason ?? null })),
                proiecte: projects
                    .filter((row) => row.child?.id === child.id)
                    .map((row) => ({
                        titlu: row.title,
                        descriere: row.description ?? null,
                        realizatLa: toDay(row.capturedOn),
                        stare: row.status,
                        trimisLa: row.sentAt?.toISOString() ?? null,
                        trimisLaAdresa: row.sentToEmail ?? null,
                        fisiere: (row.versions ?? []).flatMap((version) => (version.files ?? []).map((file) => file.originalName)),
                        legaturi: (row.links ?? []).map((link) => ({ eticheta: link.label, adresa: link.url })),
                    })),
            })),
            facturi: invoices.map((invoice) => ({
                luna: invoice.monthIssued,
                suma: invoice.amount,
                emisaLa: toDay(invoice.dateIssued),
                stare: invoice.status,
                plati: payments
                    .filter((payment) => payment.invoice?.id === invoice.id)
                    .map((payment) => ({
                        suma: payment.amount,
                        metoda: payment.method,
                        stare: payment.status,
                        data: toDay(payment.date),
                        referinta: payment.externalReference ?? null,
                    })),
            })),
            reduceri: discounts.map((discount) => ({
                nume: discount.name,
                tip: discount.type,
                valoare: discount.value,
                luna: discount.monthIssued,
            })),
            solicitari: leads.map((lead) => ({
                stare: lead.status,
                sursa: lead.source,
                copil: `${lead.childFirstName} ${lead.childLastName}`.trim(),
                dataNasteriiCopilului: toDay(lead.childBirthDate),
                experienta: lead.experience ?? null,
                probaTinutaLa: lead.trialHeldAt?.toISOString() ?? null,
                creatLa: lead.createdAt?.toISOString() ?? null,
            })),
            mesajePrimite: messages.map((message) => ({
                subiect: message.subject,
                trimisLa: message.sentAt?.toISOString() ?? null,
                stare: message.status,
            })),
            autentificari: sessions.map((session) => ({
                incepiuta: session.createdAt?.toISOString() ?? null,
                expiraLa: session.expiresAt?.toISOString() ?? null,
                revocataLa: session.revokedAt?.toISOString() ?? null,
                dispozitiv: session.userAgent ?? null,
            })),
            confirmariDeEmail: confirmations.map((confirmation) => ({
                adresa: confirmation.email,
                trimisLa: confirmation.createdAt?.toISOString() ?? null,
                deschisLa: confirmation.consumedAt?.toISOString() ?? null,
            })),
            // The token itself is not here, and not because it is awkward to fetch: the row holds
            // only a hash, and a link that has been used or has expired opens nothing anyway. What
            // the family gets is the fact — somebody asked to reset this account on this day, to
            // this address — which is the part they might not recognise.
            resetariDeParola: resets.map((reset) => ({
                adresa: reset.email,
                cerutLa: reset.createdAt?.toISOString() ?? null,
                folositLa: reset.consumedAt?.toISOString() ?? null,
            })),
            documenteAcceptate: acceptances.map((acceptance) => ({
                document: acceptance.document,
                versiune: acceptance.version,
                acceptatLa: acceptance.acceptedAt?.toISOString() ?? null,
            })),
        };
    }
}

/**
 * A `date` column as the day it means.
 *
 * TypeORM hands a `date` column back as `'2026-03-01'` on one path and as a `Date` on another —
 * the same split `diffFields` deals with in the audit log. Going through `toISOString()` would also
 * be the one-day bug CLAUDE.md warns about, east of Greenwich.
 */
function toDay(value: Date | string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
