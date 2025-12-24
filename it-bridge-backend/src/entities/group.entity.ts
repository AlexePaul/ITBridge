import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';

@Entity('groups')
@Unique(['weekday', 'startTime'])
export class Group {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * ISO weekday
     * 1 = Monday
     * 7 = Sunday
     */
    @Column({ type: 'int' })
    weekday: number;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'time' })
    endTime: string;

    @OneToMany(() => Child, (child) => child.group)
    children: Child[];
}
