import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Lead } from 'src/entities/lead.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { schoolDay, schoolLocalStamp } from 'src/common/school-clock';
import { sessionStartStamp } from 'src/modules/attendance/absence-notice.rules';

/**
 * The lead following the facts — E20/S1 and S3.
 *
 * Three of the six statuses are never typed in by anybody: a child marked present at their trial
 * makes the lead `TRIAL_HELD`, and E11 resolving that trial makes it `ENROLLED` or `LOST`. S3 says
 * so in as many words — *„Starea `probă ținută` o pune prezența, nu o bifă separată"* — and the
 * reason is the screen it protects. "Trials held, no decision" exists because the last step of the
 * funnel is a person's job and can be forgotten; if the list itself depended on somebody
 * remembering to tick a box, it would be empty for exactly the leads it is meant to catch.
 *
 * **A module of its own, on purpose.** The booking flow needs `EnrollmentService`, so if the
 * enrolment and attendance services depended on the lead service in turn, the two modules would
 * import each other. This one writes nothing but the `leads` table — it reads a group's classes when
 * a trial moves, through the entities, not through another module — which lets both call it
 * without a cycle, and keeps the writes small enough to join whatever transaction the caller is
 * already in.
 */
@Injectable()
export class LeadProgressService {
    private readonly logger = new Logger('LeadProgress');

    constructor(@InjectRepository(Lead) private readonly leadRepository: Repository<Lead>) {}

    private repo(manager?: EntityManager): Repository<Lead> {
        return manager ? manager.getRepository(Lead) : this.leadRepository;
    }

    /**
     * The register said the child came to their trial.
     *
     * Idempotent, and narrow on purpose: only a lead that is still `TRIAL_SCHEDULED` moves. One
     * already decided stays decided — a register corrected a week later must not drag a family back
     * onto the follow-up list after somebody has enrolled them.
     *
     * **Any class of the trial's group from the booked one on counts, not only the booked one**
     * (review of 25 September 2026). A trial sits in every class of its group until it is decided,
     * and the no-show message invites the family to come to another one — so the child marked present
     * the week after was a trial held that stayed `TRIAL_SCHEDULED`: never on "Probe ținute, fără
     * decizie", never in the digest, and missing from the funnel's count of trials held. The lead
     * takes the class the child actually came to, which is also what lets `revertTrialHeld` find it
     * when the mark was a mistake.
     */
    async markTrialHeld(childId: number, classSessionId: number, now: Date = new Date(), manager?: EntityManager): Promise<void> {
        const repo = this.repo(manager);
        const attended = await (manager ?? this.leadRepository.manager)
            .getRepository(ClassSession)
            .findOne({ where: { id: classSessionId }, relations: { group: true } });
        if (!attended) return;

        const leads = await repo.find({
            where: { child: { id: childId }, group: { id: attended.group.id }, status: LeadStatus.TRIAL_SCHEDULED },
            relations: { trialSession: true },
        });
        for (const lead of leads) {
            // Not a class before the booked one: the trial had not started, whatever a register says.
            if (lead.trialSession && sessionStartStamp(lead.trialSession) > sessionStartStamp(attended)) continue;
            const result = await repo.update(
                { id: lead.id, status: LeadStatus.TRIAL_SCHEDULED },
                { status: LeadStatus.TRIAL_HELD, trialHeldAt: now, lastActivityAt: now, trialSession: { id: attended.id } },
            );
            if (result.affected) {
                this.logger.log(`Child ${childId} attended their trial at session ${classSessionId}; lead ${lead.id} moved to trial_held.`);
            }
        }
    }

    /**
     * The mark was a mistake and has been corrected to absent.
     *
     * The mirror of the above, and it exists for the same reason `MakeUpCreditService.revokeFor`
     * does: a mistap on a phone screen must not leave a permanent fact behind it. Only an
     * undecided lead moves back — once somebody has said yes or no, the register is no longer what
     * the lead is about.
     */
    async revertTrialHeld(childId: number, classSessionId: number, manager?: EntityManager): Promise<void> {
        await this.repo(manager).update(
            { child: { id: childId }, trialSession: { id: classSessionId }, status: LeadStatus.TRIAL_HELD },
            { status: LeadStatus.TRIAL_SCHEDULED, trialHeldAt: null },
        );
    }

    /**
     * E11 resolved the trial: the child was enrolled, or the trial was closed.
     *
     * This is the decision S4 measures to, and the only place `ENROLLED` is ever written — the lead
     * records what the enrolment says, exactly as the epic asks. `decidedAt` is stamped here rather
     * than derived later so the median in the funnel report survives a lead being edited afterwards.
     */
    async settleForEnrollment(
        enrollmentId: number,
        outcome: { enrolled: boolean; reason?: string | null },
        now: Date = new Date(),
        manager?: EntityManager,
    ): Promise<void> {
        const result = await this.repo(manager).update(
            { enrollment: { id: enrollmentId }, status: In([LeadStatus.TRIAL_SCHEDULED, LeadStatus.TRIAL_HELD, LeadStatus.CONTACTED, LeadStatus.NEW]) },
            {
                status: outcome.enrolled ? LeadStatus.ENROLLED : LeadStatus.LOST,
                lostReason: outcome.enrolled ? null : (outcome.reason ?? 'Proba nu s-a transformat în înscriere'),
                decidedAt: now,
                lastActivityAt: now,
            },
        );
        if (result.affected) {
            this.logger.log(`Enrollment ${enrollmentId} settled its lead as ${outcome.enrolled ? 'enrolled' : 'lost'}.`);
        }
    }

    /**
     * The trial moved to another group — the review of 25 September 2026.
     *
     * A transfer closes the trial's enrolment and opens another in the new group, carrying the trial
     * across, and the lead kept pointing at the closed one. So the decision E11 later made on the new
     * row settled nothing, and the lead waited on the follow-up list for ever. Its class stayed the
     * old group's as well: the reminder named a room the child was no longer going to, and once that
     * class's register was taken without the child, the no-show follow-up told the family they had
     * missed a trial they had been moved away from.
     *
     * The lead follows the enrolment. While the trial is still ahead, its class becomes the new
     * group's next one that has not started — which class the office agreed on the phone is not
     * something the platform can know, and the next one is what the booking itself would offer. A
     * trial already held keeps its class: that is where it was held. `location` stays as it is: it
     * is where the family asked, which is what the funnel counts demand by.
     */
    async followTransfer(fromEnrollmentId: number, to: { enrollmentId: number; groupId: number }, now: Date, manager: EntityManager): Promise<void> {
        const repository = manager.getRepository(Lead);
        const ahead = await repository.count({ where: { enrollment: { id: fromEnrollmentId }, status: LeadStatus.TRIAL_SCHEDULED } });
        if (ahead > 0) {
            const next = await this.nextClassOf(to.groupId, now, manager);
            await repository.update(
                { enrollment: { id: fromEnrollmentId }, status: LeadStatus.TRIAL_SCHEDULED },
                { trialSession: next ? { id: next.id } : null },
            );
        }
        const moved = await repository.update(
            { enrollment: { id: fromEnrollmentId } },
            { enrollment: { id: to.enrollmentId }, group: { id: to.groupId }, lastActivityAt: now },
        );
        if (moved.affected) {
            this.logger.log(`Trial enrolment ${fromEnrollmentId} moved to ${to.enrollmentId} in group ${to.groupId}; its lead followed.`);
        }
    }

    /** The group's next class that has not started, on the school clock — the one `/proba` would offer. */
    private async nextClassOf(groupId: number, now: Date, manager: EntityManager): Promise<ClassSession | null> {
        const nowStamp = schoolLocalStamp(now);
        const coming = await manager.getRepository(ClassSession).find({
            where: { group: { id: groupId }, status: ClassSessionStatus.SCHEDULED, date: MoreThanOrEqual(schoolDay(now)) as unknown as Date },
            order: { date: 'ASC', startTime: 'ASC' },
            take: 8,
        });
        return coming.find((session) => sessionStartStamp(session) > nowStamp) ?? null;
    }
}
