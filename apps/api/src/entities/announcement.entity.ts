import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AnnouncementAudience } from '../enum/announcement-audience.enum';
import { MessageKind } from '../enum/message-kind.enum';
import { Group } from './group.entity';
import { Location } from './location.entity';
import { User } from './user.entity';

/**
 * One broadcast an admin pressed send on — E17/S7.
 *
 * The messages themselves are ordinary `OutboxMessage` rows; this table is the *decision* that
 * produced them. Keeping it is not bookkeeping for its own sake. E17's risk section says a mass
 * email sent by mistake cannot be recalled, and the answer to an unrecallable action is a record of
 * who took it, to whom, and with what words — one that survives the browser tab the admin pressed
 * it in.
 *
 * It also makes the delivery report of the story's acceptance a *live* one rather than a snapshot:
 * the outbox rows point back here, so „câți au primit" is a count over the queue as it stands now,
 * not a number frozen at send time. The one number that cannot be counted that way is
 * `declinedCount` — see below.
 */
@Entity('announcements')
export class Announcement {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'enum', enum: AnnouncementAudience })
    audience: AnnouncementAudience;

    /** Set only when `audience` is `group`. RESTRICT: an announcement's audience must stay readable. */
    @ManyToOne(() => Group, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'group_id' })
    group: Group | null;

    /** Set only when `audience` is `location`. */
    @ManyToOne(() => Location, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'location_id' })
    location: Location | null;

    /**
     * Operational or marketing — E17/S4, and the reason this column exists at all.
     *
     * Without it, „toți părinții" would be the hole in the marketing guarantee: an admin could
     * reach every family with anything, and `Profile.marketingOptIn` would gate a sender that does
     * not exist while the one that does ignores it. The default is `TRANSACTIONAL`, the same safe
     * direction as everywhere else: a message that says nothing about itself goes out.
     */
    @Column({ type: 'enum', enum: MessageKind, default: MessageKind.TRANSACTIONAL })
    kind: MessageKind;

    @Column({ type: 'varchar', length: 255 })
    subject: string;

    /**
     * What the admin typed, exactly. Not the composed message: the greeting and the signature are
     * added per recipient, and storing the assembled body would store one family's copy as if it
     * were the announcement.
     */
    @Column({ type: 'text' })
    bodyText: string;

    /**
     * Who pressed send. Nullable and `SET NULL`, because an admin account can be deleted and the
     * record of the broadcast must outlive it — an announcement with no author still happened.
     */
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sent_by_id' })
    sentBy: User | null;

    /** How many inboxes the audience came to, at the moment of sending. */
    @Column({ type: 'int', default: 0 })
    recipientCount: number;

    /**
     * How many families were left out because they had not opted into marketing.
     *
     * Stored rather than counted, and it is the one number that has to be: a refusal deliberately
     * leaves **no row** (E17/S4 — nobody was owed that message, so nothing failed). Counted from
     * the queue it would read as zero, which is a different sentence from „patru familii nu primesc
     * buletinul". Always zero on a transactional announcement, which consults no preference.
     */
    @Column({ type: 'int', default: 0 })
    declinedCount: number;

    /**
     * The same words, to the same audience, on the same day — refused.
     *
     * A broadcast has no natural identity the way a cancelled class does, so this is a deliberate
     * definition of „the same announcement": audience, subject, body and calendar day, hashed. It
     * exists for the failure E17 names in S8 and which applies here word for word — a nervous click
     * on a slow connection doubling a whole group — and for two admins pressing at the same second,
     * which no check-then-insert can catch.
     */
    @Index('UQ_announcements_dedupe', { unique: true })
    @Column({ type: 'varchar', length: 255 })
    dedupeKey: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
