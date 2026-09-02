import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { roundToBani } from 'src/modules/invoice/pricing';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { LOST_REVENUE_PER_SEAT_MONTHLY, OCCUPANCY_THRESHOLD, TimetableSlot, deadSlotsOf, distinctSlots, fillRate, lostRevenueMonthly } from './reports.rules';

/** One group's seats, where it meets, and what its empty chairs cost. */
export interface OccupancyGroup {
    groupId: number;
    name: string;
    weekday: number;
    startTime: string;
    endTime: string;
    roomId: number;
    roomName: string;
    locationId: number;
    locationName: string;
    capacity: number;
    /** Enrolments in force — active plus trials, per D7. From `EnrollmentService.occupancyOf`. */
    taken: number;
    free: number;
    /** Children queueing for a seat. */
    waiting: number;
    /** `taken / capacity`, two decimals. */
    fillRate: number;
    /** Below `OccupancyReport.threshold`. */
    underThreshold: boolean;
    /** `free × ratePerSeat`. An estimate at list price; see the report's `ratePerSeat`. */
    lostRevenueMonthly: number;
}

/** A room, with the hours the rest of the school teaches while it stands empty. */
export interface OccupancyRoom {
    roomId: number;
    roomName: string;
    locationId: number;
    locationName: string;
    /** Chairs in the room. Groups may be capped lower; this is the ceiling. */
    roomCapacity: number;
    groups: number;
    /** Summed over the room's groups: seats offered, taken and free across the week. */
    capacity: number;
    taken: number;
    free: number;
    fillRate: number;
    /** Slots some other room teaches in and this one does not. Empty for the busiest room in the school. */
    deadSlots: TimetableSlot[];
}

/** An address, rolled up from its rooms. */
export interface OccupancyLocation {
    locationId: number;
    name: string;
    rooms: number;
    groups: number;
    capacity: number;
    taken: number;
    free: number;
    waiting: number;
    fillRate: number;
    lostRevenueMonthly: number;
}

export interface OccupancyReport {
    generatedOn: string;
    /** The fill rate under which a group is flagged. A proposal, shown so the screen can name it. */
    threshold: number;
    /** What one empty seat is worth per month at list price — the multiplier behind every `lostRevenueMonthly`. */
    ratePerSeat: number;
    /** Every active group, least full first. */
    groups: OccupancyGroup[];
    /** Every active room, with its dead hours. */
    rooms: OccupancyRoom[];
    locations: OccupancyLocation[];
    totals: {
        groups: number;
        capacity: number;
        taken: number;
        free: number;
        waiting: number;
        fillRate: number;
        underThreshold: number;
        lostRevenueMonthly: number;
        /** The distinct hours the school teaches in, across every room. The grid dead hours are measured against. */
        slotsInUse: TimetableSlot[];
    };
}

/**
 * Seats against capacity, by group, room and address — E21/S4.
 *
 * The question it answers is the one in the story: "putem deschide o grupă nouă, sau întâi le
 * umplem pe cele existente?" — which needs three things side by side: where the empty seats are,
 * what they cost, and when the rooms stand idle.
 *
 * **"Taken" is asked of `EnrollmentService.occupancyOf`**, one call per group, exactly as the
 * overview does. That method is where "a seat is taken" is defined — a trial child sits on a chair
 * (D7) — and a count written here would be a second definition, free to forget the trials and tell
 * the owner a full room has space. A dozen small counts per page load is the price of one answer.
 *
 * **Dead hours are measured against the school's own timetable, not a clock.** There is no fixed
 * grid of teaching slots, so an idle hour is defined as an hour some other room teaches in. A room
 * empty every Tuesday at 16:00 while the other address holds a class then is a dead slot; a Sunday
 * morning nobody teaches on is not — see `deadSlotsOf`.
 *
 * Inactive groups and rooms are left out: they cannot take a new child, so they are not an answer
 * to "where do we put one".
 */
@Injectable()
export class OccupancyReportService {
    constructor(
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
        private readonly enrollments: EnrollmentService,
    ) {}

    async build(today: Date = new Date()): Promise<OccupancyReport> {
        const [groups, rooms] = await Promise.all([
            // `location` loaded explicitly: without it every group reads as having no address, and
            // the roll-up by location would be a single anonymous row. CLAUDE.md names the trap.
            this.groupRepository.find({ where: { isActive: true }, relations: { room: { location: true } } }),
            this.roomRepository.find({ where: { isActive: true }, relations: { location: true } }),
        ]);

        const groupRows: OccupancyGroup[] = [];
        for (const group of groups) {
            const occupancy = await this.enrollments.occupancyOf(group.id);
            const rate = fillRate(occupancy.taken, occupancy.capacity);
            groupRows.push({
                groupId: group.id,
                name: group.name,
                weekday: group.weekday,
                startTime: group.startTime,
                endTime: group.endTime,
                roomId: group.room.id,
                roomName: group.room.name,
                locationId: group.room.location.id,
                locationName: group.room.location.name,
                capacity: occupancy.capacity,
                taken: occupancy.taken,
                free: occupancy.free,
                waiting: occupancy.waiting,
                fillRate: rate,
                underThreshold: rate < OCCUPANCY_THRESHOLD,
                lostRevenueMonthly: lostRevenueMonthly(occupancy.free),
            });
        }
        groupRows.sort((a, b) => a.fillRate - b.fillRate || b.free - a.free || a.name.localeCompare(b.name));

        const schoolSlots = distinctSlots(groupRows);

        const roomRows: OccupancyRoom[] = rooms
            .map((room) => {
                const own = groupRows.filter((row) => row.roomId === room.id);
                const capacity = own.reduce((sum, row) => sum + row.capacity, 0);
                const taken = own.reduce((sum, row) => sum + row.taken, 0);
                return {
                    roomId: room.id,
                    roomName: room.name,
                    locationId: room.location.id,
                    locationName: room.location.name,
                    roomCapacity: room.capacity,
                    groups: own.length,
                    capacity,
                    taken,
                    free: own.reduce((sum, row) => sum + row.free, 0),
                    fillRate: fillRate(taken, capacity),
                    deadSlots: deadSlotsOf(own, schoolSlots),
                };
            })
            .sort((a, b) => a.locationName.localeCompare(b.locationName) || a.roomName.localeCompare(b.roomName));

        // An address is any address that has an active room *or* an active group: CLAUDE.md lets a
        // group keep running in a room that was deactivated, and its seats must still roll up
        // somewhere, or the per-address rows would stop adding up to the totals.
        const locationNames = new Map<number, string>([
            ...roomRows.map((room): [number, string] => [room.locationId, room.locationName]),
            ...groupRows.map((row): [number, string] => [row.locationId, row.locationName]),
        ]);
        const locationRows = [...locationNames.entries()]
            .map(([locationId, name]) => {
                const own = groupRows.filter((row) => row.locationId === locationId);
                const capacity = own.reduce((sum, row) => sum + row.capacity, 0);
                const taken = own.reduce((sum, row) => sum + row.taken, 0);
                return {
                    locationId,
                    name,
                    rooms: roomRows.filter((room) => room.locationId === locationId).length,
                    groups: own.length,
                    capacity,
                    taken,
                    free: own.reduce((sum, row) => sum + row.free, 0),
                    waiting: own.reduce((sum, row) => sum + row.waiting, 0),
                    fillRate: fillRate(taken, capacity),
                    lostRevenueMonthly: roundToBani(own.reduce((sum, row) => sum + row.lostRevenueMonthly, 0)),
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        const capacity = groupRows.reduce((sum, row) => sum + row.capacity, 0);
        const taken = groupRows.reduce((sum, row) => sum + row.taken, 0);

        return {
            generatedOn: toIsoDate(today),
            threshold: OCCUPANCY_THRESHOLD,
            ratePerSeat: LOST_REVENUE_PER_SEAT_MONTHLY,
            groups: groupRows,
            rooms: roomRows,
            locations: locationRows,
            totals: {
                groups: groupRows.length,
                capacity,
                taken,
                free: groupRows.reduce((sum, row) => sum + row.free, 0),
                waiting: groupRows.reduce((sum, row) => sum + row.waiting, 0),
                fillRate: fillRate(taken, capacity),
                underThreshold: groupRows.filter((row) => row.underThreshold).length,
                lostRevenueMonthly: roundToBani(groupRows.reduce((sum, row) => sum + row.lostRevenueMonthly, 0)),
                slotsInUse: schoolSlots,
            },
        };
    }
}
