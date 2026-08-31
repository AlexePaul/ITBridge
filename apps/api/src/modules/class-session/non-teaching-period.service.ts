import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NonTeachingPeriod } from 'src/entities/non-teaching-period.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Location } from 'src/entities/location.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { addDays, parseIsoDate, toIsoDate } from './class-session.dates';

/**
 * The days on which the school does not teach — E12/S2.
 *
 * Two jobs, and the second is the one that makes the first worth having: keeping the list, and
 * making the timetable obey it. A calendar nothing reads is a calendar nobody maintains.
 */

/** What adding a period would do, before it is added. */
export interface NonTeachingImpact {
    /** Sessions already on the timetable that fall inside the period. */
    affected: { id: number; date: string; groupId: number; groupName: string }[];
    /** Per group, so the screen can say "grupa de luni pierde 2 ședințe". */
    byGroup: { groupId: number; groupName: string; count: number; dates: string[] }[];
}

@Injectable()
export class NonTeachingPeriodService {
    private readonly logger = new Logger('NonTeaching');

    constructor(
        @InjectRepository(NonTeachingPeriod) private readonly periodRepository: Repository<NonTeachingPeriod>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    async findAll(): Promise<NonTeachingPeriod[]> {
        return this.periodRepository.find({ relations: { location: true }, order: { startDate: 'ASC' } });
    }

    /**
     * Every non-teaching date in a range, as `YYYY-MM-DD`, for one location.
     *
     * Returned as a `Set` because the only caller asks "is this day one of them?" once per candidate
     * date, and a range of eight weeks against a dozen periods is otherwise a nested loop written
     * out longhand.
     *
     * A period with no location applies everywhere, so it is always included.
     */
    async datesIn(from: Date, until: Date, locationId?: number | null): Promise<Set<string>> {
        const periods = await this.periodRepository
            .createQueryBuilder('period')
            .leftJoin('period.location', 'location')
            .addSelect(['location.id'])
            .where('period.startDate <= :until', { until: toIsoDate(addDays(until, -1)) })
            .andWhere('period.endDate >= :from', { from: toIsoDate(from) })
            .andWhere(locationId === undefined || locationId === null ? '1 = 1' : '(location.id IS NULL OR location.id = :locationId)', { locationId })
            .getMany();

        const dates = new Set<string>();
        for (const period of periods) {
            let cursor = parseIsoDate(period.startDate);
            const last = parseIsoDate(period.endDate);
            while (cursor <= last) {
                dates.add(toIsoDate(cursor));
                cursor = addDays(cursor, 1);
            }
        }
        return dates;
    }

    /**
     * What a period would hit, without writing anything.
     *
     * This is the whole safety story for a screen where one mistyped date silently removes classes.
     * A typo shows up here as "grupa de luni pierde 8 ședințe" rather than as a gap somebody notices
     * in January.
     */
    async impactOf(input: { startDate: string; endDate: string; locationId?: number | null }): Promise<NonTeachingImpact> {
        this.assertOrdered(input.startDate, input.endDate);

        const qb = this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .leftJoin('session.room', 'room')
            .leftJoin('room.location', 'location')
            .where('session.date BETWEEN :start AND :end', { start: input.startDate, end: input.endDate })
            .andWhere('session.status = :status', { status: ClassSessionStatus.SCHEDULED })
            .orderBy('session.date', 'ASC');

        if (input.locationId) {
            qb.andWhere('location.id = :locationId', { locationId: input.locationId });
        }

        const sessions = await qb.getMany();

        const byGroup = new Map<number, { groupId: number; groupName: string; count: number; dates: string[] }>();
        for (const session of sessions) {
            const groupId = session.group?.id ?? 0;
            const entry = byGroup.get(groupId) ?? { groupId, groupName: session.group?.name ?? 'Grupă necunoscută', count: 0, dates: [] };
            entry.count += 1;
            entry.dates.push(toIsoDate(session.date));
            byGroup.set(groupId, entry);
        }

        return {
            affected: sessions.map((session) => ({
                id: session.id,
                date: toIsoDate(session.date),
                groupId: session.group?.id ?? 0,
                groupName: session.group?.name ?? 'Grupă necunoscută',
            })),
            byGroup: [...byGroup.values()].sort((a, b) => b.count - a.count),
        };
    }

    /**
     * Adds a period and cancels the classes it covers.
     *
     * **Cancels, never deletes.** A class that was on the timetable and did not happen is a fact
     * about the term; deleting the row would leave the history saying the week simply had one fewer
     * class in it. `CANCELLED` is also what the attendance screen and the unmarked-attendance report
     * already understand, so nothing downstream needs teaching.
     */
    async create(input: {
        name: string;
        startDate: string;
        endDate: string;
        locationId?: number | null;
    }): Promise<{ period: NonTeachingPeriod; cancelled: number }> {
        this.assertOrdered(input.startDate, input.endDate);

        if (input.locationId) {
            const location = await this.locationRepository.findOne({ where: { id: input.locationId } });
            if (!location) throw new NotFoundException('Location not found');
        }

        // Any overlap in dates is refused, whatever the locations — deliberately symmetric. The
        // narrower rule ("only clashes that actually apply to the same rooms") would let a
        // school-wide holiday be added over a Străulești-only closure while refusing the same two
        // in the other order, so whether the second was accepted would depend on which had been
        // typed first. Two rows covering the same day are redundant either way; the message names
        // the one already there, so the way out is to delete it.
        const overlapping = await this.periodRepository
            .createQueryBuilder('period')
            .where('period.startDate <= :end', { end: input.endDate })
            .andWhere('period.endDate >= :start', { start: input.startDate })
            .getOne();

        if (overlapping) {
            throw new ConflictException({
                message: `Intervalul se suprapune cu „${overlapping.name}" (${overlapping.startDate} – ${overlapping.endDate})`,
                error: 'PERIOD_OVERLAPS',
            });
        }

        return this.dataSource.transaction(async (manager) => {
            const period = await manager.save(NonTeachingPeriod, {
                name: input.name,
                startDate: input.startDate,
                endDate: input.endDate,
                location: input.locationId ? ({ id: input.locationId } as Location) : null,
            });

            const impact = await this.impactOf(input);
            if (impact.affected.length > 0) {
                await manager
                    .createQueryBuilder()
                    .update(ClassSession)
                    .set({ status: ClassSessionStatus.CANCELLED, notes: `Anulată automat: ${input.name}` })
                    .whereInIds(impact.affected.map((session) => session.id))
                    .execute();
            }

            this.logger.log(`Added "${input.name}" (${input.startDate}–${input.endDate}); cancelled ${impact.affected.length} class session(s).`);
            return { period, cancelled: impact.affected.length };
        });
    }

    /**
     * Removes a period. The classes it cancelled stay cancelled.
     *
     * Reinstating them automatically would be a guess: a class cancelled for the winter break and a
     * class cancelled because the teacher was ill look identical afterwards, and the school may well
     * have rescheduled around both. `PUT /class-sessions/:id/reinstate` exists for the ones that
     * should come back, one at a time, deliberately.
     */
    async remove(id: number): Promise<{ message: string }> {
        const result = await this.periodRepository.delete(id);
        if (result.affected === 0) throw new NotFoundException('Non-teaching period not found');
        return { message: 'Intervalul a fost șters. Ședințele anulate rămân anulate.' };
    }

    private assertOrdered(startDate: string, endDate: string): void {
        if (parseIsoDate(endDate) < parseIsoDate(startDate)) {
            throw new BadRequestException({
                message: 'Data de sfârșit este înaintea celei de început',
                error: 'PERIOD_ENDS_BEFORE_IT_STARTS',
            });
        }
    }
}
