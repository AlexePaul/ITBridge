import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ErrorReport } from './error-report.entity';

/**
 * The code a screen showed for one occurrence of a fault — how `/admin/erori?cod=` finds it.
 *
 * `ErrorReport.recent` keeps the newest twenty occurrences, which is what the screen shows. Codes
 * were searched there too, so a fault every parent meets collected twenty more occurrences within
 * minutes, and the family calling with its code found nothing — exactly for the faults that matter
 * most (review of 27 September 2026). One small row per code, with nothing personal on it, gone with
 * its report or after the same thirty days.
 */
@Entity('error_references')
@Index('IDX_error_references_report_id', ['report'])
@Index('IDX_error_references_ref', ['ref'])
export class ErrorReference {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => ErrorReport, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'report_id' })
    report: ErrorReport;

    /** A response's request id, or a browser's own reference; searched by its first characters. */
    @Column({ type: 'varchar', length: 64 })
    ref: string;

    @Column({ type: 'timestamptz' })
    at: Date;
}
