import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Lead } from 'src/entities/lead.entity';
import { LeadStatus } from 'src/enum/lead-status.enum';
import { ageOf, bandFor } from 'src/modules/enrollment/enrollment.service';

/**
 * The funnel, counted — E20/S4.
 *
 * It lives in the lead module rather than in `dashboard/`, and that is E21's rule rather than a
 * preference: a report asks the service that owns the question. Leads are owned here, so the
 * counting is here, and `ReportsController` calls it. A second `SELECT ... FROM leads` in the
 * dashboard would be a second definition of every number on this screen.
 *
 * **The cohort is by arrival, not by event.** A family who asked in August and enrolled in
 * September is counted in August, on both lines. Counting the enrolment in September instead would
 * produce a rate above 100% in any month the school did well, and it would answer a different
 * question — "how busy was the office" rather than "what happened to the people who came to us".
 */
@Injectable()
export class LeadFunnelService {
    constructor(@InjectRepository(Lead) private readonly leadRepository: Repository<Lead>) {}

    async funnel(range: { from: string; to: string }): Promise<LeadFunnel> {
        const leads = await this.leadRepository.find({
            where: { createdAt: Between(new Date(`${range.from}T00:00:00Z`), new Date(`${range.to}T23:59:59.999Z`)) },
            // `trialSession` and `enrollment` are loaded because `hasReached` reads them, and an
            // unloaded relation comes back as `undefined` rather than `null` — which would have made
            // every lead in the range look as though it had had a trial booked.
            relations: { location: true, trialSession: true, enrollment: true },
        });

        const reached = (status: LeadStatus) => leads.filter((lead) => hasReached(lead, status)).length;

        const requests = leads.length;
        const trialsScheduled = reached(LeadStatus.TRIAL_SCHEDULED);
        const trialsHeld = reached(LeadStatus.TRIAL_HELD);
        const enrolled = reached(LeadStatus.ENROLLED);

        const decisionDays = leads
            .filter((lead) => lead.trialHeldAt !== null && lead.decidedAt !== null)
            .map((lead) => Math.max(0, Math.round((new Date(lead.decidedAt as Date).getTime() - new Date(lead.trialHeldAt as Date).getTime()) / 86_400_000)));

        return {
            range,
            stages: {
                requests,
                trialsScheduled,
                trialsHeld,
                enrolled,
                lost: leads.filter((lead) => lead.status === LeadStatus.LOST).length,
                noSeats: leads.filter((lead) => lead.noSeats).length,
            },
            rates: {
                requestToTrial: rate(trialsScheduled, requests),
                trialToAttendance: rate(trialsHeld, trialsScheduled),
                // The number the epic calls the most important one — and the one that measures two
                // things at once, which is why the median below travels with it: a family may have
                // loved the class and simply never been rung back.
                attendanceToEnrolment: rate(enrolled, trialsHeld),
            },
            medianDaysToDecision: median(decisionDays),
            bySource: group(leads, (lead) => lead.source),
            byChannel: group(leads, (lead) => lead.channel ?? 'unspecified'),
            byLocation: groupLocations(leads),
            /**
             * Demand nobody could serve, by address and age band. Invisible in every conversion rate
             * — a parent who finds no free hour never enters the funnel — and the figure that says
             * when a new group is worth opening.
             */
            unmetByBand: unmetByBand(leads),
        };
    }
}

export interface LeadFunnel {
    range: { from: string; to: string };
    stages: { requests: number; trialsScheduled: number; trialsHeld: number; enrolled: number; lost: number; noSeats: number };
    rates: { requestToTrial: number; trialToAttendance: number; attendanceToEnrolment: number };
    /** Days between the trial and somebody deciding. `null` when nothing has been decided yet. */
    medianDaysToDecision: number | null;
    bySource: { key: string; requests: number; enrolled: number }[];
    byChannel: { key: string; requests: number; enrolled: number }[];
    byLocation: { locationId: number | null; locationName: string; requests: number; enrolled: number; noSeats: number }[];
    unmetByBand: { locationId: number | null; locationName: string; ageBand: string; count: number }[];
}

/**
 * Whether a lead ever got as far as a stage, rather than whether it is sitting in it now.
 *
 * A funnel counts passage, not occupancy: a family who came to a trial and then enrolled has passed
 * through `TRIAL_HELD`, and a "trials held" line that dropped them the moment they enrolled would
 * fall as the school did better. The order of the enum is the order of the funnel, which is why the
 * comparison can be an index — and `LOST` is deliberately outside it: leaving says nothing about how
 * far you got, so a lost lead is judged on the marks it left behind.
 */
const ORDER = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.TRIAL_SCHEDULED, LeadStatus.TRIAL_HELD, LeadStatus.ENROLLED];

export function hasReached(lead: Lead, stage: LeadStatus): boolean {
    if (stage === LeadStatus.TRIAL_SCHEDULED) return lead.trialSession !== null || lead.enrollment !== null || reachedByStatus(lead, stage);
    if (stage === LeadStatus.TRIAL_HELD) return lead.trialHeldAt !== null || reachedByStatus(lead, stage);
    if (stage === LeadStatus.ENROLLED) return lead.status === LeadStatus.ENROLLED;
    return reachedByStatus(lead, stage);
}

const reachedByStatus = (lead: Lead, stage: LeadStatus): boolean => {
    const at = ORDER.indexOf(lead.status);
    const target = ORDER.indexOf(stage);
    return at >= 0 && target >= 0 && at >= target;
};

const rate = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10 : sorted[middle];
}

function group(leads: Lead[], keyOf: (lead: Lead) => string): { key: string; requests: number; enrolled: number }[] {
    const buckets = new Map<string, { key: string; requests: number; enrolled: number }>();
    for (const lead of leads) {
        const key = keyOf(lead);
        const bucket = buckets.get(key) ?? { key, requests: 0, enrolled: 0 };
        bucket.requests += 1;
        if (lead.status === LeadStatus.ENROLLED) bucket.enrolled += 1;
        buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => b.requests - a.requests);
}

function groupLocations(leads: Lead[]) {
    const buckets = new Map<string, { locationId: number | null; locationName: string; requests: number; enrolled: number; noSeats: number }>();
    for (const lead of leads) {
        const id = lead.location?.id ?? null;
        const key = String(id ?? 'any');
        const bucket = buckets.get(key) ?? { locationId: id, locationName: lead.location?.name ?? 'Fără locație', requests: 0, enrolled: 0, noSeats: 0 };
        bucket.requests += 1;
        if (lead.status === LeadStatus.ENROLLED) bucket.enrolled += 1;
        if (lead.noSeats) bucket.noSeats += 1;
        buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => b.requests - a.requests);
}

function unmetByBand(leads: Lead[]) {
    const buckets = new Map<string, { locationId: number | null; locationName: string; ageBand: string; count: number }>();
    for (const lead of leads.filter((candidate) => candidate.noSeats)) {
        const id = lead.location?.id ?? null;
        // The band the child would have joined, from the same function E11/S7 buckets unmet demand
        // with — so "we turned away four eight-year-olds at Titan" reads against the same rows an
        // admin already looks at before opening a group.
        const ageBand = bandFor(ageOf(lead.childBirthDate));
        const key = `${id ?? 'any'}|${ageBand}`;
        const bucket = buckets.get(key) ?? { locationId: id, locationName: lead.location?.name ?? 'Fără locație', ageBand, count: 0 };
        bucket.count += 1;
        buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => b.count - a.count);
}
