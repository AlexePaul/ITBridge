import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { romanianDate } from 'src/modules/mail/romanian-date';
import { absencesUrl, loginUrl } from 'src/modules/auth/portal-urls';
import { toIsoDate } from './class-session.dates';

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

/**
 * Telling a group's families that their class changed — E12/S5.
 *
 * **One message per parent, never one per child**, like everything else that writes to a family: a
 * parent with two children in the same group is one person reading one inbox. The group's children
 * are read here rather than by the callers, so cancelling, moving and reinstating do not each have
 * to remember which relations a message needs.
 *
 * **Every message is queued with the caller's transaction manager.** A class that is cancelled
 * without the note going out is the failure the outbox exists to prevent — and the reverse, a note
 * about a cancellation that then rolled back, is worse. Callers pass their manager; the write and
 * the message stand or fall together.
 *
 * The dedupe key carries the **day the action was taken**, not just the session: a class cancelled,
 * reinstated and cancelled again next week must write twice, because the family has to hear it
 * twice, while two admins pressing the same button within the same day must not.
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
     * family acts on, and what it says depends on a decision the admin made one dialog earlier —
     * whether the hour is being given back. An empty string renders as a blank line, which the
     * template tolerates.
     */
    async notifyCancelled(sessionId: number, reason: string, makeUpGranted: boolean, manager: EntityManager, today = new Date()): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const makeUpNote = makeUpGranted
            ? 'Copilul tău are dreptul la o oră de recuperare, pe care o poți programa din portal în următoarele 30 de zile.'
            : 'Ora nu se facturează — plata e pe ședință ținută, deci luna aceasta va fi cu o ședință mai mică.';

        return this.writeToFamilies(session, manager, `${CANCELLED_DEDUPE_PREFIX}${sessionId}:${toIsoDate(today)}`, (firstName) =>
            this.mailTemplates.render('class-cancelled', {
                firstName,
                groupName: session.group.name,
                date: romanianDate(session.date),
                time: session.startTime.slice(0, 5),
                reason,
                makeUpNote,
                portalUrl: absencesUrl(),
            }),
        );
    }

    /** The class is on, but somewhere or somewhen else. */
    async notifyMoved(sessionId: number, from: SessionPlacement, reason: string, manager: EntityManager, today = new Date()): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        const when = (date: Date | string, startTime: string) => `${romanianDate(date)}, ora ${startTime.slice(0, 5)}`;

        return this.writeToFamilies(session, manager, `${MOVED_DEDUPE_PREFIX}${sessionId}:${toIsoDate(today)}`, (firstName) =>
            this.mailTemplates.render('class-moved', {
                firstName,
                groupName: session.group.name,
                fromWhen: when(from.date, from.startTime),
                toWhen: when(session.date, session.startTime),
                room: `${session.room.name} — ${session.room.location.name}`,
                reason,
                portalUrl: loginUrl(),
            }),
        );
    }

    /** The cancelled class is back on, and the families who were told it was off have to hear so. */
    async notifyReinstated(sessionId: number, manager: EntityManager, today = new Date()): Promise<number> {
        const session = await this.loadWithFamilies(sessionId, manager);
        if (!session) return 0;

        return this.writeToFamilies(session, manager, `${REINSTATED_DEDUPE_PREFIX}${sessionId}:${toIsoDate(today)}`, (firstName) =>
            this.mailTemplates.render('class-reinstated', {
                firstName,
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

    private async writeToFamilies(
        session: ClassSession,
        manager: EntityManager,
        dedupeBase: string,
        compose: (firstName: string) => Promise<{ subject: string; bodyText: string; bodyHtml: string | null }>,
    ): Promise<number> {
        const parents = new Map<number, { email: string | null; firstName: string }>();
        for (const child of session.group.children ?? []) {
            const parent = child.parent;
            if (!parent || parents.has(parent.id)) continue;
            parents.set(parent.id, { email: parent.email ?? null, firstName: parent.firstName });
        }

        let written = 0;
        for (const [parentId, parent] of parents) {
            const mail = await compose(parent.firstName);
            const queued = await this.outbox.queueOrRecord(
                { email: parent.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    dedupeKey: `${dedupeBase}:${parentId}`,
                },
                manager,
            );
            if (queued) written += 1;
        }

        this.logger.log(`Session ${session.id}: wrote to ${written} parent(s) of group ${session.group.name}.`);
        return written;
    }
}
