import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Profile } from './profile.entity';
import { Group } from './group.entity';
import { Attendance } from './attendance.entity';

@Entity('children')
export class Child {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Profile, (profile) => profile.children, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parent_id' })
    parent: Profile;

    @Column({ type: 'varchar', length: 100 })
    firstName: string;

    @Column({ type: 'varchar', length: 100 })
    lastName: string;

    @Column({ type: 'date', nullable: false })
    birthDate: Date;

    // `date` truncates to the day, but the default was CURRENT_TIMESTAMP — the intent was clearly
    // "when the record was created". A `CreateDateColumn` states that, and keeps the time.
    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @ManyToOne(() => Group, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'group_id' })
    group: Group | null;

    @OneToMany(() => Attendance, (attendance) => attendance.child)
    attendances: Attendance[];
}
