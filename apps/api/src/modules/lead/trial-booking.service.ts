import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { Lead } from 'src/entities/lead.entity';
import { Profile } from 'src/entities/profile.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { ageOf, EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { schoolDay } from 'src/common/school-clock';
import { BookTrialDto } from './dto/bookTrial.dto';
import { TrialSlotsDto } from './dto/trialSlots.dto';
import { bookingKeyFor, TRIAL_HORIZON_DAYS } from './lead.rules';
import { composeTrialConfirmation } from './lead-mail';

/**
 * The public half of the funnel — E20/S2.
 *
 * A parent picks an hour and leaves their details, and none of it requires an account. That is the
 * epic's decision restated in code: a trial booking **is a lead, not an obligation**, so the barrier
 * has to stay on the floor — while enrolment, which needs a checked seat, a signed contract and
 * billing details, stays an admin's job in E11. Nothing here creates a `User`, and the confirmation
 * mail promises a class and a phone call, never a place in a group.
 *
 * **It does create a `Profile` and a `Child`, and that is not a contradiction.** A trial takes one
 * of the room's ten seats (E11/D7) and has to appear in the group's register, and a seat cannot be
 * held by a row with no child in it. So the booking writes a *shell* family: names only, **no email,
 * no phone, no account**. Those two columns on `Profile` are unique, and writing a stranger's
 * address into them from a public form would either collide with a real family or, far worse, hang
 * a child off one. The family's own details stay on the lead until an admin puts them on the profile
 * deliberately, at enrolment.
 *
 * Everything the booking touches — profile, child, trial enrolment, lead, confirmation — is one
 * transaction. A seat taken by a booking that then failed is a seat nobody can find their way back
 * to, and a confirmation for a booking that did not happen is worse.
 */
@Injectable()
export class TrialBookingService {
    private readonly logger = new Logger('TrialBooking');

    constructor(
        @InjectRepository(Lead) private readonly leadRepository: Repository<Lead>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        private readonly enrollments: EnrollmentService,
        private readonly outbox: OutboxService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /**
     * The hours a child of this age can actually be offered — E20/S2.
     *
     * Three filters, and the middle one is the story: the age has to fit, the group has to be
     * active, and **there has to be a free seat**. "With free seats" is a hard condition, not a
     * courtesy: a full group physically cannot take a trial, so offering one would be promising a
     * chair that does not exist. Seats are counted through `EnrollmentService.occupancyOf`, the same
     * function the admin screens use, because a second way of counting is a second answer.
     *
     * The age filter is *harder* here than in E11, where it is a warning an admin may overrule. An
     * admin overruling it is a judgement about a particular child by somebody who has met them; a
     * public form has nobody to make that judgement, so it offers only what fits.
     */
    async slots(query: TrialSlotsDto, now: Date = new Date()): Promise<TrialSlot[]> {
        const age = ageOf(query.birthDate, now);
        const groups = await this.groupRepository.find({
            where: {
                isActive: true,
                minAge: LessThanOrEqual(age),
                maxAge: MoreThanOrEqual(age),
                ...(query.locationId ? { room: { location: { id: query.locationId } } } : {}),
            },
            relations: { room: { location: true } },
            order: { weekday: 'ASC', startTime: 'ASC' },
        });

        const activeGroups = groups.filter((group) => group.room?.location?.isActive !== false);
        if (activeGroups.length === 0) return [];

        const from = schoolDay(now);
        const until = toIsoDate(addDays(parseIsoDate(from), TRIAL_HORIZON_DAYS));

        const sessions = await this.classSessionRepository.find({
            where: {
                group: { id: In(activeGroups.map((group) => group.id)) },
                status: ClassSessionStatus.SCHEDULED,
                // `Between`, not two operators joined with `&&` — that evaluates in JavaScript and
                // silently keeps only the right-hand one, which would have offered every past class.
                date: Between(from, until) as unknown as Date,
            },
            relations: { group: true },
            order: { date: 'ASC' },
        });

        // Seats are counted **per class**, not per group. A group with one place left has none at all
        // on a Monday somebody has already booked a make-up onto, and one again the Monday after —
        // so the filter belongs on the date, which is what the parent is actually choosing. One
        // batched query for the lot: a query per hour is how a public page becomes slow.
        const freeSeats = await this.enrollments.freeSeatsAtSessions(sessions.map((session) => ({ id: session.id, group: session.group })));

        const offered: TrialSlot[] = [];
        for (const group of activeGroups) {
            const upcoming = sessions
                .filter((session) => session.group.id === group.id)
                .filter((session) => (freeSeats.get(session.id) ?? 0) > 0)
                .map((session) => ({ id: session.id, date: toIsoDate(new Date(session.date)) }))
                .filter((session) => session.date >= from && session.date <= until);
            // Every hour taken means the group is not offered at all, rather than offered with an
            // empty list of dates.
            if (upcoming.length === 0) continue;

            offered.push({
                groupId: group.id,
                groupName: group.name,
                weekday: group.weekday,
                startTime: group.startTime,
                endTime: group.endTime,
                locationId: group.room.location.id,
                locationName: group.room.location.name,
                address: addressOf(group.room.location),
                sessions: upcoming,
            });
        }

        return offered;
    }

    /**
     * Books the trial, or keeps the family anyway — E20/S2.
     *
     * There are three endings and only one of them is a refusal the parent sees as one:
     *
     *  - the hour is free, and the trial is booked;
     *  - the parent found no hour to pick, so the request is kept as a lead marked "no seats";
     *  - the seat went between the page loading and the button being pressed — which is the same
     *    ending as the second, on purpose. The screen a parent saw is a photograph, not a
     *    reservation, and the worst outcome of a race is not an error page, it is a family who
     *    leaves without the school knowing they came. So the lead is written and the answer says
     *    somebody will call.
     */
    async book(
        dto: BookTrialDto,
        now: Date = new Date(),
    ): Promise<{ status: 'booked' | 'no_seats'; leadId: number; trial?: { date: string; startTime: string; groupName: string; locationName: string } }> {
        if (!dto.parentEmail && !dto.parentPhone) {
            throw new BadRequestException({
                message: 'Lasă un email sau un telefon, ca să te putem contacta',
                error: 'CONTACT_REQUIRED',
            });
        }

        const bookingKey = bookingKeyFor({
            childFirstName: `${dto.childFirstName} ${dto.childLastName}`,
            childBirthDate: dto.childBirthDate,
            classSessionId: dto.classSessionId ?? null,
            contact: dto.parentEmail ?? dto.parentPhone ?? '',
        });

        const alreadyBooked = await this.leadRepository.findOne({ where: { bookingKey }, relations: { trialSession: true, group: true } });
        if (alreadyBooked) {
            // The same press twice. Answering as if it were the first is deliberate: the parent's
            // request is on file, which is all they were asking for, and an error would send them
            // looking for a second way to ask.
            this.logger.log(`Repeat booking press ignored; lead ${alreadyBooked.id} already holds it.`);
            return alreadyBooked.noSeats
                ? { status: 'no_seats', leadId: alreadyBooked.id }
                : { status: 'booked', leadId: alreadyBooked.id, trial: await this.describeTrial(alreadyBooked.trialSession?.id) };
        }

        if (!dto.classSessionId) {
            const lead = await this.recordNoSeats(dto, bookingKey, null, now);
            return { status: 'no_seats', leadId: lead.id };
        }

        const session = await this.classSessionRepository.findOne({
            where: { id: dto.classSessionId },
            relations: { group: { room: { location: true } } },
        });
        if (!session) {
            throw new NotFoundException('Class session not found');
        }
        if (session.status !== ClassSessionStatus.SCHEDULED) {
            throw new ConflictException({ message: 'Ora aleasă nu se mai ține. Alege alta din listă.', error: 'TRIAL_SESSION_UNAVAILABLE' });
        }
        const sessionDate = toIsoDate(new Date(session.date));
        if (sessionDate < schoolDay(now)) {
            throw new ConflictException({ message: 'Ora aleasă a trecut. Alege alta din listă.', error: 'TRIAL_SESSION_UNAVAILABLE' });
        }

        const age = ageOf(dto.childBirthDate, now);
        if (age < session.group.minAge || age > session.group.maxAge) {
            throw new ConflictException({
                message: `Grupa ${session.group.name} este pentru copii de ${session.group.minAge}-${session.group.maxAge} ani.`,
                error: 'TRIAL_AGE_MISMATCH',
            });
        }

        try {
            return await this.dataSource.transaction(async (manager) => {
                // Re-checked here, inside the transaction, and on the **class** rather than the
                // group: the list the parent saw is a photograph, and between it and this line a
                // make-up may have been booked onto exactly this hour. `enrol` below still checks
                // the group, which is the other half of D7.
                const seats = await this.enrollments.freeSeatsAt({ id: session.id, group: session.group }, manager);
                if (seats <= 0) {
                    throw new ConflictException({ message: 'Ora aleasă tocmai s-a ocupat', error: 'GROUP_FULL' });
                }

                const profile = await manager.save(Profile, {
                    ...splitParentName(dto.parentName),
                    // Deliberately no email and no phone — see the class comment. They are unique
                    // columns, and a public form must not be able to write into another family's row.
                    marketingOptIn: false,
                });

                const child = await manager.save(Child, {
                    parent: { id: profile.id } as Profile,
                    firstName: dto.childFirstName,
                    lastName: dto.childLastName,
                    birthDate: parseIsoDate(dto.childBirthDate),
                    group: null,
                });

                const enrollment = await this.enrollments.enrol(
                    { childId: child.id, groupId: session.group.id, status: EnrollmentStatus.TRIAL, startDate: sessionDate },
                    null,
                    manager,
                );

                const lead = await manager.save(Lead, {
                    status: LeadStatus.TRIAL_SCHEDULED,
                    source: LeadSource.TRIAL_FORM,
                    channel: dto.channel ?? null,
                    parentName: dto.parentName,
                    parentEmail: dto.parentEmail ?? null,
                    parentPhone: dto.parentPhone ?? null,
                    childFirstName: dto.childFirstName,
                    childLastName: dto.childLastName,
                    childBirthDate: parseIsoDate(dto.childBirthDate),
                    experience: dto.experience ?? null,
                    location: { id: session.group.room.location.id },
                    group: { id: session.group.id },
                    trialSession: { id: session.id },
                    profile: { id: profile.id },
                    child: { id: child.id },
                    enrollment: { id: enrollment.id },
                    noSeats: false,
                    lastActivityAt: now,
                    bookingKey,
                });

                const trial = {
                    childFirstName: dto.childFirstName,
                    groupName: session.group.name,
                    locationName: session.group.room.location.name,
                    address: addressOf(session.group.room.location),
                    date: sessionDate,
                    startTime: session.startTime,
                };

                // In the transaction, like every other message this codebase queues: the family is
                // told because the booking happened, or neither.
                await this.outbox.queueOrRecord({ email: dto.parentEmail ?? null }, composeTrialConfirmation(trial), manager);

                this.logger.log(`Trial booked from the public form: lead ${lead.id}, session ${session.id}, group ${session.group.id}.`);
                return {
                    status: 'booked' as const,
                    leadId: lead.id,
                    trial: { date: sessionDate, startTime: session.startTime, groupName: session.group.name, locationName: session.group.room.location.name },
                };
            });
        } catch (error) {
            if (error instanceof ConflictException && errorCodeOf(error) === 'GROUP_FULL') {
                // Somebody took the last seat while this parent was filling the form in. The
                // transaction is gone; what must not be gone is the family.
                const lead = await this.recordNoSeats(dto, bookingKey, session.group, now);
                this.logger.log(`Seat in group ${session.group.id} went before the booking landed; kept lead ${lead.id} instead.`);
                return { status: 'no_seats', leadId: lead.id };
            }
            throw error;
        }
    }

    /** The request nobody could seat. The measure S4 asks for, and a family somebody has to ring. */
    private async recordNoSeats(dto: BookTrialDto, bookingKey: string, group: Group | null, now: Date): Promise<Lead> {
        return this.leadRepository.save({
            status: LeadStatus.NEW,
            source: LeadSource.TRIAL_FORM,
            channel: dto.channel ?? null,
            parentName: dto.parentName,
            parentEmail: dto.parentEmail ?? null,
            parentPhone: dto.parentPhone ?? null,
            childFirstName: dto.childFirstName,
            childLastName: dto.childLastName,
            childBirthDate: parseIsoDate(dto.childBirthDate),
            experience: dto.experience ?? null,
            location: dto.locationId ? { id: dto.locationId } : group ? { id: group.room?.location?.id } : null,
            group: group ? { id: group.id } : null,
            noSeats: true,
            lastActivityAt: now,
            bookingKey,
        } as Partial<Lead>);
    }

    private async describeTrial(sessionId?: number) {
        if (!sessionId) return undefined;
        const session = await this.classSessionRepository.findOne({ where: { id: sessionId }, relations: { group: { room: { location: true } } } });
        if (!session) return undefined;
        return {
            date: toIsoDate(new Date(session.date)),
            startTime: session.startTime,
            groupName: session.group.name,
            locationName: session.group.room.location.name,
        };
    }
}

/** One hour a parent can pick, with the dates it actually runs on. */
export interface TrialSlot {
    groupId: number;
    groupName: string;
    weekday: number;
    startTime: string;
    endTime: string;
    locationId: number;
    locationName: string;
    address: string;
    sessions: { id: number; date: string }[];
}

/** The address as somebody would read it out — the two columns the entity actually has. */
const addressOf = (location: { street: string; city: string }): string => `${location.street}, ${location.city}`;

/**
 * "Ioana Popescu" into a first and a last name, for the shell profile.
 *
 * The last word is the surname, everything before it the given names — which is how a Romanian
 * writes their name on a form, and wrong often enough that an admin fixes it at enrolment. A single
 * word leaves the surname **empty** rather than repeating the first: an empty field reads as "not
 * asked", and somebody filling the family in later can see that at a glance, where "Ioana Ioana"
 * would look like data.
 */
export function splitParentName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/** The typed code a service put on its own conflict, when it put one there. */
function errorCodeOf(error: ConflictException): string | undefined {
    const response = error.getResponse();
    return typeof response === 'object' && response !== null ? (response as { error?: string }).error : undefined;
}
