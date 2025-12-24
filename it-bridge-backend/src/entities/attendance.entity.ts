import { Column, Entity, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';
import { Group } from './group.entity';

@Entity('attendances')
@Unique(['child', 'date', 'startTime'])
export class Attendance {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, (child) => child.attendances, { onDelete: 'CASCADE' })
    child: Child;

    @ManyToOne(() => Group, { nullable: false })
    group: Group;

    @Column({ type: 'date' })
    date: Date;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'varchar', length: 100, default: 'normal' })
    type: string;

    @Column({ type: 'boolean', default: false })
    present: boolean;
}
