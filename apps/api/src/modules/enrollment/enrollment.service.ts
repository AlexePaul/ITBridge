import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { EnrollmentStatus, IN_FORCE_STATUSES, isInForce } from 'src/enum/enrollment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { isAccountActive } from 'src/entities/user.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { composeWaitlistOffer } from './waitlist-mail';

/**
 * Everything that decides where a child sits — E11/S1 and S3.
 *
 * Three rules live here, and they are the whole story:
 *
 *  1. **A child has at most one enrolment in force** (D6). `TRIAL` counts.
 *  2. **A group holds no more children than the room has seats** (D7). `TRIAL` counts here too: a
 *     trial child sits on a chair, at a computer, in the same room.
 *  3. **`Child.group` is a consequence, never an input.** It is written only from here, in the same
 *     transaction as the enrolment that justifies it.
 *
 * The first two are checked before writing so the refusal carries a reason, and the first is *also*
 * a partial unique index, because two admins clicking at the same second is not a case any amount
 * of checking in application code can cover.
 */

/**
 * How long somebody has to answer an offered seat.
 *
 * E11 left this as an open question and it still is — 48 hours is a working assumption, not a
 * decision by the school. It is a constant rather than a config value because changing it should be
 * a deliberate edit somebody argues about, not a knob. Two working days is long enough for a parent
 * who checks mail in the evening and short enough that the next family on the list is not left
 * waiting on somebody who has stopped caring.
 */
export const WAITLIST_RESPONSE_HOURS = 48;

export interface GroupOccupancy {
    groupId: number;
    capacity: number;
    /** Enrolments in force — active plus trials booked. Never just the first. */
    taken: number;
    free: number;
    waiting: number;
}

@Injectable()
export class EnrollmentService {
    private readonly logger = new Logger('Enrollment');

    constructor(
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
        @InjectRepository(WaitlistEntry) private readonly waitlistRepository: Repository<WaitlistEntry>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        private readonly outbox: OutboxService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    // ---- reading ---------------------------------------------------------------------------

    /**
     * The whole history of one child, newest first.
     *
     * This is the endpoint that answers "which group was this child in last October" — the question
     * S1 exists for, and the one the old single foreign key could not answer at all.
     */
    async historyFor(childId: number): Promise<Enrollment[]> {
        return this.enrollmentRepository.find({
            where: { child: { id: childId } },
            relations: { group: { room: { location: true } } },
            order: { startDate: 'DESC', id: 'DESC' },
        });
    }

    /** The one enrolment in force for a child, or `null`. At most one exists, by D6. */
    async inForceFor(childId: number, manager?: EntityManager): Promise<Enrollment | null> {
        const repository = manager ? manager.getRepository(Enrollment) : this.enrollmentRepository;
        return repository.findOne({
            where: { child: { id: childId }, status: In([...IN_FORCE_STATUSES]) },
            relations: { group: true },
        });
    }

    /** Who was in a group on a given day — enrolments whose period covers that date. */
    async membersOn(groupId: number, date: string): Promise<Enrollment[]> {
        return this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoinAndSelect('enrollment.child', 'child')
            .where('enrollment.group_id = :groupId', { groupId })
            .andWhere('enrollment.startDate <= :date', { date })
            .andWhere('(enrollment.endDate IS NULL OR enrollment.endDate >= :date)', { date })
            .orderBy('child.lastName', 'ASC')
            .addOrderBy('child.firstName', 'ASC')
            .getMany();
    }

    /**
     * Seats taken and free, for one group.
     *
     * The number that matters anywhere capacity is checked or displayed is **enrolments in force**,
     * which is active plus trials booked and not yet resolved — never just the active ones. A group
     * of ten with nine enrolled and one trial is full, and offering an eleventh seat because the
     * trial "is not a real enrolment" is how a child ends up standing.
     */
    async occupancyOf(groupId: number, manager?: EntityManager): Promise<GroupOccupancy> {
        const repository = manager ? manager.getRepository(Group) : this.groupRepository;
        const group = await repository.findOne({ where: { id: groupId } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        const taken = await this.countInForce(groupId, manager);
        const waiting = await (manager ? manager.getRepository(WaitlistEntry) : this.waitlistRepository).count({
            where: { group: { id: groupId }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
        });

        return { groupId, capacity: group.capacity, taken, free: Math.max(0, group.capacity - taken), waiting };
    }

    private async countInForce(groupId: number, manager?: EntityManager): Promise<number> {
        const repository = manager ? manager.getRepository(Enrollment) : this.enrollmentRepository;
        return repository.count({ where: { group: { id: groupId }, status: In([...IN_FORCE_STATUSES]) } });
    }

    // ---- writing ---------------------------------------------------------------------------

    /**
     * Enrols a child, as a trial or for real.
     *
     * `allowOverCapacity` is the explicit exception S3 grants an admin. It is a separate field
     * rather than a default because the seat is physical — S6 calls capacity a hard block precisely
     * because "an eleventh chair in a room of ten" is not a judgement an admin can be right about,
     * unlike a child's age. So it cannot happen by accident, and when it does happen it is written
     * down.
     *
     * **The audit trail S3 asks for does not exist yet.** What an override leaves behind today is a
     * warning in the log naming the group and the admin. The audit log itself is E06; until then
     * this is the honest half of the promise, not the whole of it.
     */
    async enrol(
        input: {
            childId: number;
            groupId: number;
            status?: EnrollmentStatus;
            startDate?: string;
            contractSignedAt?: string | null;
            allowOverCapacity?: boolean;
        },
        actingUserId: number,
    ): Promise<Enrollment> {
        const status = input.status ?? EnrollmentStatus.ACTIVE;
        if (!isInForce(status)) {
            throw new BadRequestException({
                message: 'O înscriere nouă poate fi doar activă sau de probă',
                error: 'ENROLLMENT_STATUS_NOT_OPENABLE',
            });
        }

        return this.dataSource.transaction(async (manager) => {
            const child = await manager.getRepository(Child).findOne({
                where: { id: input.childId },
                relations: { parent: { user: true } },
            });
            if (!child) {
                throw new NotFoundException('Child not found');
            }

            const group = await manager.getRepository(Group).findOne({ where: { id: input.groupId } });
            if (!group) {
                throw new NotFoundException('Group not found');
            }

            this.assertParentAccountActive(child);
            await this.assertNotAlreadyEnrolled(input.childId, manager);
            if (!group.isActive) {
                throw new ConflictException({
                    message: 'Grupa este inactivă și nu poate primi înscrieri noi',
                    error: 'GROUP_INACTIVE',
                });
            }
            await this.assertRoomForOneMore(group, manager, input.allowOverCapacity === true, actingUserId);

            const enrollment = await manager.save(Enrollment, {
                child: { id: input.childId } as Child,
                group: { id: input.groupId } as Group,
                status,
                startDate: input.startDate ?? today(),
                endDate: null,
                exitReason: null,
                contractSignedAt: input.contractSignedAt ?? null,
            });

            await this.syncDerivedGroup(input.childId, manager);

            // Being enrolled settles any request this child had for this group. Left open, the
            // family would keep a place in a queue for a seat they are already sitting in.
            await manager
                .getRepository(WaitlistEntry)
                .update(
                    { child: { id: input.childId }, group: { id: input.groupId }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
                    { status: WaitlistStatus.ACCEPTED },
                );

            this.logger.log(`Child ${input.childId} enrolled in group ${input.groupId} as ${status}.`);
            return enrollment;
        });
    }

    /**
     * Closes an enrolment and frees the seat.
     *
     * The freed seat is offered to the first family waiting, in the same transaction — S3's
     * acceptance asks for the notification within a minute, and a queue written alongside the
     * release is the only version of that which survives the process dying in between.
     */
    async close(enrollmentId: number, input: { status: EnrollmentStatus; exitReason?: string; endDate?: string }): Promise<Enrollment> {
        if (isInForce(input.status)) {
            throw new BadRequestException({
                message: 'O înscriere se închide ca încheiată, abandonată sau transferată',
                error: 'ENROLLMENT_STATUS_NOT_CLOSING',
            });
        }

        return this.dataSource.transaction(async (manager) => {
            const enrollment = await manager.getRepository(Enrollment).findOne({
                where: { id: enrollmentId },
                relations: { child: true, group: true },
            });
            if (!enrollment) {
                throw new NotFoundException('Enrollment not found');
            }
            if (!isInForce(enrollment.status)) {
                throw new ConflictException({
                    message: 'Înscrierea este deja închisă',
                    error: 'ENROLLMENT_ALREADY_CLOSED',
                });
            }

            await manager.update(
                Enrollment,
                { id: enrollmentId },
                { status: input.status, endDate: input.endDate ?? today(), exitReason: input.exitReason ?? null },
            );

            await this.syncDerivedGroup(enrollment.child.id, manager);
            await this.offerFreedSeat(enrollment.group.id, manager);

            this.logger.log(`Enrollment ${enrollmentId} closed as ${input.status}; seat in group ${enrollment.group.id} released.`);
            return manager.getRepository(Enrollment).findOneOrFail({ where: { id: enrollmentId }, relations: { group: true } });
        });
    }

    // ---- the waiting list ------------------------------------------------------------------

    /**
     * The open queue for a group, in the order people asked.
     *
     * The columns are listed explicitly rather than pulling the whole `Profile` along. A plain
     * `relations: { child: { parent: true } }` shipped every family's home address, phone number and
     * emergency contact to a screen that shows a name and a note — admin-only, so not a breach, but
     * personal data on the wire and in logs for no reason anybody could name. E07 asks for the
     * opposite habit.
     */
    async waitlistFor(groupId: number): Promise<WaitlistEntry[]> {
        return this.waitlistRepository
            .createQueryBuilder('entry')
            .leftJoin('entry.child', 'child')
            .addSelect(['child.id', 'child.firstName', 'child.lastName'])
            .where('entry.group_id = :groupId', { groupId })
            .andWhere('entry.status IN (:...statuses)', { statuses: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] })
            .orderBy('entry.createdAt', 'ASC')
            .addOrderBy('entry.id', 'ASC')
            .getMany();
    }

    /**
     * Puts a child on a group's list.
     *
     * Allowed even when the group has room, and deliberately so: an admin taking a phone call should
     * not have to check a number first, and a seat that is free right now is filled by enrolling,
     * which the same screen offers. What is refused is a duplicate — the unique index means a family
     * that calls twice finds itself already on the list rather than twice on it, ahead of people who
     * called once.
     */
    async addToWaitlist(input: { childId: number; groupId: number; note?: string }): Promise<WaitlistEntry> {
        const child = await this.childRepository.findOne({ where: { id: input.childId } });
        if (!child) {
            throw new NotFoundException('Child not found');
        }
        const group = await this.groupRepository.findOne({ where: { id: input.groupId } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        const open = await this.waitlistRepository.findOne({
            where: {
                child: { id: input.childId },
                group: { id: input.groupId },
                status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]),
            },
        });
        if (open) {
            throw new ConflictException({
                message: 'Copilul este deja pe lista de așteptare a acestei grupe',
                error: 'ALREADY_ON_WAITLIST',
            });
        }

        return this.waitlistRepository.save(
            this.waitlistRepository.create({
                child: { id: input.childId } as Child,
                group: { id: input.groupId } as Group,
                status: WaitlistStatus.WAITING,
                note: input.note ?? null,
                offeredAt: null,
                respondBy: null,
            }),
        );
    }

    /** Takes an entry off the list, whatever state it was in. */
    async removeFromWaitlist(entryId: number, status: WaitlistStatus = WaitlistStatus.CANCELLED): Promise<{ message: string }> {
        const entry = await this.waitlistRepository.findOne({ where: { id: entryId }, relations: { group: true } });
        if (!entry) {
            throw new NotFoundException('Waitlist entry not found');
        }

        await this.dataSource.transaction(async (manager) => {
            await manager.update(WaitlistEntry, { id: entryId }, { status });
            // A declined or expired offer hands the seat straight to the next family, rather than
            // leaving it held by nobody until an admin notices.
            if (entry.status === WaitlistStatus.OFFERED) {
                await this.offerFreedSeat(entry.group.id, manager);
            }
        });

        return { message: 'Cererea a fost scoasă de pe listă' };
    }

    /**
     * Offers a free seat to the first family waiting, if there is one of each.
     *
     * Called from inside the transaction that freed the seat, so the offer and the release commit
     * together. Offers exactly one seat per call: two seats freed means two calls, and a loop here
     * would be a promise made to a second family on the strength of a number read once.
     */
    private async offerFreedSeat(groupId: number, manager: EntityManager): Promise<void> {
        const occupancy = await this.occupancyOf(groupId, manager);
        if (occupancy.free <= 0) {
            return;
        }

        const next = await manager.getRepository(WaitlistEntry).findOne({
            where: { group: { id: groupId }, status: WaitlistStatus.WAITING },
            relations: { child: { parent: true }, group: true },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
        if (!next) {
            return;
        }

        const now = new Date();
        const respondBy = new Date(now.getTime() + WAITLIST_RESPONSE_HOURS * 60 * 60 * 1000);
        await manager.update(WaitlistEntry, { id: next.id }, { status: WaitlistStatus.OFFERED, offeredAt: now, respondBy });

        const email = next.child.parent?.email;
        if (!email) {
            // The seat is still offered and the clock still runs; somebody has to phone. Logged
            // rather than silent, because "the family was never told" is otherwise
            // indistinguishable from a queue that is stuck.
            this.logger.warn(`Offered a seat in group ${groupId} to waitlist entry ${next.id}, which has no email address on file.`);
            return;
        }

        const mail = composeWaitlistOffer(next.child.firstName, next.group.name, respondBy);
        await this.outbox.queue({ to: email, subject: mail.subject, bodyText: mail.bodyText }, manager);
        this.logger.log(`Offered the freed seat in group ${groupId} to waitlist entry ${next.id}.`);
    }

    // ---- the three rules -------------------------------------------------------------------

    /** E11/S2's gate, at the point where it changes an outcome. */
    private assertParentAccountActive(child: Child): void {
        const account = child.parent?.user;
        if (account && !isAccountActive(account)) {
            throw new ConflictException({
                message: 'Contul părintelui nu este activ. Trebuie confirmat prin email și aprobat înainte de înscriere.',
                error: 'PARENT_ACCOUNT_NOT_ACTIVE',
            });
        }
    }

    /** D6, checked before writing so the refusal names the group the child is already in. */
    private async assertNotAlreadyEnrolled(childId: number, manager: EntityManager): Promise<void> {
        const existing = await this.inForceFor(childId, manager);
        if (existing) {
            throw new ConflictException({
                message: `Copilul are deja o înscriere în vigoare, în grupa „${existing.group.name}". Fă un transfer, nu o a doua înscriere.`,
                error: 'CHILD_ALREADY_ENROLLED',
            });
        }
    }

    /** D7, counting trials. The message offers the list, because that is the next thing to do. */
    private async assertRoomForOneMore(group: Group, manager: EntityManager, allowOverCapacity: boolean, actingUserId: number): Promise<void> {
        const taken = await this.countInForce(group.id, manager);
        if (taken < group.capacity) {
            return;
        }

        if (allowOverCapacity) {
            this.logger.warn(
                `User ${actingUserId} enrolled over capacity in group ${group.id}: ${taken + 1} children in ${group.capacity} seats. No audit record was written — see E06.`,
            );
            return;
        }

        throw new ConflictException({
            message: `Grupa este plină: ${taken} din ${group.capacity} locuri, inclusiv probele programate. Poți pune copilul pe lista de așteptare.`,
            error: 'GROUP_FULL',
        });
    }

    /**
     * Makes `Child.group` say what the enrolments say.
     *
     * The one place that writes it. Six queries still read the column — including the parent's
     * timetable scoping and who may be marked present — so it has to keep being true; making it a
     * consequence of this table, rather than a second fact typed in beside it, is what keeps it so.
     */
    private async syncDerivedGroup(childId: number, manager: EntityManager): Promise<void> {
        const inForce = await this.inForceFor(childId, manager);
        await manager.update(Child, { id: childId }, { group: inForce ? { id: inForce.group.id } : null });
    }
}

/** Today, as `YYYY-MM-DD`. A `date` column wants a date, and the school's day is the calendar's. */
function today(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Exported for the tests, which should not have to reimplement it to assert a default. */
export { today as schoolToday, IsNull };
