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
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
import { composeWaitlistOffer } from './waitlist-mail';
import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

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

/**
 * Something an admin should see before enrolling, and may then decide is fine — E11/S6.
 *
 * Warnings, not blocks, and the line between the two is drawn on purpose: these are the things an
 * admin can be **right about against the system**. A ten-and-a-half-year-old ready for an 11–14
 * group is a judgement about a child; an eleventh chair in a room of ten is not a judgement at all,
 * which is why capacity refuses outright and this only asks.
 */
export interface CompatibilityWarning {
    code: string;
    message: string;
}

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
        private readonly leadProgress: LeadProgressService,
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
            acknowledgeWarnings?: boolean;
        },
        // `null` when nothing signed in did this — the public trial form of E20/S2. It is used only
        // to name somebody in the over-capacity warning, and a booking from the form can never take
        // that branch, so the honest value is "nobody" rather than a placeholder id.
        actingUserId: number | null,
        // Passed when the caller is already in a transaction and the enrolment has to stand or fall
        // with the rest of it — booking a trial writes a profile, a child, this, and a message, and
        // a seat taken by a booking that then failed is a seat nobody can find their way back to.
        manager?: EntityManager,
    ): Promise<Enrollment> {
        const status = input.status ?? EnrollmentStatus.ACTIVE;
        if (!isInForce(status)) {
            throw new BadRequestException({
                message: 'O înscriere nouă poate fi doar activă sau de probă',
                error: 'ENROLLMENT_STATUS_NOT_OPENABLE',
            });
        }

        return manager
            ? this.enrolWithin(manager, input, status, actingUserId)
            : this.dataSource.transaction((tx) => this.enrolWithin(tx, input, status, actingUserId));
    }

    private async enrolWithin(
        manager: EntityManager,
        input: {
            childId: number;
            groupId: number;
            startDate?: string;
            contractSignedAt?: string | null;
            allowOverCapacity?: boolean;
            acknowledgeWarnings?: boolean;
        },
        status: EnrollmentStatus,
        actingUserId: number | null,
    ): Promise<Enrollment> {
        const child = await manager.getRepository(Child).findOne({
            where: { id: input.childId },
            relations: { parent: { user: true } },
        });
        if (!child) {
            throw new NotFoundException('Child not found');
        }

        const group = await this.lockGroup(manager, input.groupId);

        this.assertParentAccountActive(child);
        await this.assertNotAlreadyEnrolled(input.childId, manager);
        if (!group.isActive) {
            throw new ConflictException({
                message: 'Grupa este inactivă și nu poate primi înscrieri noi',
                error: 'GROUP_INACTIVE',
            });
        }
        await this.assertRoomForOneMore(group, manager, input.allowOverCapacity === true, actingUserId);
        this.assertCompatible(child, group, input.acknowledgeWarnings === true);

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
    }

    /**
     * Loads a group and holds its row until the transaction ends.
     *
     * Capacity is checked by counting and then inserting, which two transactions can do at the same
     * time and both find room — the check is not the guarantee, it is only the reason the refusal
     * has words in it. Locking the group serialises everybody who wants a seat in it, which is what
     * D7 actually claims. It matters more since E20/S2: an admin clicking twice is rare, two parents
     * on the public form at 20:00 is not.
     *
     * Only the group being joined is locked, never the one being left, so two transfers in opposite
     * directions cannot wait on each other.
     */
    private async lockGroup(manager: EntityManager, groupId: number): Promise<Group> {
        const group = await manager.getRepository(Group).findOne({ where: { id: groupId }, lock: { mode: 'pessimistic_write' } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
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

    /**
     * Moves a child to another group — E11/S5, and the **only** way a child changes group.
     *
     * D6 forbids a second enrolment in force, so the order is not a detail: the old one closes and
     * the new one opens inside a single transaction. Either way round without the transaction gives
     * you two live enrolments or a child with none, and at capacity it gives you a seat that frees
     * before the transfer completes — long enough for somebody on the waiting list to be offered it.
     *
     * The freed seat is deliberately **not** offered to the queue here. It is not free: it is being
     * handed to this child, and the queue is asked only when a seat genuinely leaves the group.
     */
    async transfer(
        input: { childId: number; toGroupId: number; reason?: string; allowOverCapacity?: boolean; acknowledgeWarnings?: boolean },
        actingUserId: number,
    ): Promise<Enrollment> {
        return this.dataSource.transaction(async (manager) => {
            const current = await this.inForceFor(input.childId, manager);
            if (!current) {
                throw new ConflictException({
                    message: 'Copilul nu are o înscriere în vigoare, deci nu are de unde fi transferat. Înscrie-l direct.',
                    error: 'NOTHING_TO_TRANSFER',
                });
            }
            if (current.group.id === input.toGroupId) {
                throw new ConflictException({
                    message: 'Copilul este deja în această grupă',
                    error: 'ALREADY_IN_GROUP',
                });
            }

            const child = await manager.getRepository(Child).findOne({ where: { id: input.childId }, relations: { parent: { user: true } } });
            if (!child) {
                throw new NotFoundException('Child not found');
            }
            const target = await this.lockGroup(manager, input.toGroupId);

            this.assertParentAccountActive(child);
            if (!target.isActive) {
                throw new ConflictException({ message: 'Grupa este inactivă și nu poate primi înscrieri noi', error: 'GROUP_INACTIVE' });
            }
            await this.assertRoomForOneMore(target, manager, input.allowOverCapacity === true, actingUserId);
            this.assertCompatible(child, target, input.acknowledgeWarnings === true);

            const now = today();
            await manager.update(
                Enrollment,
                { id: current.id },
                { status: EnrollmentStatus.TRANSFERRED, endDate: now, exitReason: input.reason ?? `Transfer în grupa ${target.name}` },
            );

            const opened = await manager.save(Enrollment, {
                child: { id: input.childId } as Child,
                group: { id: input.toGroupId } as Group,
                // A transfer carries the status across: a trial that moves group is still a trial,
                // and promoting it to active here would enrol a family that has not decided yet.
                status: current.status,
                startDate: now,
                endDate: null,
                exitReason: null,
                contractSignedAt: current.contractSignedAt,
            });

            await this.syncDerivedGroup(input.childId, manager);

            this.logger.log(`Child ${input.childId} transferred from group ${current.group.id} to ${input.toGroupId}.`);
            return opened;
        });
    }

    /**
     * Turns a trial into a real enrolment, or closes it — E11/S4.
     *
     * A trial that is never resolved holds a seat for ever, which is why E20's "trials held, no
     * decision" list is not only a commercial tool but the thing that keeps capacity honest.
     * Accepting keeps the same seat and the same row, so the history reads as one continuous
     * period rather than two adjacent ones.
     */
    async resolveTrial(enrollmentId: number, input: { accepted: boolean; reason?: string; contractSignedAt?: string }): Promise<Enrollment> {
        return this.dataSource.transaction(async (manager) => {
            const trial = await manager.getRepository(Enrollment).findOne({ where: { id: enrollmentId }, relations: { child: true, group: true } });
            if (!trial) {
                throw new NotFoundException('Enrollment not found');
            }
            if (trial.status !== EnrollmentStatus.TRIAL) {
                throw new ConflictException({
                    message: 'Doar o înscriere de probă poate fi confirmată sau închisă în felul acesta',
                    error: 'NOT_A_TRIAL',
                });
            }

            if (input.accepted) {
                await manager.update(
                    Enrollment,
                    { id: enrollmentId },
                    { status: EnrollmentStatus.ACTIVE, contractSignedAt: input.contractSignedAt ?? trial.contractSignedAt },
                );
                this.logger.log(`Trial ${enrollmentId} became an active enrolment.`);
                // In the same transaction: the lead records the decision E11 just made, and one of
                // the two happening without the other is exactly what S4's numbers cannot survive.
                await this.leadProgress.settleForEnrollment(enrollmentId, { enrolled: true }, new Date(), manager);
            } else {
                await manager.update(
                    Enrollment,
                    { id: enrollmentId },
                    { status: EnrollmentStatus.WITHDRAWN, endDate: today(), exitReason: input.reason ?? 'Proba nu s-a transformat în înscriere' },
                );
                await this.syncDerivedGroup(trial.child.id, manager);
                // Only here is the seat genuinely leaving the group, so only here is the queue asked.
                await this.offerFreedSeat(trial.group.id, manager);
                await this.leadProgress.settleForEnrollment(enrollmentId, { enrolled: false, reason: input.reason ?? null }, new Date(), manager);
                this.logger.log(`Trial ${enrollmentId} closed; seat in group ${trial.group.id} released.`);
            }

            return manager.getRepository(Enrollment).findOneOrFail({ where: { id: enrollmentId }, relations: { group: true } });
        });
    }

    /**
     * Trials that have been sitting there without a decision — E11/S4, and the mechanism behind
     * D5's promise that a free trial does not quietly cost a seat for ever.
     */
    async unresolvedTrials(olderThanDays = 0): Promise<Enrollment[]> {
        const cutoff = toIsoDate(addDays(parseIsoDate(today()), -olderThanDays));
        return this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoinAndSelect('enrollment.group', 'group')
            .leftJoin('enrollment.child', 'child')
            .addSelect(['child.id', 'child.firstName', 'child.lastName'])
            .where('enrollment.status = :status', { status: EnrollmentStatus.TRIAL })
            .andWhere('enrollment.startDate <= :cutoff', { cutoff })
            .orderBy('enrollment.startDate', 'ASC')
            .getMany();
    }

    /**
     * Where the unmet demand is — E11/S7.
     *
     * Buckets the children nobody has placed by age and by location, so "do I have enough children
     * for a new Scratch group at Titan?" stops being a question somebody answers by reading two
     * lists side by side. Demand is the waiting list plus the children with no group at all; the
     * second half matters because a child registered and never placed is demand nobody wrote down.
     *
     * **Teacher availability is not considered.** That is E09, and there is no `TEACHER` role yet —
     * the epic asks for it and this is the half that can be built today. Free rooms are visible on
     * `/admin/locations` rather than duplicated here.
     */
    async unmetDemand(): Promise<
        { locationId: number | null; locationName: string; ageBand: string; children: { id: number; firstName: string; lastName: string; age: number }[] }[]
    > {
        const waiting = await this.waitlistRepository
            .createQueryBuilder('entry')
            .leftJoin('entry.child', 'child')
            .addSelect(['child.id', 'child.firstName', 'child.lastName', 'child.birthDate'])
            .leftJoin('entry.group', 'group')
            .addSelect(['group.id'])
            .leftJoin('group.room', 'room')
            .addSelect(['room.id'])
            .leftJoin('room.location', 'location')
            // Every step of the chain has to be selected, not only the last: without `group.id` and
            // `room.id` the relation objects come back undefined and every child lands in the
            // "no location preference" bucket, silently.
            .addSelect(['location.id', 'location.name'])
            .where('entry.status = :status', { status: WaitlistStatus.WAITING })
            .getMany();

        const unplaced = await this.childRepository
            .createQueryBuilder('child')
            .where('child.group_id IS NULL')
            .andWhere((qb) => {
                // Children with no group *and* no enrolment in force. A child mid-trial has a group,
                // so they are excluded already; this guards the case where the derived column and
                // the table could ever disagree.
                const sub = qb
                    .subQuery()
                    .select('1')
                    .from(Enrollment, 'enrollment')
                    .where('enrollment.child_id = child.id')
                    .andWhere('enrollment.status IN (:...inForce)', { inForce: [...IN_FORCE_STATUSES] })
                    .getQuery();
                return `NOT EXISTS ${sub}`;
            })
            .getMany();

        const buckets = new Map<
            string,
            {
                locationId: number | null;
                locationName: string;
                ageBand: string;
                children: Map<number, { id: number; firstName: string; lastName: string; age: number }>;
            }
        >();

        const add = (child: { id: number; firstName: string; lastName: string; birthDate: Date | string }, locationId: number | null, locationName: string) => {
            const age = ageOf(child.birthDate);
            const ageBand = bandFor(age);
            const key = `${locationId ?? 'any'}|${ageBand}`;
            if (!buckets.has(key)) {
                buckets.set(key, { locationId, locationName, ageBand, children: new Map() });
            }
            buckets.get(key)?.children.set(child.id, { id: child.id, firstName: child.firstName, lastName: child.lastName, age });
        };

        const queued = new Set<number>();
        for (const entry of waiting) {
            const location = entry.group?.room?.location;
            queued.add(entry.child.id);
            add(entry.child, location?.id ?? null, location?.name ?? 'Locație nespecificată');
        }
        for (const child of unplaced) {
            // A child already counted through a waiting list is not *also* demand with no
            // preference: they have said where they want to go. Counting them twice made the same
            // name appear in two buckets and inflated every total on the screen.
            if (queued.has(child.id)) continue;
            add(child, null, 'Fără preferință de locație');
        }

        return [...buckets.values()]
            .map((bucket) => ({ ...bucket, children: [...bucket.children.values()].sort((a, b) => a.age - b.age) }))
            .sort((a, b) => b.children.length - a.children.length);
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
    private async assertRoomForOneMore(group: Group, manager: EntityManager, allowOverCapacity: boolean, actingUserId: number | null): Promise<void> {
        const taken = await this.countInForce(group.id, manager);
        if (taken < group.capacity) {
            return;
        }

        if (allowOverCapacity) {
            this.logger.warn(
                `${actingUserId === null ? 'The public trial form' : `User ${actingUserId}`} enrolled over capacity in group ${group.id}: ${taken + 1} children in ${group.capacity} seats. No audit record was written — see E06.`,
            );
            return;
        }

        throw new ConflictException({
            message: `Grupa este plină: ${taken} din ${group.capacity} locuri, inclusiv probele programate. Poți pune copilul pe lista de așteptare.`,
            error: 'GROUP_FULL',
        });
    }

    /**
     * The soft checks — E11/S6. Refuses once, with the warnings named, and accepts on the retry.
     *
     * Two-step rather than a silent pass, because "warning" has to mean something: an admin who
     * enrols a seven-year-old in an 11–14 group should have had to see that and say yes. A message
     * logged where nobody reads it would be the same as no check.
     *
     * Module prerequisites are the other half of this story and are **not** here: E10 is out of
     * scope, so there is no catalogue to have prerequisites in. They join this same list on the day
     * one exists — the shape is ready for them.
     */
    private assertCompatible(child: Child, group: Group, acknowledged: boolean): void {
        const warnings = compatibilityWarnings(child, group);
        if (warnings.length === 0 || acknowledged) {
            return;
        }

        throw new ConflictException({
            message: warnings.map((warning) => warning.message).join(' '),
            error: 'COMPATIBILITY_WARNINGS',
            details: warnings,
        });
    }

    /** The same checks, without throwing — for a screen that wants to warn before the button. */
    warningsFor(child: Child, group: Group): CompatibilityWarning[] {
        return compatibilityWarnings(child, group);
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

/**
 * Age in whole years, as of today. `Group.minAge` and `maxAge` are integers, so this is too.
 *
 * A `date` column arrives as a string from the driver and as a `Date` from an in-memory entity, and
 * both reach here.
 */
export function ageOf(birthDate: Date | string, now: Date = new Date()): number {
    const born = typeof birthDate === 'string' ? parseIsoDate(birthDate.slice(0, 10)) : birthDate;
    let age = now.getFullYear() - born.getFullYear();
    const monthDelta = now.getMonth() - born.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
        age -= 1;
    }
    return age;
}

/**
 * The bands the school actually teaches in, from `apps/web/shared/courses.ts`.
 *
 * Copied rather than imported — `apps/api` does not depend on `apps/web` — and used only to group
 * unmet demand into rows an admin can act on. A child two years outside every band still lands in
 * the nearest one rather than vanishing from the screen.
 */
export function bandFor(age: number): string {
    if (age <= 8) return '6–8 ani';
    if (age <= 10) return '9–10 ani';
    if (age <= 12) return '11–12 ani';
    if (age <= 14) return '13–14 ani';
    return '15+ ani';
}

/** The soft checks of E11/S6, as a plain function so a screen can ask without a service. */
export function compatibilityWarnings(child: Pick<Child, 'birthDate'>, group: Pick<Group, 'minAge' | 'maxAge' | 'name'>): CompatibilityWarning[] {
    const warnings: CompatibilityWarning[] = [];
    const age = ageOf(child.birthDate);

    if (age < group.minAge) {
        warnings.push({
            code: 'AGE_BELOW_GROUP',
            message: `Copilul are ${age} ani, iar grupa „${group.name}" este pentru ${group.minAge}-${group.maxAge} ani.`,
        });
    } else if (age > group.maxAge) {
        warnings.push({
            code: 'AGE_ABOVE_GROUP',
            message: `Copilul are ${age} ani, iar grupa „${group.name}" este pentru ${group.minAge}-${group.maxAge} ani.`,
        });
    }

    return warnings;
}

/** Today, as `YYYY-MM-DD`. A `date` column wants a date, and the school's day is the calendar's. */
function today(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Exported for the tests, which should not have to reimplement it to assert a default. */
export { today as schoolToday, IsNull };
