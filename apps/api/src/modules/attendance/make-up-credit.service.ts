import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { MakeUpStatus } from 'src/enum/make-up-status.enum';
import { Role } from 'src/enum/role.enum';
import { ageOf } from 'src/modules/enrollment/enrollment.service';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { hasExpired, makeUpExpiryFor } from './make-up.rules';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';

/** One class a credit could be used on, as the booking screen reads it. */
export interface MakeUpOption {
    sessionId: number;
    date: string;
    startTime: string;
    endTime: string;
    groupId: number;
    groupName: string;
    locationName: string | null;
    free: number;
}

@Injectable()
export class MakeUpCreditService {
    private readonly logger = new Logger('MakeUpCredit');

    constructor(
        @InjectRepository(MakeUpCredit) private readonly creditRepository: Repository<MakeUpCredit>,
        @InjectRepository(AbsenceNotice) private readonly noticeRepository: Repository<AbsenceNotice>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
        // D7's owner. Seats — in a group, and at one class — are counted in one place; see
        // `EnrollmentService.freeSeatsAtSessions`.
        private readonly enrollments: EnrollmentService,
    ) {}

    /**
     * The state, derived — never a column.
     *
     * `EXPIRED` in particular: a credit expires because the calendar moved, not because anything
     * ran. Stored, it would be wrong for exactly as long as no job had swept it, and the sweep
     * would be a scheduler the platform does not have anywhere to run.
     */
    statusOf(credit: MakeUpCredit, now: Date = new Date()): MakeUpStatus {
        if (credit.consumedAttendance) return MakeUpStatus.CONSUMED;
        if (hasExpired(credit.expiresOn, now)) return MakeUpStatus.EXPIRED;
        return credit.bookedSession ? MakeUpStatus.BOOKED : MakeUpStatus.AVAILABLE;
    }

    /**
     * Earns a credit, if the absence deserves one — called when the register is marked.
     *
     * The rule in one line: **announced in time, and then genuinely not there.** Both halves are
     * required and neither is sufficient, which is what makes this the definition of "eligible"
     * rather than a second, looser one. Silent about every case that does not qualify: marking a
     * register must not fail because a credit could not be earned.
     */
    async earnFor(childId: number, classSessionId: number, present: boolean): Promise<MakeUpCredit | null> {
        if (present) return null;

        const notice = await this.noticeRepository.findOne({
            where: { child: { id: childId }, classSession: { id: classSessionId } },
        });
        if (!notice || !notice.inTime) return null;

        const existing = await this.creditRepository.findOne({
            where: { child: { id: childId }, originSession: { id: classSessionId } },
        });
        if (existing) return existing;

        const session = await this.classSessionRepository.findOne({ where: { id: classSessionId } });
        if (!session) return null;

        const credit = await this.creditRepository.save(
            this.creditRepository.create({
                child: { id: childId } as Child,
                originSession: { id: classSessionId } as ClassSession,
                expiresOn: makeUpExpiryFor(session.date),
                bookedSession: null,
                consumedAttendance: null,
            }),
        );
        this.logger.log(`Child ${childId} earned a make-up credit for session ${classSessionId}, valid to ${toIsoDate(credit.expiresOn)}.`);
        return credit;
    }

    /**
     * Gives every child in a group the hour back, because the school called the class off — E12/S5.
     *
     * **A separate door from `earnFor`, on purpose.** That one asks whether a family announced in
     * time and then was genuinely absent, which is the right question when a child misses a class
     * that happened. Here the class did not happen, nobody was absent from anything, and there is
     * no notice to look for — so reusing `earnFor` would mean loosening the definition of "earned"
     * for everybody, which is the definition E12/S4 exists to keep tight.
     *
     * **It is not automatic, and that is a pricing decision.** The invoice counts sessions held —
     * an admin types the number per child on the issuing screen — so a cancelled class is already
     * not charged for. A credit on top gives the family a fourth lesson for three lessons' money,
     * which is a thing the school may well want to do for an ill teacher and may well not want to
     * do for a snowed-out Tuesday. So the caller says, per cancellation.
     *
     * Idempotent through the same unique index that keeps `earnFor` honest: cancelling a class
     * twice cannot mint two credits for one child.
     */
    async grantForCancellation(classSessionId: number, manager?: EntityManager): Promise<number> {
        const repository = manager ? manager.getRepository(MakeUpCredit) : this.creditRepository;
        const sessions = manager ? manager.getRepository(ClassSession) : this.classSessionRepository;

        const session = await sessions.findOne({
            where: { id: classSessionId },
            relations: { group: { children: true } },
        });
        if (!session) return 0;

        const children = session.group.children ?? [];
        if (children.length === 0) return 0;

        const expiresOn = makeUpExpiryFor(session.date);
        const existing = await repository.find({
            where: { originSession: { id: classSessionId }, child: { id: In(children.map((child) => child.id)) } },
            relations: { child: true },
        });
        const alreadyHeld = new Set(existing.map((credit) => credit.child.id));

        const fresh = children
            .filter((child) => !alreadyHeld.has(child.id))
            .map((child) =>
                repository.create({
                    child: { id: child.id } as Child,
                    originSession: { id: classSessionId } as ClassSession,
                    expiresOn,
                    bookedSession: null,
                    consumedAttendance: null,
                }),
            );
        if (fresh.length === 0) return 0;

        await repository.save(fresh);
        this.logger.log(`Cancelled session ${classSessionId}: granted ${fresh.length} make-up credit(s), valid to ${toIsoDate(expiresOn)}.`);
        return fresh.length;
    }

    /**
     * Lets go of every make-up booked into a class that was cancelled — called from the
     * cancellation's own transaction, after the families have been told.
     *
     * A booking on a class that will not happen is a plan the family cannot keep and a chair the
     * booking screen still counts as taken. The credit itself is untouched: the right was earned
     * elsewhere, its window keeps running, and the family picks another hour. A credit already
     * spent is left alone — it is a fact about a class the child sat in on.
     */
    async releaseBookingsOn(classSessionId: number, manager?: EntityManager): Promise<number> {
        const repository = manager ? manager.getRepository(MakeUpCredit) : this.creditRepository;
        const booked = await repository.find({ where: { bookedSession: { id: classSessionId }, consumedAttendance: IsNull() } });
        if (booked.length === 0) return 0;

        for (const credit of booked) {
            credit.bookedSession = null;
        }
        await repository.save(booked);
        this.logger.log(`Cancelled session ${classSessionId}: released ${booked.length} make-up booking(s).`);
        return booked.length;
    }

    /**
     * Withdraws a credit that should not have been earned — called when a mark is corrected to
     * present. A teacher fixing a mistap must not leave a family holding a right they did not earn.
     *
     * Only an unspent, unbooked credit is withdrawn. One already used is a fact about a class the
     * child sat in on, and no correction to a different register can undo that.
     */
    async revokeFor(childId: number, classSessionId: number): Promise<void> {
        const credit = await this.creditRepository.findOne({
            where: { child: { id: childId }, originSession: { id: classSessionId } },
            relations: { consumedAttendance: true, bookedSession: true },
        });
        if (!credit || credit.consumedAttendance || credit.bookedSession) return;
        await this.creditRepository.delete(credit.id);
    }

    /**
     * The classes a credit can be spent on.
     *
     * Compatible means, in the order checked: not the child's own group (sitting in on your own
     * class is just attending it); inside the validity window; still to come; not cancelled; the
     * child's age within the host group's band; and a seat actually free at that hour.
     *
     * **"Același modul" from the story is not checked, because modules do not exist** — E10 is cut
     * from the MVP. The age band is what the platform has to say two groups teach near-enough the
     * same thing, and it is the same signal enrolment uses.
     */
    async optionsFor(creditId: number, role: Role, userId: number, now: Date = new Date()): Promise<MakeUpOption[]> {
        const credit = await this.requireOwn(creditId, role, userId);
        if (this.statusOf(credit, now) !== MakeUpStatus.AVAILABLE) return [];

        const age = ageOf(credit.child.birthDate, now);
        const ownGroupId = credit.originSession.group.id;

        const candidates = await this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .leftJoinAndSelect('session.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            .andWhere('session.date > :today', { today: toIsoDate(now) })
            .andWhere('session.date <= :expires', { expires: toIsoDate(credit.expiresOn) })
            .andWhere('session.status = :status', { status: ClassSessionStatus.SCHEDULED })
            .andWhere('group.id != :ownGroupId', { ownGroupId })
            .andWhere('group.isActive = true')
            .andWhere('group.minAge <= :age AND group.maxAge >= :age', { age })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .getMany();

        const options: MakeUpOption[] = [];
        for (const session of candidates) {
            const free = await this.freeSeatsAt(session);
            if (free <= 0) continue;
            options.push({
                sessionId: session.id,
                date: toIsoDate(session.date),
                startTime: session.startTime,
                endTime: session.endTime,
                groupId: session.group.id,
                groupName: session.group.name,
                locationName: session.room?.location?.name ?? null,
                free,
            });
        }
        return options;
    }

    /**
     * Seats free at one class, which is **not** the group's enrolment headroom.
     *
     * A make-up child sits in a chair at a computer for that hour, exactly as a trial does (D7), so
     * the count is enrolments in force plus make-ups already booked onto this very session. A group
     * that is full of its own children has no room for a visitor even though nobody is "enrolled"
     * in the visit.
     *
     * The counting itself moved to `EnrollmentService.freeSeatsAt` when E20/S2 needed the same answer
     * for the public booking form — D7 gets one owner, next to `occupancyOf`, rather than a copy per
     * caller. This stays as the name the rest of this service already used.
     */
    private async freeSeatsAt(session: ClassSession): Promise<number> {
        return this.enrollments.freeSeatsAt(session);
    }

    /** Books the credit onto a class the parent chose. Re-checks everything `optionsFor` filtered on. */
    async book(creditId: number, sessionId: number, role: Role, userId: number, now: Date = new Date()): Promise<MakeUpCredit> {
        const credit = await this.requireOwn(creditId, role, userId);

        const status = this.statusOf(credit, now);
        if (status === MakeUpStatus.CONSUMED) {
            throw new ConflictException({ message: 'Recuperarea a fost deja folosită.', error: 'MAKE_UP_ALREADY_CONSUMED' });
        }
        if (status === MakeUpStatus.EXPIRED) {
            throw new ConflictException({
                message: `Recuperarea a expirat pe ${toIsoDate(credit.expiresOn)}.`,
                error: 'MAKE_UP_EXPIRED',
            });
        }

        const session = await this.classSessionRepository.findOne({
            where: { id: sessionId },
            relations: { group: true, room: { location: true } },
        });
        if (!session) throw new NotFoundException('Class session not found');

        // Re-checked rather than trusted: the options list was a snapshot, and a seat can go
        // between reading it and pressing the button.
        if (session.group.id === credit.originSession.group.id) {
            throw new BadRequestException({
                message: 'Asta e chiar grupa copilului — nu e o recuperare, e ora lui.',
                error: 'MAKE_UP_SAME_GROUP',
            });
        }
        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({ message: 'Ședința e anulată.', error: 'CLASS_SESSION_CANCELLED' });
        }
        if (toIsoDate(session.date) <= toIsoDate(now) || hasExpired(credit.expiresOn, session.date)) {
            throw new ConflictException({
                message: 'Ședința e în afara perioadei în care poate fi folosită recuperarea.',
                error: 'MAKE_UP_SESSION_OUT_OF_WINDOW',
            });
        }
        const age = ageOf(credit.child.birthDate, now);
        if (age < session.group.minAge || age > session.group.maxAge) {
            throw new ConflictException({
                message: `Grupa „${session.group.name}" este pentru ${session.group.minAge}-${session.group.maxAge} ani.`,
                error: 'MAKE_UP_AGE_MISMATCH',
            });
        }
        if ((await this.freeSeatsAt(session)) <= 0) {
            throw new ConflictException({ message: 'Nu mai e loc la ședința asta.', error: 'MAKE_UP_SESSION_FULL' });
        }

        credit.bookedSession = session;
        return this.creditRepository.save(credit);
    }

    /** Un-books, leaving the credit available again for whatever is left of its window. */
    async cancelBooking(creditId: number, role: Role, userId: number): Promise<MakeUpCredit> {
        const credit = await this.requireOwn(creditId, role, userId);
        if (credit.consumedAttendance) {
            throw new ConflictException({ message: 'Recuperarea a fost deja folosită.', error: 'MAKE_UP_ALREADY_CONSUMED' });
        }
        credit.bookedSession = null;
        return this.creditRepository.save(credit);
    }

    /**
     * Spends the credit — called when a visiting child is marked at their host class.
     *
     * The link to the attendance row **is** the consumed state, which is why the mark is what
     * spends it: `AttendanceType.MAKE_UP` is already written for any child marked outside their own
     * group, so "was present in another group" now means "used their make-up" instead of being a
     * remark nothing acts on. A child marked absent at the class they booked spends nothing — they
     * did not turn up, and the credit lives out the rest of its window.
     */
    async consumeFor(childId: number, classSessionId: number, attendance: Attendance, present: boolean): Promise<void> {
        if (!present) return;

        const credit = await this.creditRepository.findOne({
            where: { child: { id: childId }, bookedSession: { id: classSessionId } },
            relations: { consumedAttendance: true },
        });
        if (!credit || credit.consumedAttendance) return;

        credit.consumedAttendance = attendance;
        await this.creditRepository.save(credit);
        this.logger.log(`Child ${childId} used make-up credit ${credit.id} at session ${classSessionId}.`);
    }

    /**
     * A family's credits, newest first, with the derived state on each.
     *
     * Expired ones are included: „ai avut o recuperare și a trecut" is something a parent may need
     * to see, and hiding it turns a rule into a surprise.
     */
    async listFor(role: Role, userId: number, now: Date = new Date()) {
        const qb = this.creditRepository
            .createQueryBuilder('credit')
            .leftJoinAndSelect('credit.child', 'child')
            .leftJoinAndSelect('credit.originSession', 'origin')
            .leftJoinAndSelect('origin.group', 'originGroup')
            .leftJoinAndSelect('credit.bookedSession', 'booked')
            .leftJoinAndSelect('booked.group', 'bookedGroup')
            .leftJoinAndSelect('credit.consumedAttendance', 'consumed')
            .orderBy('credit.id', 'DESC');

        if (role !== Role.ADMIN) {
            qb.leftJoin('child.parent', 'parent').leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }

        const credits = await qb.getMany();
        return credits.map((credit) => ({ ...credit, status: this.statusOf(credit, now) }));
    }

    /** A credit the caller is entitled to see, or a 404 that says nothing about whose it is. */
    private async requireOwn(creditId: number, role: Role, userId: number): Promise<MakeUpCredit> {
        const credit = await this.creditRepository.findOne({
            where: { id: creditId },
            relations: {
                child: { parent: { user: true } },
                originSession: { group: true },
                bookedSession: true,
                consumedAttendance: true,
            },
        });
        if (!credit) throw new NotFoundException('Make-up credit not found');
        if (role !== Role.ADMIN && credit.child.parent.user?.id !== userId) {
            throw new NotFoundException('Make-up credit not found');
        }
        return credit;
    }
}
