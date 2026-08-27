import { Check, Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';
import { Weekday } from '../enum/weekday.enum';
import { decimalAsNumber } from './decimal.transformer';

@Entity('groups')
@Unique(['weekday', 'startTime'])
// Declared here as well as in the migration, so `check:schema` sees entity and database agree.
// The TypeScript enum stops a bad literal at a call site; this stops one arriving any other way.
@Check('CHK_groups_weekday_iso', '"weekday" BETWEEN 1 AND 7')
export class Group {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * ISO weekday, 1 = Monday through 7 = Sunday.
     *
     * Stored as an int rather than a Postgres enum, because the values are ordinals and sorting by
     * them has to give the week in order. A CHECK constraint keeps 0 and 8 out; the `Weekday` enum
     * keeps `weekday: 6` from appearing at a call site.
     */
    @Column({ type: 'int' })
    weekday: Weekday;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'time' })
    endTime: string;

    // `decimal` hands back a string from the driver, so without a transformer these left the API
    // as `"11"` while `@itbridge/types` — and this very declaration — say `number`. `contract.ts`
    // cannot catch that: both sides agree at the type level and only the runtime disagrees. Same
    // transformer `Invoice.amount` already uses.
    @Column({ type: 'decimal', transformer: decimalAsNumber })
    minAge: number;

    @Column({ type: 'decimal', transformer: decimalAsNumber })
    maxAge: number;

    @OneToMany(() => Child, (child) => child.group)
    children: Child[];

    @Column({ type: 'boolean', default: true })
    isActive: boolean;
}
