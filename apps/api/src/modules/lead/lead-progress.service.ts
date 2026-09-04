import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Lead } from 'src/entities/lead.entity';
import { LeadStatus } from 'src/enum/lead-status.enum';

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
 * import each other. This one touches nothing but the `leads` table, which lets both call it
 * without a cycle — and keeps the writes small enough to join whatever transaction the caller is
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
     */
    async markTrialHeld(childId: number, classSessionId: number, now: Date = new Date(), manager?: EntityManager): Promise<void> {
        const result = await this.repo(manager).update(
            { child: { id: childId }, trialSession: { id: classSessionId }, status: LeadStatus.TRIAL_SCHEDULED },
            { status: LeadStatus.TRIAL_HELD, trialHeldAt: now, lastActivityAt: now },
        );
        if (result.affected) {
            this.logger.log(`Child ${childId} attended their trial at session ${classSessionId}; lead moved to trial_held.`);
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
}
