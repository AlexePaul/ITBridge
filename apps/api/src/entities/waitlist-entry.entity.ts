import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { WaitlistStatus } from '../enum/waitlist-status.enum';

/**
 * A request for a seat in a group that is full — E11/S3.
 *
 * A full group used to have nowhere to put a request, so the request was a note in somebody's head.
 * The list is what turns "we'll call you" into something the school can be held to.
 *
 * Entries are put on the list **by an admin** — from a phone call, from a trial, or from E20's
 * funnel. There is no form through which a parent adds themselves; D2.
 */
@Entity('waitlist_entries')
// One live request per child per group. A family that calls twice about the same group should find
// themselves already on the list rather than twice on it, ahead of people who called once.
@Index('UQ_waitlist_one_open_per_child_group', ['child', 'group'], {
    unique: true,
    where: `status IN ('WAITING', 'OFFERED')`,
})
export class WaitlistEntry {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    @ManyToOne(() => Group, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'group_id' })
    group: Group;

    @Index()
    @Column({ type: 'enum', enum: WaitlistStatus, default: WaitlistStatus.WAITING })
    status: WaitlistStatus;

    /**
     * Position is `createdAt`, ascending. There is no explicit position column, deliberately: one
     * would have to be renumbered on every removal, and two admins renumbering at once is how a
     * queue quietly reorders itself. Who asked first is a fact, not a number to maintain.
     */
    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    /** When the freed seat was offered. `null` until then. */
    @Column({ type: 'timestamptz', nullable: true })
    offeredAt: Date | null;

    /**
     * The deadline in the offer mail. After it, the entry is expired and the seat moves on.
     *
     * Nothing sweeps these automatically yet — the seat is re-offered when an admin next looks, or
     * when the next release runs the queue. A sweeper is a scheduled job and belongs with the rest
     * of them once anything actually runs (E01/S4).
     */
    @Column({ type: 'timestamptz', nullable: true })
    respondBy: Date | null;

    /** Anything the admin wants the next admin to know — "vrea doar marțea", "sună după 17". */
    @Column({ type: 'varchar', length: 500, nullable: true })
    note: string | null;
}
