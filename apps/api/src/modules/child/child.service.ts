import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { schoolDay } from 'src/common/school-clock';
import { lockInvoiceMonths } from 'src/modules/invoice/invoice-month-lock';
import { monthAfter } from 'src/modules/discount/discount.rules';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { PublicationConsentService } from 'src/modules/privacy/publication-consent.service';

/**
 * A child is born by today — on the school's clock, compared as day keys, like every other "has it
 * happened yet?" in the app. The office's form stopped a later day in its calendar and nothing
 * stopped it on the way in; the portal is a second door onto the same row (terms §6).
 */
function assertBornByToday(birthDate: string | undefined, now: Date): void {
    if (birthDate === undefined) return;
    const today = schoolDay(now);
    if (birthDate > today) {
        throw new BadRequestException({ message: `A birth date after today (${today}) is refused.`, error: 'BIRTH_DATE_IN_FUTURE' });
    }
}

@Injectable()
export class ChildService {
    public constructor(
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
        @InjectRepository(WaitlistEntry) private readonly waitlistRepository: Repository<WaitlistEntry>,
        private readonly enrollmentService: EnrollmentService,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
        private readonly publicationConsents: PublicationConsentService,
    ) {}

    async createChild(createChildDto: CreateChildDto, role: Role, userId: number, actor: Actor, now: Date = new Date()) {
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
        assertBornByToday(createChildDto.birthDate, now);
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
        return this.withGroupSince(await query.getMany());
    }

    /**
     * Each child with the first day of its place in its group: the start of the enrolment in force.
     *
     * The portal's attendance calendar painted every past class of the child's group without a mark
     * as "?" — "nemarcat de profesor" — including the months before the child joined, which is the
     * exact lie E12 fixed once already (QA of 27 September 2026: a trial booked for 29 September
     * showed four Septembers of question marks). `Child.group` says which group, never since when;
     * the enrolment says both. At most one row per child is in force (`UQ_enrollments_one_in_force`),
     * so one query answers the whole page.
     */
    private async withGroupSince(children: Child[]): Promise<(Child & { groupSince: string | null })[]> {
        const placed = children.filter((child) => child.group).map((child) => child.id);
        const rows = placed.length
            ? await this.enrollmentRepository.find({
                  where: { child: { id: In(placed) }, status: In([EnrollmentStatus.TRIAL, EnrollmentStatus.ACTIVE]) },
                  relations: { child: true },
                  select: { id: true, startDate: true, child: { id: true } },
              })
            : [];
        const since = new Map(rows.map((row) => [row.child.id, row.startDate]));
        return children.map((child) => Object.assign(child, { groupSince: since.get(child.id) ?? null }));
    }

    async updateChild(childId: number, updateChildDto: UpdateChildDto, role: Role, userId: number, actor: Actor, now: Date = new Date()) {
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
        assertBornByToday(updateChildDto.birthDate, now);

        // Which fields moved, never what they became — E07/S3. A child's name and date of birth are
        // held under the `account` retention rule and go when the family goes; this trail outlives
        // what it describes, so the values must not cross into it.
        const moved = changedFieldNames(child as unknown as Record<string, unknown>, updateChildDto as unknown as Record<string, unknown>);

        applyDefined(child, updateChildDto);
        const saved = await this.dataSource.transaction(async (manager) => {
            // The family relation is not the edit's to write: saved as read, it put a child the office
            // had just moved to another family back where it was (review of 27 September 2026).
            const family = child.parent;
            (child as { parent?: Profile }).parent = undefined;
            const written = await manager.save(Child, child);
            child.parent = family;
            written.parent = family;
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

        // A family removes a row it typed by mistake, not a child the school has a record of. Terms §5
        // leave enrolling, moving and withdrawing a child to the school, and deleting an enrolled child
        // from the portal did all three at once, through the cascade: the enrolment, its history and,
        // for a child on a list, the family's place in it. Asked first, because for a parent it is the
        // answer — the refusals below name the office's next step, which is not theirs to take.
        if (role !== Role.ADMIN) {
            if (await this.enrollmentRepository.exists({ where: { child: { id: childId } } })) {
                throw new ConflictException({
                    message: `Child ${childId} has an enrolment on file; only the office removes that child.`,
                    error: 'CHILD_HAS_ENROLMENTS',
                });
            }
            if (await this.waitlistRepository.exists({ where: { child: { id: childId } } })) {
                throw new ConflictException({
                    message: `Child ${childId} is on a waiting list; only the office removes that child.`,
                    error: 'CHILD_ON_WAITLIST',
                });
            }
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
            // A consent to publish the child's work goes with the child (`CASCADE`), so the office is
            // told in this transaction, as at an erasure: the platform publishes nothing itself, and
            // `/admin/acorduri` would simply stop listing a child whose drawing may still be up.
            await this.publicationConsents.announceErasure([childId], manager, 'odată cu ștergerea copilului din evidență');
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
            if (child.parent.id === profileId) {
                throw new BadRequestException({ message: 'The child is already in that family.', error: 'CHILD_ALREADY_IN_FAMILY' });
            }
            const sourceId = child.parent.id;

            // Review of 27 September 2026: everything below was checked on a snapshot. Issuing a
            // month that commits meanwhile would bill the old family for the child's sessions, the
            // split `CHILD_FAMILY_INVOICED` exists to refuse; an erasure would leave the child on an
            // emptied row. So the months the child can be billed for come first, then both families
            // — the order issuing takes them in (a month, then the family its invoice points at) —
            // and the rows are read again under them. `NO KEY UPDATE`, so an invoice being written
            // for one of the families elsewhere does not wait on this.
            await lockInvoiceMonths(manager, await this.billableMonthsOf(manager, childId));
            await manager.query('SELECT id FROM profiles WHERE id = ANY($1) ORDER BY id FOR NO KEY UPDATE', [[sourceId, profileId]]);

            const current = await manager.findOne(Child, { where: { id: childId }, relations: { parent: true } });
            if (!current || current.parent.id !== sourceId) {
                throw new ConflictException({ message: 'The child was moved meanwhile; reload the page.', error: 'CHILD_FAMILY_CHANGED' });
            }
            const target = await manager.findOne(Profile, { where: { id: profileId } });
            if (!target) throw new NotFoundException('Profile not found');
            assertNotErased(current.parent);
            assertNotErased(target);
            const invoiced = await manager.count(Invoice, { where: { parent: { id: sourceId } } });
            if (invoiced > 0) {
                throw new ConflictException({
                    message: `Family ${sourceId} has ${invoiced} invoice(s); its children are not moved to another family.`,
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
                    note: `copil mutat din familia ${sourceId} în familia ${target.id}`,
                },
                manager,
            );

            // E04/S5, as `enrol` does it: a family with a child in a group, or waiting for a seat,
            // has not left. The usual case is a family that withdrew and came back through `/proba`,
            // whose trial was confirmed on the booking's shell and is now moved home — left
            // withdrawn, the retention job would erase it on a term counted from the old withdrawal.
            if (target.withdrawnAt && (await this.stillComing(manager, childId))) {
                await manager.update(Profile, target.id, { withdrawnAt: null });
                await this.audit.record(
                    {
                        actor,
                        action: AuditAction.UPDATED,
                        entityType: 'Profile',
                        entityId: target.id,
                        changes: { withdrawnAt: { from: String(target.withdrawnAt).slice(0, 10), to: null } },
                        note: `retragere anulată: copilul ${childId} mutat în familie, cu o înscriere sau o cerere în vigoare`,
                    },
                    manager,
                );
                target.withdrawnAt = null;
            }
            return { ...current, parent: target };
        });
    }

    /**
     * Every month an invoice could count this child in: from its first enrolment to this month on
     * the school's clock. None without an enrolment — a child in no group is billed for nothing.
     */
    private async billableMonthsOf(manager: EntityManager, childId: number): Promise<string[]> {
        const [row] = await manager.query<{ first: string | null }[]>(
            'SELECT to_char(MIN("startDate"), \'YYYY-MM\') AS first FROM enrollments WHERE child_id = $1',
            [childId],
        );
        if (!row?.first) return [];
        const months: string[] = [];
        const last = schoolDay(new Date()).slice(0, 7);
        for (let month = row.first; month <= last; month = monthAfter(month)) months.push(month);
        return months;
    }

    /** Whether the child is in a group, on trial, or waiting for a seat. */
    private async stillComing(manager: EntityManager, childId: number): Promise<boolean> {
        const inForce = await manager.count(Enrollment, {
            where: { child: { id: childId }, status: In([EnrollmentStatus.TRIAL, EnrollmentStatus.ACTIVE]) },
        });
        if (inForce > 0) return true;
        const waiting = await manager.count(WaitlistEntry, {
            where: { child: { id: childId }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
        });
        return waiting > 0;
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
