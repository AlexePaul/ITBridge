import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity';

/**
 * Work that lives at a URL rather than in a file. E14/S1.
 *
 * A Tinkercad model, a Canva design, a shared Scratch project, a web page the child built: none of
 * them is a file anyone saves into a folder, and all of them are what the youngest and the oldest
 * groups in the catalogue actually produce. A model that demanded a file would have excluded them.
 *
 * There are two roads in: a `.url` or `.txt` file left in the child's folder, which the agent reads
 * as a link rather than uploading, and an admin adding one from the group screen.
 */
@Entity('project_links')
export class ProjectLink {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Project, (project) => project.links, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'project_id' })
    project: Project;

    /** What it is called on screen: "Macheta în Tinkercad". Defaulted from the host when nothing better is known. */
    @Column({ type: 'varchar', length: 200 })
    label: string;

    /**
     * Only `http:` and `https:` reach this column — the service refuses anything else.
     *
     * The value is rendered as an anchor in the parent's portal, so a `javascript:` URL saved into a
     * `.url` file on a share that any machine in the school can write to would be script execution
     * on the school's own domain, triggered by a parent clicking their child's work.
     */
    @Column({ type: 'varchar', length: 2048 })
    url: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
