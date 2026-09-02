import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, IsNull, Like } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { romanianDate } from 'src/modules/mail/romanian-date';
import { absencesUrl, loginUrl } from 'src/modules/auth/portal-urls';

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

/** One inbox, and whether it hears about the class as the group's or as a make-up visitor's. */
interface Recipient {
    parentId: number;
    email: string | null;
    firstName: string;
    /** True for a family whose child was booked into this class for a make-up, not enrolled in it. */
    visiting: boolean;
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
     * family acts on, and what it says depends on who is reading and on a decision the admin made
     * one dialog earlier — whether the hour is being given back. The group hears either that a
     * make-up was granted or that the hour is simply not charged for; a visiting family hears that
     * the make-up they booked here is released and still theirs to book elsewhere.
     */
    async notifyCancelled(sessionId: number, reason: string, makeUpGranted: boolean, manager: EntityManager): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const groupNote = makeUpGranted
            ? 'Copilul tău are dreptul la o oră de recuperare, pe care o poți programa din portal în următoarele 30 de zile.'
            : 'Ora nu se facturează — plata e pe ședință ținută, deci luna aceasta va fi cu o ședință mai mică.';
        const visitorNote =
            'Recuperarea pe care o programaseși la ora asta nu se mai ține. Dreptul rămâne valabil până la termenul lui, iar altă oră se alege din portal.';

        const recipients = await this.recipientsOf(session, manager, { includeVisitors: true });
        return this.writeTo(recipients, session, manager, CANCELLED_DEDUPE_PREFIX, (recipient) =>
            this.mailTemplates.render('class-cancelled', {
                firstName: recipient.firstName,
                groupName: session.group.name,
                date: romanianDate(session.date),
                time: session.startTime.slice(0, 5),
                reason,
                makeUpNote: recipient.visiting ? visitorNote : groupNote,
                // The make-up page when there is a make-up to act on; otherwise just the portal.
                portalUrl: recipient.visiting || makeUpGranted ? absencesUrl() : loginUrl(),
            }),
        );
    }

    /** The class is on, but somewhere or somewhen else. A visiting family has to hear the new hour too. */
    async notifyMoved(sessionId: number, from: SessionPlacement, reason: string, manager: EntityManager): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const when = (date: Date | string, startTime: string) => `${romanianDate(date)}, ora ${startTime.slice(0, 5)}`;
        const where = (roomName: string, locationName: string) => (locationName ? `${roomName} — ${locationName}` : roomName);

        const recipients = await this.recipientsOf(session, manager, { includeVisitors: true });
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
     * Only the group: a make-up booked here was released when the class was cancelled, and that
     * family has been told to choose another hour.
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
     * parents of children booked into this class for a make-up. A parent in both lists — a sibling
     * visiting their brother's group — is the group's, and reads the group's sentence.
     */
    private async recipientsOf(session: ClassSession, manager: EntityManager, options: { includeVisitors: boolean }): Promise<Recipient[]> {
        const recipients = new Map<number, Recipient>();
        for (const child of session.group.children ?? []) {
            const parent = child.parent;
            if (!parent || recipients.has(parent.id)) continue;
            recipients.set(parent.id, { parentId: parent.id, email: parent.email ?? null, firstName: parent.firstName, visiting: false });
        }

        if (options.includeVisitors) {
            // Read before the caller releases the bookings: the whole point is to reach the family
            // whose booking is about to disappear.
            const booked = await manager.getRepository(MakeUpCredit).find({
                where: { bookedSession: { id: session.id }, consumedAttendance: IsNull() },
                relations: { child: { parent: true } },
            });
            for (const credit of booked) {
                const parent = credit.child?.parent;
                if (!parent || recipients.has(parent.id)) continue;
                recipients.set(parent.id, { parentId: parent.id, email: parent.email ?? null, firstName: parent.firstName, visiting: true });
            }
        }

        return [...recipients.values()];
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
