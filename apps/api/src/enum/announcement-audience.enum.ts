/**
 * Who an announcement is addressed to — E17/S7.
 *
 * Three widths, and no fourth: a group, an address, or the whole school. The list is short on
 * purpose. An announcement is the one message in the system that goes to more than one family at a
 * time, and every audience added to it is another way for „sâmbătă e zi liberă" to reach people it
 * does not concern.
 *
 * Note what is *not* here: a single family. That is not an audience, it is a letter, and E17 has a
 * standing rule that anything about a particular child leaves through a sender that names the
 * child's own parent — never through a broadcast whose recipient list is computed.
 */
export enum AnnouncementAudience {
    /** The families of one group, trials included: a trial child sits in that room too (D7). */
    GROUP = 'group',
    /** Every family with a child in a group held at one address. */
    LOCATION = 'location',
    /** Every family with a child in any group. */
    ALL = 'all',
}
