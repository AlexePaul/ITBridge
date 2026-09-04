import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Lead } from 'src/entities/lead.entity';
import { User } from 'src/entities/user.entity';
import { LeadSource } from 'src/enum/lead-source.enum';
import { LeadStatus, SETTLED_LEAD_STATUSES } from 'src/enum/lead-status.enum';
import { parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { schoolDay } from 'src/common/school-clock';
import { CreateLeadDto } from './dto/createLead.dto';
import { FilterLeadsDto } from './dto/filterLeads.dto';
import { LoseLeadDto } from './dto/loseLead.dto';
import { UpdateLeadDto } from './dto/updateLead.dto';
import { daysSince, STALE_LEAD_DAYS } from './lead.rules';

/**
 * The admin half of the funnel — E20/S1 and S3.
 *
 * Two of the six statuses are written from here and only two: `CONTACTED`, which is a person saying
 * they spoke to a family, and `LOST`, which is a person saying why it ended. The other four are
 * consequences — the booking form opens a lead at `TRIAL_SCHEDULED`, the register makes it
 * `TRIAL_HELD`, E11 makes it `ENROLLED`. There is deliberately no general "set the status" endpoint:
 * S4 counts these columns, and a screen able to write `enrolled` on a family nobody enrolled would
 * make the one number the epic exists to produce a number nobody can trust.
 *
 * `lastActivityAt` is stamped by every method here, because every method here is a person doing
 * something. The reminder job pointedly does not touch it — a lead cannot become fresh by being
 * reminded about.
 */
@Injectable()
export class LeadService {
    private readonly logger = new Logger('Lead');

    constructor(@InjectRepository(Lead) private readonly leadRepository: Repository<Lead>) {}

    /** Everything open, longest untouched first, with the people and places a screen shows. */
    async list(filters: FilterLeadsDto): Promise<LeadSummary[]> {
        const qb = this.leadRepository
            .createQueryBuilder('lead')
            .leftJoinAndSelect('lead.location', 'location')
            .leftJoinAndSelect('lead.group', 'group')
            .leftJoinAndSelect('lead.trialSession', 'trialSession')
            // The owner's name, not their password hash and not their sessions: the columns are
            // listed rather than pulled through the relation, the habit E11 settled on.
            .leftJoin('lead.assignedTo', 'assignedTo')
            .addSelect(['assignedTo.id', 'assignedTo.username']);

        if (filters.status) {
            qb.andWhere('lead.status = :status', { status: filters.status });
        } else if (!filters.includeSettled) {
            qb.andWhere('lead.status NOT IN (:...settled)', { settled: [...SETTLED_LEAD_STATUSES] });
        }

        if (filters.unassigned) {
            qb.andWhere('lead.assigned_to_id IS NULL');
        } else if (filters.assignedToId) {
            qb.andWhere('lead.assigned_to_id = :assignedToId', { assignedToId: filters.assignedToId });
        }

        const leads = await qb.orderBy('lead.lastActivityAt', 'ASC').addOrderBy('lead.id', 'ASC').getMany();
        return leads.map(toSummary);
    }

    async findOne(id: number): Promise<LeadSummary> {
        const lead = await this.leadRepository.findOne({
            where: { id },
            relations: {
                location: true,
                group: { room: { location: true } },
                trialSession: true,
                child: true,
                profile: true,
                enrollment: true,
                assignedTo: true,
            },
        });
        if (!lead) {
            throw new NotFoundException('Lead not found');
        }
        return toSummary(lead);
    }

    /**
     * The screen this story is really about — E20/S3.
     *
     * Trials that happened and that nobody has decided about. It is the most expensive list in the
     * platform: every family on it has already been given a seat, a teacher and an hour of class,
     * and the only thing standing between that and an enrolment is somebody remembering. Ordered
     * oldest first, because the oldest is the one being lost.
     */
    async undecidedTrials(now: Date = new Date()): Promise<{ lead: LeadSummary; days: number }[]> {
        const leads = await this.leadRepository.find({
            where: { status: LeadStatus.TRIAL_HELD },
            relations: { group: true, assignedTo: true, trialSession: true },
            order: { trialHeldAt: 'ASC' },
        });
        return leads.map((lead) => ({ lead: toSummary(lead), days: daysSince(lead.trialHeldAt ?? lead.lastActivityAt, now) }));
    }

    /** A lead an admin types in from a phone call. */
    async create(dto: CreateLeadDto, actingUserId: number, now: Date = new Date()): Promise<LeadSummary> {
        if (!dto.parentEmail && !dto.parentPhone) {
            throw new BadRequestException({ message: 'Un lead are nevoie de un email sau de un telefon', error: 'CONTACT_REQUIRED' });
        }

        const lead = await this.leadRepository.save({
            status: LeadStatus.NEW,
            source: dto.source ?? LeadSource.PHONE,
            channel: dto.channel ?? null,
            parentName: dto.parentName,
            parentEmail: dto.parentEmail ?? null,
            parentPhone: dto.parentPhone ?? null,
            childFirstName: dto.childFirstName,
            childLastName: dto.childLastName,
            childBirthDate: parseIsoDate(dto.childBirthDate),
            experience: dto.experience ?? null,
            location: dto.locationId ? { id: dto.locationId } : null,
            notes: dto.notes ?? null,
            nextActionAt: dto.nextActionAt ? parseIsoDate(dto.nextActionAt) : null,
            // Whoever writes a lead down owns it until they hand it on. It is the one moment where
            // an owner can be assigned without guessing, so it would be perverse not to.
            assignedTo: { id: actingUserId } as User,
            noSeats: false,
            lastActivityAt: now,
            bookingKey: null,
        } as Partial<Lead>);

        this.logger.log(`Lead ${lead.id} created by user ${actingUserId} from ${dto.source}.`);
        return this.findOne(lead.id);
    }

    async update(id: number, dto: UpdateLeadDto, now: Date = new Date()): Promise<LeadSummary> {
        const lead = await this.findOne(id);

        if (dto.assignedToId !== undefined && dto.unassign) {
            throw new BadRequestException({ message: 'Alege: fie îi dai un responsabil, fie i-l iei', error: 'ASSIGNMENT_AMBIGUOUS' });
        }

        await this.leadRepository.update(
            { id: lead.id },
            {
                ...(dto.parentEmail !== undefined ? { parentEmail: dto.parentEmail } : {}),
                ...(dto.parentPhone !== undefined ? { parentPhone: dto.parentPhone } : {}),
                ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
                ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
                ...(dto.clearNextAction ? { nextActionAt: null } : dto.nextActionAt !== undefined ? { nextActionAt: parseIsoDate(dto.nextActionAt) } : {}),
                ...(dto.unassign ? { assignedTo: null } : dto.assignedToId !== undefined ? { assignedTo: { id: dto.assignedToId } } : {}),
                lastActivityAt: now,
            },
        );

        return this.findOne(id);
    }

    /** Somebody spoke to the family. The one status an admin declares that is not an ending. */
    async markContacted(id: number, now: Date = new Date()): Promise<LeadSummary> {
        const lead = await this.findOne(id);
        if (lead.status !== LeadStatus.NEW) {
            throw new ConflictException({
                message: 'Doar o cerere nouă se marchează drept contactată; restul stărilor vin din ce s-a întâmplat.',
                error: 'LEAD_NOT_NEW',
            });
        }
        await this.leadRepository.update({ id }, { status: LeadStatus.CONTACTED, lastActivityAt: now });
        return this.findOne(id);
    }

    /**
     * The written ending — E20/S3's "no silent exit".
     *
     * A lead never leaves the follow-up lists because time passed; it leaves because somebody said
     * why. Refused on a lead already enrolled, because that is not an ending anybody may overwrite
     * from this screen: the enrolment in E11 is the fact, and this row only records it.
     */
    async markLost(id: number, dto: LoseLeadDto, now: Date = new Date()): Promise<LeadSummary> {
        const lead = await this.findOne(id);
        if (lead.status === LeadStatus.ENROLLED) {
            throw new ConflictException({
                message: 'Familia este deja înscrisă. Dacă a renunțat, se închide înscrierea, nu cererea.',
                error: 'LEAD_ALREADY_ENROLLED',
            });
        }
        await this.leadRepository.update({ id }, { status: LeadStatus.LOST, lostReason: dto.reason, decidedAt: now, lastActivityAt: now });
        this.logger.log(`Lead ${id} closed as lost: ${dto.reason}`);
        return this.findOne(id);
    }

    /**
     * What the daily message to the office is made of — E20/S3.
     *
     * A read, with no writes and no side effects, so the job that sends it stays what a job should
     * be: an alarm clock with a `@Cron` on it. It is also why this is testable without one — a
     * `@Cron` never fires under `NODE_ENV=test`.
     */
    async followUp(now: Date = new Date()): Promise<LeadFollowUp> {
        const open = await this.leadRepository.find({
            where: { status: Not(In([...SETTLED_LEAD_STATUSES])) },
            relations: { assignedTo: true, group: true },
            order: { lastActivityAt: 'ASC' },
        });

        const withDays = (lead: Lead) => ({ lead: toSummary(lead), days: daysSince(lead.lastActivityAt, now) });
        // The school's day, not the server's: through UTC, a follow-up due today is not due yet at
        // 01:00 Bucharest time, and one due yesterday quietly stays due for an extra hour.
        const today = schoolDay(now);

        return {
            undecided: open
                .filter((lead) => lead.status === LeadStatus.TRIAL_HELD)
                .map((lead) => ({ lead: toSummary(lead), days: daysSince(lead.trialHeldAt ?? lead.lastActivityAt, now) })),
            noSeats: open.filter((lead) => lead.noSeats).map(withDays),
            stale: open
                .filter((lead) => lead.status !== LeadStatus.TRIAL_HELD && !lead.noSeats && daysSince(lead.lastActivityAt, now) >= STALE_LEAD_DAYS)
                .map(withDays),
            due: open.filter((lead) => lead.nextActionAt !== null && toDateKey(lead.nextActionAt) <= today).map(withDays),
            unassigned: open.filter((lead) => lead.assignedTo === null).length,
        };
    }

    /** Leads whose trial has been and gone with no attendance recorded — the no-show follow-up. */
    async awaitingNoShowFollowUp(): Promise<Lead[]> {
        return this.leadRepository.find({
            where: { status: LeadStatus.TRIAL_SCHEDULED, trialSession: { id: Not(IsNull()) } },
            relations: { trialSession: { group: { room: { location: true } } }, child: true },
            order: { id: 'ASC' },
        });
    }
}

/**
 * A `date` column arrives as a string from the driver and a `Date` from an in-memory entity.
 *
 * `toIsoDate` reads the local components rather than going through `toISOString()`, which would be
 * the off-by-one-day bug this codebase has written down twice: east of Greenwich it names the day
 * before.
 */
const toDateKey = (value: Date | string): string => toIsoDate(value);

/**
 * One lead as a screen needs it — E20/S1.
 *
 * A mapper rather than the entity, and for the ordinary reason: the row carries a `bookingKey`, a
 * shell `Profile` and the whole `Enrollment` behind it, none of which a screen has any use for, and
 * `bookingKey` in particular is a hash of a family's contact details. Sending only the named columns
 * is the same habit `waitlistFor` settled on in E11.
 */
export interface LeadSummary {
    id: number;
    status: LeadStatus;
    source: Lead['source'];
    channel: Lead['channel'];
    parentName: string;
    parentEmail: string | null;
    parentPhone: string | null;
    childFirstName: string;
    childLastName: string;
    childBirthDate: string;
    experience: string | null;
    noSeats: boolean;
    lostReason: string | null;
    notes: string | null;
    nextActionAt: string | null;
    lastActivityAt: Date;
    trialHeldAt: Date | null;
    decidedAt: Date | null;
    createdAt: Date;
    location: { id: number; name: string } | null;
    group: { id: number; name: string } | null;
    trialSession: { id: number; date: string; startTime: string } | null;
    assignedTo: { id: number; username: string } | null;
}

export interface LeadWithAge {
    lead: LeadSummary;
    days: number;
}

export interface LeadFollowUp {
    stale: LeadWithAge[];
    undecided: LeadWithAge[];
    noSeats: LeadWithAge[];
    due: LeadWithAge[];
    unassigned: number;
}

export function toSummary(lead: Lead): LeadSummary {
    return {
        id: lead.id,
        status: lead.status,
        source: lead.source,
        channel: lead.channel,
        parentName: lead.parentName,
        parentEmail: lead.parentEmail,
        parentPhone: lead.parentPhone,
        childFirstName: lead.childFirstName,
        childLastName: lead.childLastName,
        childBirthDate: toDateKey(lead.childBirthDate),
        experience: lead.experience,
        noSeats: lead.noSeats,
        lostReason: lead.lostReason,
        notes: lead.notes,
        nextActionAt: lead.nextActionAt ? toDateKey(lead.nextActionAt) : null,
        lastActivityAt: lead.lastActivityAt,
        trialHeldAt: lead.trialHeldAt,
        decidedAt: lead.decidedAt,
        createdAt: lead.createdAt,
        location: lead.location ? { id: lead.location.id, name: lead.location.name } : null,
        group: lead.group ? { id: lead.group.id, name: lead.group.name } : null,
        trialSession: lead.trialSession ? { id: lead.trialSession.id, date: toDateKey(lead.trialSession.date), startTime: lead.trialSession.startTime } : null,
        assignedTo: lead.assignedTo ? { id: lead.assignedTo.id, username: lead.assignedTo.username } : null,
    };
}
