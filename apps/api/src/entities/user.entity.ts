import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { Profile } from './profile.entity';
import { Role } from '../enum/role.enum';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ unique: true, length: 30 })
    username: string;

    @Column({ type: 'varchar', length: 255 })
    passwordHash: string;

    // An enum column, so `'admin'` in the wrong case cannot be written at all. The `Role` enum
    // already existed and was used everywhere except here, where the type was a bare string union.
    @Column({ type: 'enum', enum: Role })
    role: Role;

    @CreateDateColumn({
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date;

    @OneToOne(() => Profile, (profile) => profile.user)
    profile?: Profile;
}
