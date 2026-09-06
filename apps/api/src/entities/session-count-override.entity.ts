import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Child } from './child.entity';
import { User } from './user.entity';

/**
 * A number of sessions somebody decided to bill instead of the one the registers say — E15/S9.
 *
 * The count is read from the registers, and that stays the rule. This is the exception, and it is
 * **a row rather than a request field** for one reason: the invoice itself carries only a product
 * line — „curs informatică × 3" — so the document can never disagree with the registers, but the
 * school's own record can, and three months later somebody will ask why Ana paid for three when
 * four were held. The answer has to be here, with who and when, or it is "somebody typed it".
 *
 * One per child per month, by index. It replaces the counted number entirely — it is not an
 * adjustment on top of it — because "bill three" is what the person meant, whatever the registers
 * say the week after. Cleared by deleting the row, at which point the registers speak again.
 *
 * Frozen with the invoice: once the family's month is issued, the row cannot change, for the same
 * reason the vacation tick cannot (E12/S8) — it would alter what was already billed.
 */
@Entity('session_count_overrides')
@Index('UQ_session_count_override_child_month', ['child', 'monthIssued'], { unique: true })
export class SessionCountOverride {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    /** The teaching month, `YYYY-MM` — the same key an invoice carries. */
    @Column({ type: 'varchar', length: 7 })
    monthIssued: string;

    /** What is billed instead. Zero is allowed: "do not charge this child this month" is a decision too. */
    @Column({ type: 'int' })
    sessions: number;

    /** Why, in the words of whoever decided. Optional, because the school asked for it to be. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    reason: string | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
