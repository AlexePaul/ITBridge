import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The last thing the upload agent said about itself. E14/S2.
 *
 * One agent runs, on one computer in the office, and that is a deliberate trade: one credential in
 * a locked room and one thing to update, instead of one of each on every machine children sit at.
 * The cost is a single point of failure whose **silence is ambiguous** — a switched-off computer
 * looks exactly like a day when nobody made anything.
 *
 * This row is what makes the two distinguishable. The agent writes to it every few minutes, and the
 * group screen can say "the agent has not reported for 3 hours" instead of showing an empty list
 * that means nothing in particular. Alerting on it belongs to E06/S3's channel, not to a second
 * mechanism invented here.
 *
 * A table rather than a variable in memory because the answer has to survive the API restarting,
 * and because the API is the thing that might be restarting while the agent is fine.
 */
@Entity('agent_status')
export class AgentStatus {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * Which agent. One row per name, upserted on the heartbeat.
     *
     * There is one agent today and the design says so, but a second office would bring a second —
     * and a single hardcoded row would then have the two overwriting each other's timestamp, which
     * reads as "everything is fine" whichever one of them is actually down.
     */
    @Column({ type: 'varchar', length: 100, unique: true })
    agentName: string;

    @Column({ type: 'timestamptz' })
    lastSeenAt: Date;

    @Column({ type: 'varchar', length: 50, nullable: true })
    version: string | null;

    /** The share it is watching, as the agent sees it: `P:\Proiecte`. For the screen, and for support. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    watchedRoot: string | null;

    /** Files still waiting in the folder at the last pass. A number that does not fall is a stuck agent. */
    @Column({ type: 'int', default: 0 })
    pendingFiles: number;

    /** Whatever went wrong last, in the agent's own words. Cleared on a clean pass. */
    @Column({ type: 'text', nullable: true })
    lastError: string | null;
}
