import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { romanianDayAndDate } from 'src/modules/mail/romanian-date';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { EnrollmentStatus, IN_FORCE_STATUSES, isInForce } from 'src/enum/enrollment-status.enum';
import { AuditAction } from 'src/enum/audit-action.enum';
import { WaitlistStatus, type WaitlistClosingStatus } from 'src/enum/waitlist-status.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { isAccountActive } from 'src/entities/user.entity';
import { Profile, isProfileComplete } from 'src/entities/profile.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { SYSTEM_ACTOR } from 'src/modules/audit/actor';
import { composeWaitlistOffer, composeWaitlistOfferExpired } from './waitlist-mail';
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

/**
 * The least a class has to say about itself for its seats to be counted.
 *
 * `room` is the room the class is actually in, which a move can change for one class without
 * changing the group's (E12/S5). Its seats bound the class as surely as the group's capacity does.
 */
export interface SeatedSession {
    id: number;
    group: { id: number; capacity: number };
    room?: { capacity: number } | null;
}

export interface GroupOccupancy {
    groupId: number;
    capacity: number;
    /** Enrolments in force — active plus trials booked. Never just the first. */
    taken: number;
    /** Seats offered to the waiting list and not yet answered: promised, so not free. */
    held: number;
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
        @InjectRepository(AbsenceNotice) private readonly absenceNoticeRepository: Repository<AbsenceNotice>,
        private readonly outbox: OutboxService,
        private readonly leadProgress: LeadProgressService,
        private readonly audit: AuditService,
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

    /**
     * Who was in a group on a given day — enrolments whose period covers that date.
     *
     * The day a row ended is not one of them: `close` takes the child off the register at once, so a
     * child withdrawn this morning is not in this evening's group, and the roster said they were.
     */
    async membersOn(groupId: number, date: string): Promise<Enrollment[]> {
        return this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoinAndSelect('enrollment.child', 'child')
            .where('enrollment.group_id = :groupId', { groupId })
            .andWhere('enrollment.startDate <= :date', { date })
            .andWhere('(enrollment.endDate IS NULL OR enrollment.endDate > :date)', { date })
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
     *
     * **And a seat offered to the waiting list is not free either** (`held`). For the 48 hours the
     * family has to answer, every count here left it out: the public form sold it as a trial, an
     * admin enrolled another child into it, and the family that said yes met `GROUP_FULL` — the one
     * outcome the list exists to prevent. `taken` stays the enrolments, so a screen can still tell a
     * trial from a promise; `free` is what is left after both.
     */
    async occupancyOf(groupId: number, manager?: EntityManager): Promise<GroupOccupancy> {
        const repository = manager ? manager.getRepository(Group) : this.groupRepository;
        const group = await repository.findOne({ where: { id: groupId } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        const taken = await this.countInForce(groupId, manager);
        const held = await this.countHeld(groupId, manager);
        const waiting = await (manager ? manager.getRepository(WaitlistEntry) : this.waitlistRepository).count({
            where: { group: { id: groupId }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
        });

        return { groupId, capacity: group.capacity, taken, held, free: Math.max(0, group.capacity - taken - held), waiting };
    }

    /**
     * Seats free at **one class**, which is not the same question as seats free in the group.
     *
     * A group's headroom is enrolments in force against capacity. A single class can be tighter than
     * that: a child sitting in on a make-up occupies a chair at a computer for that hour without
     * being enrolled in anything (E12/S4, and D7 again). So a group with one place left may have
     * none at all next Monday and one the Monday after.
     *
     * It lives here, beside `occupancyOf`, because both answer "is there room" and D7 must have one
     * owner: `ReplacementService` asked it first and now delegates, and E20/S2's public booking form
     * asks it too — three callers, one definition. Batched over a list of sessions because the
     * booking form asks about every hour it is about to offer, and a query per session is how a
     * public page becomes slow.
     */
    async freeSeatsAtSessions(sessions: SeatedSession[], manager?: EntityManager): Promise<Map<number, number>> {
        const free = new Map<number, number>();
        if (sessions.length === 0) return free;

        const enrollmentRepository = manager ? manager.getRepository(Enrollment) : this.enrollmentRepository;
        const noticeRepository = manager ? manager.getRepository(AbsenceNotice) : this.absenceNoticeRepository;

        const groupIds = [...new Set(sessions.map((session) => session.group.id))];
        const sessionIds = sessions.map((session) => session.id);

        const enrolledRows = await enrollmentRepository
            .createQueryBuilder('enrollment')
            .select('enrollment.group_id', 'groupId')
            .addSelect('COUNT(*)::int', 'count')
            .where('enrollment.group_id IN (:...groupIds)', { groupIds })
            .andWhere('enrollment.status IN (:...inForce)', { inForce: [...IN_FORCE_STATUSES] })
            .groupBy('enrollment.group_id')
            .getRawMany<{ groupId: number; count: number }>();

        // Visitors are children the office moved here for one week — E12/S4. They used to be
        // make-up credits booked onto the session by their own families; the column moved, the
        // question did not.
        const visitingRows = await noticeRepository
            .createQueryBuilder('notice')
            .select('notice.replacement_session_id', 'sessionId')
            .addSelect('COUNT(*)::int', 'count')
            .where('notice.replacement_session_id IN (:...sessionIds)', { sessionIds })
            .groupBy('notice.replacement_session_id')
            .getRawMany<{ sessionId: number; count: number }>();

        // A seat offered to the waiting list is promised for the whole week the family may start in
        // — see `occupancyOf`. Selling it as a trial or a week's visit is selling it twice.
        const heldRows = await (manager ? manager.getRepository(WaitlistEntry) : this.waitlistRepository)
            .createQueryBuilder('entry')
            .select('entry.group_id', 'groupId')
            .addSelect('COUNT(*)::int', 'count')
            .where('entry.group_id IN (:...groupIds)', { groupIds })
            .andWhere('entry.status = :offered', { offered: WaitlistStatus.OFFERED })
            .groupBy('entry.group_id')
            .getRawMany<{ groupId: number; count: number }>();

        const enrolled = new Map(enrolledRows.map((row) => [Number(row.groupId), row.count]));
        const visiting = new Map(visitingRows.map((row) => [Number(row.sessionId), row.count]));
        const held = new Map(heldRows.map((row) => [Number(row.groupId), row.count]));

        for (const session of sessions) {
            const taken = (enrolled.get(session.group.id) ?? 0) + (held.get(session.group.id) ?? 0) + (visiting.get(session.id) ?? 0);
            // The smaller of the group's seats and the room's — the review of 25 September 2026. A
            // class moved into a room of two kept counting the group's ten, so the form sold a trial
            // into a room that was already full.
            const seats = Math.min(session.group.capacity, session.room?.capacity ?? session.group.capacity);
            free.set(session.id, Math.max(0, seats - taken));
        }
        return free;
    }

    /** The same question about a single class. */
    async freeSeatsAt(session: SeatedSession, manager?: EntityManager): Promise<number> {
        return (await this.freeSeatsAtSessions([session], manager)).get(session.id) ?? 0;
    }

    /**
     * How many children are expected at one class: the group's enrolments in force plus the ones the
     * office moved in for the week. What a room has to hold if the class moves into it — the seats
     * offered to the list are the group's future, not this hour's.
     */
    async expectedAt(session: { id: number; group: { id: number } }, manager?: EntityManager): Promise<number> {
        const noticeRepository = manager ? manager.getRepository(AbsenceNotice) : this.absenceNoticeRepository;
        const visiting = await noticeRepository.count({ where: { replacementSession: { id: session.id } } });
        return (await this.countInForce(session.group.id, manager)) + visiting;
    }

    private async countInForce(groupId: number, manager?: EntityManager): Promise<number> {
        const repository = manager ? manager.getRepository(Enrollment) : this.enrollmentRepository;
        return repository.count({ where: { group: { id: groupId }, status: In([...IN_FORCE_STATUSES]) } });
    }

    /**
     * Seats offered to the waiting list and not yet answered — promised, so not free.
     *
     * `exceptChildId` is the child who holds one of them and is now taking it: their own offer is the
     * seat they sit down in, not a seat in their way.
     */
    private async countHeld(groupId: number, manager?: EntityManager, exceptChildId?: number): Promise<number> {
        const repository = manager ? manager.getRepository(WaitlistEntry) : this.waitlistRepository;
        return repository.count({
            where: {
                group: { id: groupId },
                status: WaitlistStatus.OFFERED,
                ...(exceptChildId !== undefined ? { child: { id: Not(exceptChildId) } } : {}),
            },
        });
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
     * **An override leaves a row in the audit log**, on the group whose capacity it went past —
     * E07/S3. The group is the subject on purpose: "who put an eleventh child in group 5" is the
     * question somebody asks, and it is asked of the room, not of one enrolment. It is written with
     * this transaction's manager, so the record and the seat it describes stand or fall together.
     *
     * The actor is an `Actor` rather than a user id because the trail stores the username as text —
     * a row pointing at an account somebody later deleted is a row that lost the part anybody
     * wanted to read. `null` is the public trial form of E20/S2, which has no signed-in user at
     * all; it can never reach the override branch, because nothing public sends
     * `allowOverCapacity`, and if it ever did the entry would say plainly that no account did it.
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
        // `null` when nothing signed in did this — the public trial form of E20/S2. Kept nullable
        // rather than filled with `SYSTEM_ACTOR`: that one means "a job ran", and a parent pressing
        // a button on a public page is a different fact about the same empty username column.
        actor: Actor | null,
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

        return manager ? this.enrolWithin(manager, input, status, actor) : this.dataSource.transaction((tx) => this.enrolWithin(tx, input, status, actor));
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
        actor: Actor | null,
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
        // Only here, not on `transfer`. The rule protects the moment a child first sits in a room
        // with nobody reachable; a child being moved between groups is already in one, so refusing
        // the move protects nothing and strands a family the school has had for a year. And it
        // cannot be dodged by getting enrolled once: this is the door they came through.
        this.assertParentProfileComplete(child);
        await this.assertNotAlreadyEnrolled(input.childId, manager);
        if (!group.isActive) {
            throw new ConflictException({
                message: 'Grupa este inactivă și nu poate primi înscrieri noi',
                error: 'GROUP_INACTIVE',
            });
        }
        await this.assertRoomForOneMore(group, manager, input.allowOverCapacity === true, actor, input.childId, input.startDate ?? today());
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

        // E04/S5: a family with a child in a group has not left. A withdrawal recorded earlier would
        // keep counting towards an erasure nobody means any more (E22/S3), so it goes in the same
        // transaction as the enrolment that contradicts it — and the trail says why.
        const withdrawnAt = child.parent?.withdrawnAt;
        if (child.parent && withdrawnAt) {
            await manager.update(Profile, child.parent.id, { withdrawnAt: null });
            await this.audit.record(
                {
                    actor: actor ?? SYSTEM_ACTOR,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: child.parent.id,
                    changes: { withdrawnAt: { from: String(withdrawnAt).slice(0, 10), to: null } },
                    note: `retragere anulată: copilul ${input.childId} înscris`,
                },
                manager,
            );
        }

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
     *
     * **Public, because "everybody who wants a seat" is three callers, not one.** `enrol` was the
     * only one holding it, so it serialised enrolments against enrolments and nothing else — while
     * the *per-class* count that D7 is actually about (`freeSeatsAt`: enrolments in force plus the
     * children the office moved in for a week) was read without any lock at all by the public trial
     * booking and by `ReplacementService.place`. Two of those racing put two children on one chair
     * without either check noticing. The group row is the right single point: every writer that can
     * change a class's occupancy is a writer against that group.
     *
     * **And a writer that *frees* a seat is one of them**, which took a fourth pass to notice: the
     * releasing paths all end in `offerFreeSeats`, which counted the seats without holding this.
     * Everything above is about two people wanting the same chair; that was one person leaving it
     * while another sat down, and the waiting list being promised the chair anyway.
     */
    async lockGroup(manager: EntityManager, groupId: number): Promise<Group> {
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
        // Closing takes the seat away today, whatever the date on the row says — the review of 25
        // September 2026. A date ahead left the child off the register at once and offered the seat to
        // the waiting list while the child still sat in it: two children told to come for one chair.
        // The close is for the day the child leaves; until then the enrolment is in force.
        if (input.endDate !== undefined && input.endDate.slice(0, 10) > today()) {
            throw new BadRequestException({
                message: 'O înscriere se închide în ziua în care pleacă copilul, nu dinainte: închiderea eliberează locul pe loc.',
                error: 'ENROLLMENT_END_IN_FUTURE',
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
            const alreadyClosed = () => new ConflictException({ message: 'Înscrierea este deja închisă', error: 'ENROLLMENT_ALREADY_CLOSED' });
            if (!isInForce(enrollment.status)) {
                throw alreadyClosed();
            }

            // The group first, as every seat-touching transaction takes it (`lockGroup`), and only
            // then the row — written only while it is still in force. Two presses of "close" used to
            // both read it open, both write it and both release the seat: two offers for one chair.
            await this.lockGroup(manager, enrollment.group.id);
            // A trial and an active row are written apart, each only while it still is one: a trial
            // records the day it stopped (`trialUntil`), which is what keeps its class off the bill
            // once the status no longer says "trial". Which write hit also says what the row was
            // under the lock — the read above may have been a trial accepted since.
            const endDate = input.endDate ?? today();
            const closing = { status: input.status, endDate, exitReason: input.exitReason ?? null };
            const closedTrial = await manager.update(Enrollment, { id: enrollmentId, status: EnrollmentStatus.TRIAL }, { ...closing, trialUntil: endDate });
            const closed = closedTrial.affected
                ? closedTrial
                : await manager.update(Enrollment, { id: enrollmentId, status: EnrollmentStatus.ACTIVE }, closing);
            if (!closed.affected) {
                throw alreadyClosed();
            }

            // A trial closed here, rather than through `resolveTrial`, came to nothing all the same,
            // and its lead has to say so — the review of 25 September 2026 found it left on the
            // follow-up list for ever. Only an open lead moves, so one already decided stays decided.
            if (closedTrial.affected) {
                await this.leadProgress.settleForEnrollment(enrollmentId, { enrolled: false, reason: input.exitReason ?? null }, new Date(), manager);
            }

            await this.syncDerivedGroup(enrollment.child.id, manager);
            await this.offerFreeSeats(enrollment.group.id, manager);

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
     * **The seat left behind is offered to the old group's queue**, like any other release. This
     * used to say it was "not free, but handed to this child" — which is true of no seat at all: the
     * child sits in the *other* group now. The group's own screen said `free: 1` beside a waiting
     * list nobody told. So this is the one transaction that holds two groups, and it takes them in
     * ascending id order, which is what keeps two transfers in opposite directions from each
     * holding one and waiting on the other.
     */
    async transfer(
        input: { childId: number; toGroupId: number; reason?: string; allowOverCapacity?: boolean; acknowledgeWarnings?: boolean },
        actor: Actor,
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
            if (current.group.id < input.toGroupId) await this.lockGroup(manager, current.group.id);
            const target = await this.lockGroup(manager, input.toGroupId);
            if (current.group.id > input.toGroupId) await this.lockGroup(manager, current.group.id);

            this.assertParentAccountActive(child);
            if (!target.isActive) {
                throw new ConflictException({ message: 'Grupa este inactivă și nu poate primi înscrieri noi', error: 'GROUP_INACTIVE' });
            }
            await this.assertRoomForOneMore(target, manager, input.allowOverCapacity === true, actor, input.childId, today());
            this.assertCompatible(child, target, input.acknowledgeWarnings === true);

            const now = today();
            // Only while it is still in force: it was read before the locks, and a close in between
            // would otherwise be overwritten as a transfer. A trial and an active row are written
            // apart, as in `close`, so the trial records the day it stopped being one here — the new
            // row is a trial of its own, and the old one's class must not reach the bill.
            const closing = { status: EnrollmentStatus.TRANSFERRED, endDate: now, exitReason: input.reason ?? `Transfer în grupa ${target.name}` };
            const movedTrial = await manager.update(Enrollment, { id: current.id, status: EnrollmentStatus.TRIAL }, { ...closing, trialUntil: now });
            const moved = movedTrial.affected ? movedTrial : await manager.update(Enrollment, { id: current.id, status: EnrollmentStatus.ACTIVE }, closing);
            if (!moved.affected) {
                throw new ConflictException({ message: 'Înscrierea este deja închisă', error: 'ENROLLMENT_ALREADY_CLOSED' });
            }
            const wasTrial = Boolean(movedTrial.affected);

            const opened = await manager.save(Enrollment, {
                child: { id: input.childId } as Child,
                group: { id: input.toGroupId } as Group,
                // A transfer carries the status across: a trial that moves group is still a trial,
                // and promoting it to active here would enrol a family that has not decided yet.
                status: wasTrial ? EnrollmentStatus.TRIAL : EnrollmentStatus.ACTIVE,
                startDate: now,
                endDate: null,
                exitReason: null,
                contractSignedAt: current.contractSignedAt,
            });

            // Being in the group settles any request this child had for it, exactly as in `enrol`. An
            // offer left open expired two days later and told a family already sitting in the group
            // that its seat had gone to the next one; a waiting entry would be offered the next seat
            // that freed, a turn taken from whoever really was next.
            await manager
                .getRepository(WaitlistEntry)
                .update(
                    { child: { id: input.childId }, group: { id: input.toGroupId }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
                    { status: WaitlistStatus.ACCEPTED },
                );

            // A trial's lead hangs off the enrolment E11 will decide on, and that is now the new row.
            if (wasTrial) {
                await this.leadProgress.followTransfer(current.id, { enrollmentId: opened.id, groupId: input.toGroupId }, new Date(), manager);
            }

            await this.syncDerivedGroup(input.childId, manager);
            await this.offerFreeSeats(current.group.id, manager);

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
            const notATrial = () =>
                new ConflictException({
                    message: 'Doar o înscriere de probă poate fi confirmată sau închisă în felul acesta',
                    error: 'NOT_A_TRIAL',
                });
            if (trial.status !== EnrollmentStatus.TRIAL) {
                throw notATrial();
            }

            // As in `close`: the group, then the row, and the row only while it is still a trial —
            // a decision made twice at the same second would otherwise release the seat twice.
            await this.lockGroup(manager, trial.group.id);

            if (input.accepted) {
                const accepted = await manager.update(
                    Enrollment,
                    { id: enrollmentId, status: EnrollmentStatus.TRIAL },
                    // The same row goes on, so the day the trial stopped is the only thing that keeps
                    // its own class — already held, often in this same month — off the bill.
                    { status: EnrollmentStatus.ACTIVE, trialUntil: today(), contractSignedAt: input.contractSignedAt ?? trial.contractSignedAt },
                );
                if (!accepted.affected) throw notATrial();
                this.logger.log(`Trial ${enrollmentId} became an active enrolment.`);
                // In the same transaction: the lead records the decision E11 just made, and one of
                // the two happening without the other is exactly what S4's numbers cannot survive.
                await this.leadProgress.settleForEnrollment(enrollmentId, { enrolled: true }, new Date(), manager);
            } else {
                const closed = await manager.update(
                    Enrollment,
                    { id: enrollmentId, status: EnrollmentStatus.TRIAL },
                    {
                        status: EnrollmentStatus.WITHDRAWN,
                        endDate: today(),
                        trialUntil: today(),
                        exitReason: input.reason ?? 'Proba nu s-a transformat în înscriere',
                    },
                );
                if (!closed.affected) throw notATrial();
                await this.syncDerivedGroup(trial.child.id, manager);
                // Only here is the seat genuinely leaving the group, so only here is the queue asked.
                await this.offerFreeSeats(trial.group.id, manager);
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
     * Records that the enrolment contract was signed, and when — E07/S8.
     *
     * The paper is signed in the room and stays in the folder; the platform keeps the fact and the
     * date, nothing else, so that "a semnat familia X?" is answered from a list instead of from a
     * binder. It can be set at enrolment and at trial confirmation already; this is the door for
     * every enrolment where nobody typed it then, which at a few dozen families is most of them.
     *
     * A trial is refused: a trial is free and has no contract to sign, so a date recorded on it
     * would say the family committed before they decided. Confirm the trial first — that door
     * takes the date too. A date in the future is refused for the plainer reason that nobody has
     * signed anything yet. `null` clears a mistaken entry.
     */
    async recordContract(enrollmentId: number, contractSignedAt: string | null): Promise<Enrollment> {
        const enrollment = await this.enrollmentRepository.findOne({ where: { id: enrollmentId }, relations: { child: true, group: true } });
        if (!enrollment) {
            throw new NotFoundException('Enrollment not found');
        }
        if (enrollment.status === EnrollmentStatus.TRIAL) {
            throw new ConflictException({
                message: 'Proba nu are contract — confirmă proba întâi, apoi consemnează semnarea.',
                error: 'TRIAL_HAS_NO_CONTRACT',
            });
        }
        if (contractSignedAt !== null && contractSignedAt.slice(0, 10) > today()) {
            throw new BadRequestException({
                message: 'Data semnării nu poate fi în viitor.',
                error: 'CONTRACT_DATE_IN_FUTURE',
            });
        }
        await this.enrollmentRepository.update({ id: enrollmentId }, { contractSignedAt: contractSignedAt === null ? null : contractSignedAt.slice(0, 10) });
        this.logger.log(
            contractSignedAt === null
                ? `Enrollment ${enrollmentId}: contract evidence cleared.`
                : `Enrollment ${enrollmentId}: contract recorded as signed on ${contractSignedAt.slice(0, 10)}.`,
        );
        return this.enrollmentRepository.findOneOrFail({ where: { id: enrollmentId }, relations: { child: true, group: true } });
    }

    /**
     * The active enrolments with no contract on file, oldest first — E07/S8's list.
     *
     * Active only: a trial has no contract by design, and a closed enrolment is history — the
     * family has left, and the folder is the folder. What this answers is "who is sitting in a
     * group without having signed", which is the question the office would otherwise answer at
     * the wrong moment.
     */
    async withoutContract(): Promise<Enrollment[]> {
        return this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoinAndSelect('enrollment.group', 'group')
            .leftJoin('enrollment.child', 'child')
            .addSelect(['child.id', 'child.firstName', 'child.lastName'])
            .leftJoin('child.parent', 'parent')
            .addSelect(['parent.id', 'parent.firstName', 'parent.lastName', 'parent.phone', 'parent.email'])
            .where('enrollment.status = :status', { status: EnrollmentStatus.ACTIVE })
            .andWhere('enrollment.endDate IS NULL')
            .andWhere('enrollment.contractSignedAt IS NULL')
            .orderBy('enrollment.startDate', 'ASC')
            .addOrderBy('child.lastName', 'ASC')
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

    /**
     * Hands on every seat whose offer ran out of time — E11/S3, the piece that was missing.
     *
     * **An unanswered offer used to hold its seat forever.** `offerFreeSeats` only ever looks at
     * `WAITING` entries, so an `OFFERED` one past its `respondBy` sat at the head of the queue
     * holding a chair nobody was in: the next family was never told, and the group showed as full
     * to every screen that counts occupancy. Nothing noticed until an admin happened to release
     * another seat in the same group, which is not a mechanism — it is a coincidence.
     *
     * A plain method, with the cron in `waitlist-expiry.job.ts` deciding only the hour, exactly as
     * every other scheduled thing here is written: `@Cron` does not fire under `NODE_ENV=test`, so
     * selection logic that lived inside one could not be tested at all.
     *
     * One transaction per entry rather than one for the sweep. Two seats in two groups are two
     * unrelated matters, and a failure on the second must not roll back a family already told about
     * the first — the offer mail for the next family is written in the same transaction as the
     * expiry that produced it, and those two do belong together.
     *
     * `now` is a parameter so a test can place the clock; the cron passes the real one.
     */
    async expireLapsedOffers(now: Date = new Date()): Promise<{ expired: number }> {
        const lapsed = await this.waitlistRepository.find({
            where: { status: WaitlistStatus.OFFERED, respondBy: LessThan(now) },
            relations: { child: { parent: true }, group: true },
            // Oldest deadline first: if two lapsed in the same hour, the family kept waiting longest
            // is the one whose seat moves on first.
            order: { respondBy: 'ASC', id: 'ASC' },
        });

        let expired = 0;
        for (const entry of lapsed) {
            const lapsedNow = await this.dataSource.transaction(async (manager) => {
                // Before the entry is touched, not just before the count below: `enrol` takes the
                // group and *then* settles this child's waitlist rows, so a sweep that grabbed the
                // row first and asked for the group second could sit head-to-head with an enrolment
                // holding the group and waiting on the row. Same lock, same order, no cycle.
                await this.lockGroup(manager, entry.group.id);
                // Only if it is still the unanswered offer the list above read. A family that
                // declined in the meantime had its answer overwritten as "expired", was mailed that
                // it had missed the seat, and the seat was offered a second time.
                const moved = await manager.update(
                    WaitlistEntry,
                    { id: entry.id, status: WaitlistStatus.OFFERED, respondBy: LessThan(now) },
                    { status: WaitlistStatus.EXPIRED },
                );
                if (!moved.affected) return false;

                const mail = composeWaitlistOfferExpired(entry.child.firstName, entry.group.name);
                // `queueOrRecord`, so a family with no address leaves a row saying so rather than
                // being skipped in silence — E17/S5. They are the ones who most need the phone call.
                await this.outbox.queueOrRecord({ email: entry.child.parent?.email }, { subject: mail.subject, bodyText: mail.bodyText }, manager);

                // The seat is free again only now, and this is the same door a decline goes through.
                await this.offerFreeSeats(entry.group.id, manager);
                return true;
            });
            if (lapsedNow) expired += 1;
        }

        if (expired > 0) {
            this.logger.log(`Expired ${expired} waitlist offer(s) and handed the seats on.`);
        }
        return { expired };
    }

    /**
     * Takes an entry off the list while it is still on it — waiting, or offered and unanswered.
     *
     * Decided inside the transaction, under the group's lock, rather than from a read before it: the
     * sweep in `expireLapsedOffers` can move the same row, and a decision taken on the old state
     * released a seat twice. An entry already settled is history, and is not rewritten.
     */
    async removeFromWaitlist(entryId: number, status: WaitlistClosingStatus = WaitlistStatus.CANCELLED): Promise<{ message: string }> {
        await this.dataSource.transaction(async (manager) => {
            const entry = await manager.getRepository(WaitlistEntry).findOne({ where: { id: entryId }, relations: { group: true } });
            if (!entry) {
                throw new NotFoundException('Waitlist entry not found');
            }
            // Before the row is written, for the reason in `expireLapsedOffers`.
            await this.lockGroup(manager, entry.group.id);
            const moved = await manager.update(WaitlistEntry, { id: entryId, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) }, { status });
            if (!moved.affected) {
                throw new ConflictException({ message: 'Cererea nu mai este pe listă.', error: 'WAITLIST_ENTRY_CLOSED' });
            }
            // A declined or expired offer hands the seat straight to the next family, rather than
            // leaving it held by nobody until an admin notices. Nothing to hand on when the entry
            // was only waiting: the count finds no seat that was not free before.
            await this.offerFreeSeats(entry.group.id, manager);
        });

        return { message: 'Cererea a fost scoasă de pe listă' };
    }

    /**
     * Offers every free seat to the families waiting longest, one seat each, while there are both.
     *
     * Called from inside the transaction that freed the seat, so the offer and the release commit
     * together. **Every free seat, not one per call.** It used to offer exactly one, on the theory
     * that two seats freed would mean two calls — but half the doors that free a seat never called
     * at all (a transfer out, a child deleted, a family erased, a capacity raised), so free seats
     * piled up beside a list nobody told, and the next release offered one of them. The count is
     * safe to act on in full because it is taken under the group's lock and already leaves out the
     * seats offered before (`held`): each offer made here is a seat nobody else can be promised.
     *
     * **The lock comes before the count**, for the fourth time in this codebase and the same reason
     * every time. `enrol` locks the group and then counts; this counted without locking, so an
     * enrolment committing against its snapshot was invisible: the tenth seat went to a child and
     * the queue was told, in the same second, that a seat was theirs for the next 48 hours. The
     * family answers and finds the group full, which is the one outcome a waiting list exists to
     * prevent. It also serialises two releases against each other, which used to read the same
     * `WAITING` entry twice and offer it twice — two mails and a moved `respondBy` for one seat.
     *
     * It is taken **here**, next to the number it protects, rather than in the four callers, so a
     * fifth path that frees a seat inherits it instead of having to remember it. The callers that
     * write a `WaitlistEntry` before reaching this point take it earlier as well, so that the group
     * row is the first lock every seat-touching transaction holds; a second take inside the same
     * transaction is a no-op, which is why `enrol` and `transfer` need no change.
     */
    private async offerFreeSeats(groupId: number, manager: EntityManager): Promise<void> {
        const group = await this.lockGroup(manager, groupId);
        // An inactive group takes no enrolments (`GROUP_INACTIVE`), so an offer would be a seat the
        // family is told is theirs and then refused at the door — down the whole list, one expiry
        // at a time.
        if (!group.isActive) {
            return;
        }
        const occupancy = await this.occupancyOf(groupId, manager);
        if (occupancy.free <= 0) {
            return;
        }

        const next = await manager.getRepository(WaitlistEntry).find({
            where: { group: { id: groupId }, status: WaitlistStatus.WAITING },
            relations: { child: { parent: true }, group: true },
            order: { createdAt: 'ASC', id: 'ASC' },
            take: occupancy.free,
        });

        const now = new Date();
        const respondBy = new Date(now.getTime() + WAITLIST_RESPONSE_HOURS * 60 * 60 * 1000);
        for (const entry of next) {
            await manager.update(WaitlistEntry, { id: entry.id }, { status: WaitlistStatus.OFFERED, offeredAt: now, respondBy });

            // `queueOrRecord`, as the expiry already did: a family with no address on file leaves a
            // row saying the offer went nowhere (E17/S5), where a warning in a log left "never told"
            // looking exactly like a queue that is stuck. The seat stays offered and the clock runs;
            // the row is what tells the office to phone.
            const mail = composeWaitlistOffer(entry.child.firstName, entry.group.name, respondBy);
            await this.outbox.queueOrRecord({ email: entry.child.parent?.email }, { subject: mail.subject, bodyText: mail.bodyText }, manager);
            this.logger.log(`Offered a free seat in group ${groupId} to waitlist entry ${entry.id}.`);
        }
    }

    /**
     * The groups where these children hold a seat — enrolled, on trial, or offered one from the
     * list — each locked, lowest id first, for a caller about to delete them.
     *
     * A deleted child takes its enrolment and its waiting-list rows with it by cascade, and a
     * cascade asks nobody: the seat was free and the list was never told. So the caller takes the
     * groups here, before the delete, and hands them to `offerFreeSeatsIn` after it — the locks
     * first, as every seat-touching transaction takes them.
     */
    async lockSeatsHeldBy(childIds: number[], manager: EntityManager): Promise<number[]> {
        if (childIds.length === 0) return [];
        const enrolled = await manager
            .getRepository(Enrollment)
            .find({ where: { child: { id: In(childIds) }, status: In([...IN_FORCE_STATUSES]) }, relations: { group: true } });
        const offered = await manager
            .getRepository(WaitlistEntry)
            .find({ where: { child: { id: In(childIds) }, status: WaitlistStatus.OFFERED }, relations: { group: true } });
        const groupIds = [...new Set([...enrolled, ...offered].map((row) => row.group.id))].sort((a, b) => a - b);
        for (const groupId of groupIds) await this.lockGroup(manager, groupId);
        return groupIds;
    }

    /** Hands the seats freed in these groups to their lists — see `lockSeatsHeldBy`, and `offerFreeSeats`. */
    async offerFreeSeatsIn(groupIds: number[], manager: EntityManager): Promise<void> {
        for (const groupId of [...groupIds].sort((a, b) => a - b)) await this.offerFreeSeats(groupId, manager);
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

    /**
     * The second half of the same gate, once registration became two steps.
     *
     * A separate refusal from the one above rather than a wider version of it, because the two are
     * repaired in different places: an inactive account waits on an admin, an incomplete profile
     * waits on the parent. Telling a parent "your account is not active" when what is missing is
     * their own phone number sends them to wait for somebody who has nothing to do.
     *
     * Scoped to profiles with an account, exactly like the rule above, and that scoping is load
     * bearing: the public trial form writes a shell profile with no account, no email and no phone
     * (E20/S2), and enrols through this same method. Holding it to a standard only a registered
     * parent can meet would refuse every booking on the one screen built to accept them.
     */
    private assertParentProfileComplete(child: Child): void {
        const parent = child.parent;
        if (parent?.user && !isProfileComplete(parent)) {
            throw new ConflictException({
                message: 'Profilul familiei este incomplet. Completează telefonul, adresa și contactul de urgență înainte de înscriere.',
                error: 'PARENT_PROFILE_INCOMPLETE',
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

    /**
     * D7, counting trials. The message offers the list, because that is the next thing to do.
     *
     * **The exception writes to the audit log, in this transaction** — E11/S3's last open clause.
     * A seat is physical, so going past capacity is a decision a person makes about a room, and the
     * trail is on the group for that reason: `GET /audit?entityType=Group&entityId=5` answers "who
     * put an eleventh child in here, and when". `changes` carries the occupancy that moved and the
     * note the capacity it moved past, because a count without the ceiling beside it says nothing.
     *
     * The log line stays as well. They are read by different people at different times: the warning
     * is for whoever is watching a deploy, the row is for whoever asks in March.
     */
    private async assertRoomForOneMore(
        group: Group,
        manager: EntityManager,
        allowOverCapacity: boolean,
        actor: Actor | null,
        childId: number,
        from: string,
    ): Promise<void> {
        // A seat offered to somebody else on the list is theirs until they answer — `occupancyOf`.
        // This child's own offer is not: it is the seat they are sitting down in.
        const held = await this.countHeld(group.id, manager, childId);
        const enrolled = await this.countInForce(group.id, manager);
        const taken = enrolled + held;
        // The group's seats are not the whole question: a class of it can be tighter — moved into a
        // smaller room, or holding children the office moved in for a week — and this child sits in
        // that class too. The review of 25 September 2026 enrolled the tenth child of ten while
        // Thursday's class held a visitor: eleven in the room that Thursday.
        const tightest = await this.tightestClassFrom(group, from, childId, manager);
        const limit = tightest ? Math.min(group.capacity, tightest.room - tightest.visitors) : group.capacity;
        if (taken < limit) {
            return;
        }
        // The group has a seat and one of its classes does not: that class is what the refusal, or
        // the override, is about.
        const fullClass = taken < group.capacity ? tightest : null;

        if (allowOverCapacity) {
            this.logger.warn(
                `${actor ? `User ${actor.userId}` : 'The public trial form'} enrolled over capacity in group ${group.id}: ${enrolled + 1} children and ${held} offered seat(s) in ${group.capacity} seats` +
                    `${fullClass ? `, with the class of ${fullClass.date} holding ${fullClass.visitors} visitor(s) in ${fullClass.room} seats` : ''}.`,
            );
            // "într-un loc", not "în 1 locuri": an admin reads this, and a sentence that cannot
            // decline its own numbers reads like a machine wrote it for itself.
            const seats = (count: number) => (count === 1 ? 'într-un loc' : `în ${count} locuri`);
            const children = (count: number) => (count === 1 ? 'un copil' : `${count} copii`);
            await this.audit.record(
                {
                    // `{ userId: null, username: null }` where nobody signed in. It is the shape
                    // `SYSTEM_ACTOR` has and not the same statement: the note says which it was.
                    actor: actor ?? { userId: null, username: null },
                    action: AuditAction.UPDATED,
                    entityType: 'Group',
                    entityId: group.id,
                    changes: { seatsTaken: { from: taken, to: taken + 1 } },
                    note:
                        (fullClass
                            ? `Înscriere peste locurile orei din ${fullClass.date}: ${children(taken + fullClass.visitors + 1)} ${seats(fullClass.room)}`
                            : `Înscriere peste capacitate: ${children(enrolled + 1)} ${seats(group.capacity)}` +
                              `${held === 0 ? '' : held === 1 ? ', plus un loc oferit listei de așteptare' : `, plus ${held} locuri oferite listei de așteptare`}`) +
                        `${actor ? '' : ', din formularul public'}.`,
                },
                manager,
            );
            return;
        }

        if (fullClass) {
            // Not "the group is full": the group shows a free seat, and the reader has to be told
            // which class has none, and why — the room it moved into, or the children moved into it.
            throw new ConflictException({
                message:
                    `Ora de ${romanianDayAndDate(fullClass.date)} nu mai are niciun loc liber: ${fullClass.room === 1 ? 'un loc' : `${fullClass.room} locuri`}, ` +
                    `${taken === 1 ? 'un copil' : `${taken} copii`} din grupă` +
                    `${fullClass.visitors === 0 ? '' : ` și ${fullClass.visitors === 1 ? 'unul mutat' : `${fullClass.visitors} mutați`} acolo pentru o săptămână`}.` +
                    ' Poți pune copilul pe lista de așteptare.',
                error: 'GROUP_FULL',
            });
        }
        throw new ConflictException({
            message:
                `Grupa este plină: ${taken} din ${group.capacity} locuri, inclusiv probele programate` +
                `${held === 0 ? '' : held === 1 ? ' și un loc oferit listei de așteptare' : ` și ${held} locuri oferite listei de așteptare`}.` +
                ' Poți pune copilul pe lista de așteptare.',
            error: 'GROUP_FULL',
        });
    }

    /**
     * The class of this group, from `from` on, with the least room left for one more child: the
     * seats in the room it is actually in (never more than the group's), less the children moved in
     * for that week. `null` when no scheduled class is ahead.
     *
     * The child being enrolled is not one of the visitors: moved into a class of this group for the
     * week and now joining it, they sit in one chair, not two.
     */
    private async tightestClassFrom(
        group: Group,
        from: string,
        childId: number,
        manager: EntityManager,
    ): Promise<{ date: string; room: number; visitors: number } | null> {
        const rows = await manager.query<{ date: string; roomCapacity: number; visitors: number }[]>(
            `SELECT s."date"::text AS "date", r.capacity AS "roomCapacity", COUNT(n.id)::int AS visitors
             FROM class_sessions s
             JOIN rooms r ON r.id = s.room_id
             LEFT JOIN absence_notices n ON n.replacement_session_id = s.id AND n.child_id <> $4
             WHERE s.group_id = $1 AND s."date" >= $2 AND s.status = $3
             GROUP BY s.id, s."date", r.capacity`,
            [group.id, from, ClassSessionStatus.SCHEDULED, childId],
        );
        let tightest: { date: string; room: number; visitors: number } | null = null;
        for (const row of rows) {
            const room = Math.min(group.capacity, Number(row.roomCapacity));
            const visitors = Number(row.visitors);
            if (!tightest || room - visitors < tightest.room - tightest.visitors) tightest = { date: row.date, room, visitors };
        }
        return tightest;
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
