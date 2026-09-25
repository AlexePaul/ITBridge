/**
 * What a family can agree to have a child's work published for — E07 S2.
 *
 * **One purpose today, and that is a decision, not an omission.** The epic listed three: the public
 * showcase from E14 S6, the school's promotional materials for E19, and commercial communications.
 * The other two already have an answer somewhere else:
 *
 * - **The showcase left the MVP with E14 S6.** A consent for an act that does not happen is a box
 *   the family would be asked to tick, the platform would store and check, and whose answer would
 *   never change anything — the argument E07 used to drop photographing children, applied again.
 *   It comes back as a second value here the day the showcase does. The table is already keyed on
 *   the purpose, so that is an `ALTER TYPE … ADD VALUE`, not a migration of anybody's rows.
 * - **Commercial communications are `Profile.marketingOptIn`** (E17 S4), and they belong there. The
 *   message goes to the parent's inbox, once per family, so a per-child answer to "may we send this
 *   family offers" would be a question nobody could act on: yes for the elder and no for the
 *   younger, and the newsletter still has one address.
 */
export enum PublicationPurpose {
    /** The work, and a photo of it, in the school's promotional materials: the site, its social pages, presentations. */
    PROMOTION = 'promotion',
}
