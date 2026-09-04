/**
 * Where a request from a family has got to — E20/S1.
 *
 * **Descriptive, not a machine.** No state here changes because time passed: every transition is
 * either something a person did on a screen, or a consequence of a fact recorded elsewhere — the
 * register says the child came, so the lead is `TRIAL_HELD`; E11 turns the trial into an enrolment,
 * so the lead is `ENROLLED`. A status that moved itself would be a status nobody could trust, and
 * the one screen this epic is really about ("trials held, no decision") would empty itself.
 */
export enum LeadStatus {
    /** Somebody asked. Nobody has answered yet. */
    NEW = 'new',
    /** A person from the school has spoken to them. */
    CONTACTED = 'contacted',
    TRIAL_SCHEDULED = 'trial_scheduled',
    /** The child was marked present at the trial class. Set by the register, never by a checkbox. */
    TRIAL_HELD = 'trial_held',
    /** An admin enrolled the child, in E11. The lead records the decision; it does not make it. */
    ENROLLED = 'enrolled',
    LOST = 'lost',
}

/** The two ends of the funnel: a lead in one of these is finished, and leaves the follow-up lists. */
export const SETTLED_LEAD_STATUSES = [LeadStatus.ENROLLED, LeadStatus.LOST] as const;

export const isSettled = (status: LeadStatus): boolean => (SETTLED_LEAD_STATUSES as readonly LeadStatus[]).includes(status);
