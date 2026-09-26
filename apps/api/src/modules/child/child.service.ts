import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { DataSource, Repository } from 'typeorm';
import { CreateChildDto } from './dto/createChild.dto';
import { FilterChildDto } from './dto/filterChild.dto';
import { UpdateChildDto } from './dto/updateChild.dto';
import { Group } from 'src/entities/group.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Project } from 'src/entities/project.entity';
import { applyDefined } from 'src/common/apply-defined';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { changedFieldNames } from 'src/modules/audit/personal-fields';
import { assertNotErased } from 'src/modules/privacy/erasure.rules';
import { Invoice } from 'src/entities/invoice.entity';
import { Lead } from 'src/entities/lead.entity';

@Injectable()
export class ChildService {
    public constructor(
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        private readonly enrollmentService: EnrollmentService,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
    ) {}

    async createChild(createChildDto: CreateChildDto, role: Role, userId: number, actor: Actor) {
        if (role !== Role.ADMIN) {
            const profile = await this.profileRepository.findOne({
                where: { user: { id: userId } },
            });
            if (!profile || profile.id !== createChildDto.parentId) {
                throw new ForbiddenException('You do not have permission to add a child for this parent');
            }
        }
        const parentProfile = await this.profileRepository.findOne({
            where: { id: createChildDto.parentId },
        });
        if (!parentProfile) {
            throw new NotFoundException('Parent profile not found');
        }
        assertNotErased(parentProfile);
        const child = this.childRepository.create(createChildDto);
        child.parent = parentProfile;
        // Row and trail in one transaction — E07/S3. They were two loose statements, so a failure
        // between them left a child on file with nothing saying who added them.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Child, child);
            // The act and the id, not the name that came with it. Whoever entered this child is the
            // half the row cannot answer for itself.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.CREATED,
                    entityType: 'Child',
                    entityId: saved.id,
                    fields: ['child'],
                    note: 'copil adăugat',
                },
                manager,
            );
            return saved;
        });
    }

    async findChildren(filterChildDto: FilterChildDto, role: Role, sub: number) {
        const query = this.childRepository
            .createQueryBuilder('child')
            .leftJoinAndSelect('child.parent', 'parent')
            .leftJoin('parent.user', 'user')
            // The room and its location come along, because `Group` in the shared contract carries
            // them — a group returned without a room is a wire shape the frontend does not expect,
            // and the admin's location filter has nothing to read.
            .leftJoinAndSelect('child.group', 'group')
            .leftJoinAndSelect('group.room', 'room')
            .leftJoinAndSelect('room.location', 'location');

        if (role !== Role.ADMIN) {
            query.andWhere('user.id = :userId', { userId: sub });
        }
        if (filterChildDto.parentId) {
            query.andWhere('parent.id = :parentId', { parentId: filterChildDto.parentId });
        }
        if (filterChildDto.firstName) {
            query.andWhere('lower(child.firstName) LIKE lower(:firstName)', { firstName: `%${filterChildDto.firstName}%` });
        }
        if (filterChildDto.lastName) {
            query.andWhere('lower(child.lastName) LIKE lower(:lastName)', { lastName: `%${filterChildDto.lastName}%` });
        }
        if (filterChildDto.childId) {
            query.andWhere('child.id = :childId', { childId: filterChildDto.childId });
        }
        return query.getMany();
    }

    async updateChild(childId: number, updateChildDto: UpdateChildDto, role: Role, userId: number, actor: Actor) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: ['parent', 'parent.user'],
        });

        if (!child) {
            throw new NotFoundException('Child not found');
        }
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new ForbiddenException('You do not have permission to update this child');
        }

        // Which fields moved, never what they became — E07/S3. A child's name and date of birth are
        // held under the `account` retention rule and go when the family goes; this trail outlives
        // what it describes, so the values must not cross into it.
        const moved = changedFieldNames(child as unknown as Record<string, unknown>, updateChildDto as unknown as Record<string, unknown>);

        applyDefined(child, updateChildDto);
        const saved = await this.dataSource.transaction(async (manager) => {
            const written = await manager.save(Child, child);
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Child',
                    entityId: childId,
                    fields: moved,
                },
                manager,
            );
            return written;
        });
        // The account was loaded for the ownership check above and is not part of the answer: a
        // parent editing their own child was handed their own `rejectionReason` and, until the
        // column became `select: false`, their password hash. Same shape as `ProfileService`.
        saved.parent.user = undefined;
        return saved;
    }

    /**
     * Removes a child row — and only a row that records nothing that happened.
     *
     * Everything that hangs off a `Child` is `CASCADE`: enrolments, attendance, announced absences,
     * waitlist entries, session-count overrides, and projects with their versions, files and links.
     * So this used to take the school's register with it, from a parent's own token — measured:
     * one child, one enrolment and one mark before; zero of each after, 200 OK.
     *
     * Two of those are refused, and they are the two that record something that happened:
     *
     * - **Attendance is the register.** It is who was in the room, and E15/S9 counts an invoice
     *   from it. A mark can be corrected; it cannot be made never to have existed.
     * - **A project is work, and bytes in the bucket.** Deleting the rows leaves every object
     *   orphaned: the keys are derived from ids (`project.keys.ts`), so once the rows are gone
     *   nothing can work out what to remove. `ErasureService` reads the keys *before* it deletes
     *   for exactly this reason; there is nowhere here to put that, and a child with saved work is
     *   not a row somebody typed by mistake anyway.
     *
     * Enrolments alone are deliberately **not** a blocker. An enrolment with no marks against it
     * records an intention rather than an event, and refusing on it would close the one legitimate
     * use left: undoing a child added, and placed, in error.
     *
     * The erasure does not come through here — `ErasureService` deletes `Child` rows through its
     * own transaction, after reading the object keys — so none of this stands in a family's way
     * when they ask to be forgotten.
     */
    async deleteChild(childId: number, role: Role, userId: number, actor: Actor) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: ['parent', 'parent.user'],
        });

        if (!child) {
            throw new NotFoundException('Child not found');
        }
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new ForbiddenException('You do not have permission to delete this child');
        }

        if (await this.attendanceRepository.exists({ where: { child: { id: childId } } })) {
            throw new ConflictException({
                message: 'Copilul are prezențe marcate, iar catalogul se păstrează. Scoate-l din grupă dacă nu mai vine.',
                error: 'CHILD_HAS_ATTENDANCE',
            });
        }

        if (await this.projectRepository.exists({ where: { child: { id: childId } } })) {
            throw new ConflictException({
                message: 'Copilul are lucrări încărcate. Șterge-le întâi pe ele, sau folosește ecranul de ștergeri.',
                error: 'CHILD_HAS_PROJECTS',
            });
        }

        // The removal and its trail commit together: once the row is gone the trail is the only
        // thing that can say who removed it.
        await this.dataSource.transaction(async (manager) => {
            // A child with no marks can still hold a seat — enrolled, on trial, or offered one from
            // the list — and the cascade frees it without asking anybody. So the groups are taken
            // before the delete and their lists asked after it, as any other release would.
            const heldIn = await this.enrollmentService.lockSeatsHeldBy([childId], manager);
            await manager.delete(Child, childId);
            await this.enrollmentService.offerFreeSeatsIn(heldIn, manager);
            // The act, not the contents: a deleted child leaving a copy of their name in the trail
            // is the failure this half exists to avoid.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.DELETED,
                    entityType: 'Child',
                    entityId: childId,
                    fields: ['child'],
                    note: 'copil șters',
                },
                manager,
            );
        });
        return { message: 'Child deleted successfully' };
    }

    /**
     * Moves a child into another family — the office's tool for the duplicate families `/proba`
     * makes (QA of 26 September 2026).
     *
     * Every booking on the public form writes its own shell `Profile`, deliberately without email or
     * phone (a public form must not write another family's row), so two siblings booked one after
     * the other are two families, and a family with an account that books a trial is two. Sibling
     * pricing then never applies, and the trial family's invoices would go to a row with no address.
     * The child moves with everything that is the child's — enrolments, register, work, consents,
     * absence notices — and the enquiries about it follow, so the funnel and the booking address point
     * at the family that is left. The empty shell can then be deleted from its page.
     *
     * Refused when the child's family has any invoice: an invoice counts a family's children, and a
     * child moved out of an invoiced family would split what it was billed for across two.
     */
    async moveToFamily(childId: number, profileId: number, actor: Actor): Promise<Child> {
        return this.dataSource.transaction(async (manager) => {
            const child = await manager.findOne(Child, { where: { id: childId }, relations: { parent: true } });
            if (!child) throw new NotFoundException('Child not found');
            const target = await manager.findOne(Profile, { where: { id: profileId } });
            if (!target) throw new NotFoundException('Profile not found');
            if (child.parent.id === target.id) {
                throw new BadRequestException({ message: 'The child is already in that family.', error: 'CHILD_ALREADY_IN_FAMILY' });
            }
            assertNotErased(child.parent);
            assertNotErased(target);
            const invoiced = await manager.count(Invoice, { where: { parent: { id: child.parent.id } } });
            if (invoiced > 0) {
                throw new ConflictException({
                    message: `Family ${child.parent.id} has ${invoiced} invoice(s); its children are not moved to another family.`,
                    error: 'CHILD_FAMILY_INVOICED',
                });
            }

            await manager.update(Child, childId, { parent: { id: target.id } });
            await manager.update(Lead, { child: { id: childId } }, { profile: { id: target.id } });
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Child',
                    entityId: childId,
                    fields: ['parent'],
                    note: `copil mutat din familia ${child.parent.id} în familia ${target.id}`,
                },
                manager,
            );
            return { ...child, parent: target };
        });
    }

    /**
     * Puts a child in a group — by opening an enrolment, not by writing a foreign key.
     *
     * Since E11/S1 this is a thin front door onto `EnrollmentService`, kept because the route
     * `POST /children/:childId/groups/:groupId` is what the admin screens already call. Everything
     * that used to live here — the account gate from S2, and now the one-group rule and the
     * capacity rule — lives there, in the one place that writes `Child.group`.
     *
     * The alternative was to keep setting the column here and *also* record an enrolment, which is
     * two writers for one fact and exactly the drift the derived column is supposed to avoid.
     */
    async assignChildToGroup(childId: number, groupId: number, actor: Actor, acknowledgeWarnings = false) {
        return this.enrollmentService.enrol({ childId, groupId, acknowledgeWarnings }, actor);
    }

    /**
     * Takes a child out of a group, closing the enrolment as withdrawn.
     *
     * The seat is freed and offered to whoever is waiting, which is `EnrollmentService.close`'s
     * job. Removing the child by blanking `Child.group` would have left the enrolment open, the
     * history wrong, and the seat held by nobody.
     */
    async removeChildFromGroup(childId: number, groupId: number) {
        const inForce = await this.enrollmentService.inForceFor(childId);
        if (!inForce || inForce.group.id !== groupId) {
            throw new NotFoundException('Child not found in the specified group');
        }

        await this.enrollmentService.close(inForce.id, { status: EnrollmentStatus.WITHDRAWN });
        return { message: 'Child removed from the group' };
    }
}
