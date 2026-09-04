/**
 * How the request reached the school — E20/S1.
 *
 * This is the mechanism, and it is always known: the public form writes `TRIAL_FORM`, an admin
 * typing in a phone call writes `PHONE`. It is not "where did you hear about us", which is a
 * different question with a different answer, asked separately as `LeadChannel` — a family that
 * found the school on Google and then rang up has both, and collapsing them into one column would
 * lose whichever the screen happened to write last.
 */
export enum LeadSource {
    /** The public booking form. */
    TRIAL_FORM = 'trial_form',
    PHONE = 'phone',
    WALK_IN = 'walk_in',
    /** Another family sent them. Self-declared — nothing attributes it; see E20/S5. */
    REFERRAL = 'referral',
    OTHER = 'other',
}

/**
 * Where the family says they heard about the school. Optional, and **self-declared**.
 *
 * S4 reads this to answer "which channel brings families". It answers it the way a questionnaire
 * does, not the way an analytics pipeline would: nobody is tracked here, and `REFERRAL` in
 * particular is a parent saying so, not an attribution — E20/S5 decided against referral codes on
 * purpose, so this column is all there is and the report must say as much.
 */
export enum LeadChannel {
    GOOGLE = 'google',
    FACEBOOK = 'facebook',
    INSTAGRAM = 'instagram',
    /** "Mi-a recomandat cineva." */
    FRIEND = 'friend',
    FLYER = 'flyer',
    /** Walked past one of the two addresses. */
    PASSING_BY = 'passing_by',
    OTHER = 'other',
}
