import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, Like } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { romanianDate } from 'src/modules/mail/romanian-date';
import { absencesUrl, loginUrl } from 'src/modules/auth/portal-urls';
import { bookingAddresses } from 'src/modules/mail/booking-address';

/** Where a session was before it moved — the half a parent asks about. */
export interface SessionPlacement {
    date: Date | string;
    startTime: string;
    roomName: string;
    locationName: string;
}

export const CANCELLED_DEDUPE_PREFIX = 'class-cancelled:';
export const MOVED_DEDUPE_PREFIX = 'class-moved:';
export const REINSTATED_DEDUPE_PREFIX = 'class-reinstated:';
export const GROUP_SCHEDULE_DEDUPE_PREFIX = 'group-schedule:';

/** One inbox, and whether it hears about the class as the group's or as a visitor's. */
interface Recipient {
    parentId: number;
    email: string | null;
    firstName: string;
    /** True for a family whose child the office moved into this class for the week, not enrolled in it. */
    visiting: boolean;
    /**
     * True for a family reached at the address it left on the booking form — a trial booked on
     * `/proba`, whose profile carries no address of its own (see `bookingAddresses`).
     */
    trial: boolean;
}

interface RenderedMail {
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
}

/**
 * Telling a group's families that their class changed — E12/S5.
 *
 * **One message per parent, never one per child**, like everything else that writes to a family: a
 * parent with two children in the same group is one person reading one inbox. The group's children
 * are read here rather than by the callers, so cancelling, moving and reinstating do not each have
 * to remember which relations a message needs. **A family visiting for a make-up** (E12/S4) is
 * read the same way: their child was going to be in that room too, and a note that only reaches
 * the group would leave them turning up to a class that is off, or at the old hour of one that
 * moved.
 *
 * **Every message is queued with the caller's transaction manager.** A class that is cancelled
 * without the note going out is the failure the outbox exists to prevent — and the reverse, a note
 * about a cancellation that then rolled back, is worse. Callers pass their manager; the write and
 * the message stand or fall together.
 *
 * **The dedupe key counts the announcements already made about the session**, rather than naming
 * the day. A class cancelled by mistake, reinstated a minute later and then really cancelled must
 * write twice — the family last heard it was on — while two admins pressing the same button at the
 * same moment must not. The count is read inside the caller's transaction: both see the same
 * number, produce the same keys, and the unique index refuses the second set.
 */
@Injectable()
export class ClassSessionNotifier {
    private readonly logger = new Logger('ClassSessionNotifier');

    constructor(
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
    ) {}

    /**
     * The class is off.
     *
     * `makeUpNote` is a sentence rather than a flag because it is the only part of this message a
     * family acts on, and what it says depends on who is reading. **The group** hears that the hour
     * is not charged for, which since E15/S9 is not a concession but the arithmetic: a session with
     * no register never happened and nobody is billed for it. **A visiting family** — a child the
     * office had moved here for the week — hears that the hour they were sent to is off, and that
     * the school will look for another one, because finding it was never theirs to do.
     *
     * The flag that used to be here is gone with the credit it granted. Cancelling a class no longer
     * hands anybody a token to spend later: the hour is not billed, and if the week still has a
     * class that fits, the office moves the child into it and that message says where.
     */
    async notifyCancelled(sessionId: number, reason: string, manager: EntityManager): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const groupNote = 'Ora nu se facturează — plata e pe ședință ținută, deci luna aceasta va fi cu o ședință mai mică.';
        const visitorNote = 'Ora la care îl mutasem pe copilul tău pentru săptămâna asta nu se mai ține. Căutăm alta în aceeași săptămână și te anunțăm.';
        // A family here for a free trial is billed for nothing, so the group's sentence about the
        // month would be about somebody else. What they need is the next step, and it is ours.
        const trialNote = 'Proba copilului tău era la ora asta. Te sunăm să stabilim împreună alta.';

        const recipients = await this.recipientsOf(session, manager, { includeVisitors: true });
        return this.writeTo(recipients, session, manager, CANCELLED_DEDUPE_PREFIX, (recipient) =>
            this.mailTemplates.render('class-cancelled', {
                firstName: recipient.firstName,
                groupName: session.group.name,
                date: romanianDate(session.date),
                time: session.startTime.slice(0, 5),
                reason,
                makeUpNote: recipient.visiting ? visitorNote : recipient.trial ? trialNote : groupNote,
                // The absences page for a family whose move just evaporated; otherwise just the portal.
                portalUrl: recipient.visiting ? absencesUrl() : loginUrl(),
            }),
        );
    }

    /**
     * The class is on, but somewhere or somewhen else. A visiting family has to hear the new hour too.
     *
     * `visitorsOnly` is for a class that moved because its whole group did (`followGroup`): the
     * group's families hear that once, as a new schedule, and only the families visiting for the
     * week need this class's own sentence.
     */
    async notifyMoved(
        sessionId: number,
        from: SessionPlacement,
        reason: string,
        manager: EntityManager,
        options: { visitorsOnly?: boolean } = {},
    ): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const when = (date: Date | string, startTime: string) => `${romanianDate(date)}, ora ${startTime.slice(0, 5)}`;
        const where = (roomName: string, locationName: string) => (locationName ? `${roomName} — ${locationName}` : roomName);

        const everyone = await this.recipientsOf(session, manager, { includeVisitors: true });
        const recipients = options.visitorsOnly ? everyone.filter((recipient) => recipient.visiting) : everyone;
        return this.writeTo(recipients, session, manager, MOVED_DEDUPE_PREFIX, (recipient) =>
            this.mailTemplates.render('class-moved', {
                firstName: recipient.firstName,
                groupName: session.group.name,
                fromWhen: `${when(from.date, from.startTime)}, ${where(from.roomName, from.locationName)}`,
                toWhen: when(session.date, session.startTime),
                room: where(session.room.name, session.room.location.name),
                reason,
                portalUrl: loginUrl(),
            }),
        );
    }

    /**
     * The cancelled class is back on, and the families who were told it was off have to hear so.
     * Only the group: a child moved here for the week was released when the class was cancelled, and
     * that family has been told the office is looking for another hour.
     */
    async notifyReinstated(sessionId: number, manager: EntityManager): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const recipients = await this.recipientsOf(session, manager, { includeVisitors: false });
        return this.writeTo(recipients, session, manager, REINSTATED_DEDUPE_PREFIX, (recipient) =>
            this.mailTemplates.render('class-reinstated', {
                firstName: recipient.firstName,
                groupName: session.group.name,
                date: romanianDate(session.date),
                time: session.startTime.slice(0, 5),
                portalUrl: loginUrl(),
            }),
        );
    }

    /**
     * The group moved to another day, hour or room, and its coming classes moved with it.
     *
     * **Once per family**, not once per class: eight classes following a group to Wednesday are one
     * change, and eight "class moved" messages would bury it. The group's families only — a child the
     * office moved into one of those classes for a week hears about that week from the office, which
     * placed them. The key counts the group's earlier announcements, as the per-class ones do, so a
     * group moved and moved back is told both times.
     */
    async notifyGroupScheduleChanged(
        groupId: number,
        change: { fromSlot: string; toSlot: string; firstDate: Date | string },
        manager: EntityManager,
    ): Promise<number> {
        const group = await manager.getRepository(Group).findOne({ where: { id: groupId }, relations: { children: { parent: true } } });
        if (!group) return 0;

        const recipients = new Map<number, Recipient>();
        for (const child of group.children ?? []) {
            const parent = child.parent;
            if (!parent || recipients.has(parent.id)) continue;
            recipients.set(parent.id, { parentId: parent.id, email: parent.email ?? null, firstName: parent.firstName, visiting: false, trial: false });
        }
        await this.reachTrialFamilies([...recipients.values()], manager);

        const prefix = `${GROUP_SCHEDULE_DEDUPE_PREFIX}${groupId}:`;
        const announcement = await manager.getRepository(OutboxMessage).count({ where: { dedupeKey: Like(`${prefix}%`) } });
        let written = 0;
        for (const recipient of recipients.values()) {
            const mail = await this.mailTemplates.render('group-schedule-changed', {
                firstName: recipient.firstName,
                groupName: group.name,
                fromSlot: change.fromSlot,
                toSlot: change.toSlot,
                firstDate: romanianDate(change.firstDate),
                portalUrl: loginUrl(),
            });
            const queued = await this.outbox.queueOrRecord(
                { email: recipient.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    dedupeKey: `${prefix}${announcement}:${recipient.parentId}`,
                },
                manager,
            );
            if (queued) written += 1;
        }

        this.logger.log(`Group ${groupId}: told ${written} parent(s) about the new schedule.`);
        return written;
    }

    /**
     * Read through the caller's manager, so the group membership seen is the one inside the
     * transaction rather than whatever a second connection happens to show.
     */
    private loadWithFamilies(sessionId: number, manager: EntityManager): Promise<ClassSession | null> {
        return manager.getRepository(ClassSession).findOne({
            where: { id: sessionId },
            relations: { group: { children: { parent: true } }, room: { location: true } },
        });
    }

    /**
     * Every inbox the class concerns, once each. The group's parents first; then, when asked, the
     * parents of children the office moved into this class for the week. A parent in both lists — a
     * sibling visiting their brother's group — is the group's, and reads the group's sentence.
     */
    private async recipientsOf(session: ClassSession, manager: EntityManager, options: { includeVisitors: boolean }): Promise<Recipient[]> {
        const recipients = new Map<number, Recipient>();
        for (const child of session.group.children ?? []) {
            const parent = child.parent;
            if (!parent || recipients.has(parent.id)) continue;
            recipients.set(parent.id, { parentId: parent.id, email: parent.email ?? null, firstName: parent.firstName, visiting: false, trial: false });
        }

        if (options.includeVisitors) {
            // Read before the caller clears the moves: the whole point is to reach the family whose
            // replacement class is about to disappear.
            const placed = await manager.getRepository(AbsenceNotice).find({
                where: { replacementSession: { id: session.id } },
                relations: { child: { parent: true } },
            });
            for (const notice of placed) {
                const parent = notice.child?.parent;
                if (!parent || recipients.has(parent.id)) continue;
                recipients.set(parent.id, { parentId: parent.id, email: parent.email ?? null, firstName: parent.firstName, visiting: true, trial: false });
            }
        }

        const all = [...recipients.values()];
        await this.reachTrialFamilies(all, manager);
        return all;
    }

    /**
     * Gives a family with no address on its profile the one it left on the booking form — see
     * `bookingAddresses`. A trial booked on `/proba` is in the group like any child and in every
     * one of these messages, and it is the family least likely to have heard anything else from us.
     */
    private async reachTrialFamilies(recipients: Recipient[], manager: EntityManager): Promise<void> {
        const unreachable = recipients.filter((recipient) => !recipient.email);
        const addresses = await bookingAddresses(
            manager,
            unreachable.map((recipient) => recipient.parentId),
        );
        for (const recipient of unreachable) {
            const address = addresses.get(recipient.parentId);
            if (address) {
                recipient.email = address;
                recipient.trial = true;
            }
        }
    }

    private async writeTo(
        recipients: Recipient[],
        session: ClassSession,
        manager: EntityManager,
        prefix: string,
        compose: (recipient: Recipient) => Promise<RenderedMail>,
    ): Promise<number> {
        // How many times this session has already been announced under this prefix. Read inside the
        // transaction, so two concurrent presses count the same and collide on the unique index.
        const announcement = await manager.getRepository(OutboxMessage).count({ where: { dedupeKey: Like(`${prefix}${session.id}:%`) } });

        let written = 0;
        for (const recipient of recipients) {
            const mail = await compose(recipient);
            const queued = await this.outbox.queueOrRecord(
                { email: recipient.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    dedupeKey: `${prefix}${session.id}:${announcement}:${recipient.parentId}`,
                },
                manager,
            );
            if (queued) written += 1;
        }

        this.logger.log(`Session ${session.id}: wrote to ${written} parent(s) of group ${session.group.name}.`);
        return written;
    }
}
