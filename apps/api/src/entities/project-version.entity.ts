import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Project } from './project.entity';
import { ProjectFile } from './project-file.entity';

/**
 * One round of work on the same project. E14/S1.
 *
 * A child who comes back to last week's Scratch file has not made a second project; they have
 * carried the same one further. Without versions the gallery would show the same title four times
 * and the parent would have to guess which of them is the finished one.
 *
 * The version is a row rather than a number on the file because the unit that repeats is the
 * sitting, not the file: one afternoon can produce the `.sb3` and the screenshot of it, and those
 * two belong together.
 */
@Entity('project_versions')
// Numbering restarts inside each project, so the constraint is per project. It is also what makes
// "the next version number" safe to compute: a concurrent second upload collides here rather than
// producing two version 2s.
@Unique('UQ_project_versions_project_number', ['project', 'versionNumber'])
export class ProjectVersion {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Project, (project) => project.versions, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'project_id' })
    project: Project;

    /** 1, 2, 3… within the project. What a parent reads; the id is not a count and never should be. */
    @Column({ type: 'int' })
    versionNumber: number;

    @OneToMany(() => ProjectFile, (file) => file.version, { cascade: false })
    files: ProjectFile[];

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
