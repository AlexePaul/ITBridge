import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Profile } from './profile.entity';

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
    dateOfBirth: Date;

    @Column({ type: 'date', nullable: true })
    createdAt: Date;
}
