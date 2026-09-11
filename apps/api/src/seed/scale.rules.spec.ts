import { CHILDREN_PER_GROUP, describeShape, scaleShape, TEACHING_WEEKS_PER_YEAR, UNPAID_IN_EVERY } from './scale.rules';

/**
 * The arithmetic behind `pnpm seed:scale`.
 *
 * Worth a spec of its own because nothing downstream can catch it being wrong: a dataset with the
 * wrong shape loads without complaint, and every measurement taken against it is confidently about
 * the wrong school.
 */
describe('scaleShape', () => {
    const school = scaleShape({ years: 3, families: 250 });

    it('marks a child once per class of its own group, not once per class in the school', () => {
        // The mistake this exists to stop. With 20 groups the two differ by a factor of twenty:
        // 47 thousand register marks against 936 thousand, and the second is a school where every
        // child attends every group.
        expect(school.attendances).toBe(school.children * school.weeks);
        expect(school.attendances).toBeLessThan(school.children * school.classes);
    });

    it('opens enough groups for the children it invents', () => {
        expect(school.groups * CHILDREN_PER_GROUP).toBeGreaterThanOrEqual(school.children);
    });

    it('gives every group its own room, because a room holds one group at a time', () => {
        expect(school.rooms).toBe(school.groups);
    });

    it('counts teaching weeks rather than calendar weeks', () => {
        expect(school.weeks).toBe(3 * TEACHING_WEEKS_PER_YEAR);
        expect(school.weeks).toBeLessThan(3 * 52);
    });

    it('bills every family every month of the history', () => {
        expect(school.months).toBe(36);
        expect(school.invoices).toBe(250 * 36);
    });

    it('does not forecast the payments, because SQL decides which invoices are paid', () => {
        // The first version predicted them from a ratio and printed a number thirty rows off what
        // the table held. A shape that claims something the database will contradict is worse than
        // one that stays quiet, so `payments` is simply not in it.
        expect(school).not.toHaveProperty('payments');
        expect(UNPAID_IN_EVERY).toBeGreaterThan(1);
    });

    it('makes the outbox the widest table, because nothing ever deletes from it', () => {
        // Not incidental: the outbox is where an unrestricted query hurts first, precisely because
        // `sent` rows accumulate forever. A dataset where it is small would hide that.
        expect(school.outbox).toBeGreaterThan(school.attendances);
    });

    it('scales with both dials rather than one', () => {
        const longer = scaleShape({ years: 6, families: 250 });
        const bigger = scaleShape({ years: 3, families: 500 });

        expect(longer.classes).toBe(school.classes * 2);
        expect(bigger.children).toBe(school.children * 2);
        // Twice the families is twice the groups, so twice the classes as well.
        expect(bigger.classes).toBe(school.classes * 2);
    });

    it('refuses to produce an empty school from a nonsense request', () => {
        const tiny = scaleShape({ years: 0, families: 0 });

        expect(tiny.families).toBeGreaterThan(0);
        expect(tiny.groups).toBeGreaterThan(0);
        expect(tiny.weeks).toBeGreaterThan(0);
    });

    it('pins the default school, so a measurement can name the dataset it was taken on', () => {
        // Not the same rows as the first September 2026 measurements: those were taken on a
        // hand-built set with 20 groups and 46.8k register marks, before this command existed. The
        // point of pinning it here is that from now on there *is* a default to name — quote
        // `seed:scale` with no arguments and anybody can reproduce the numbers.
        expect(school).toMatchObject({ families: 250, children: 300, groups: 30, months: 36, invoices: 9000 });
        expect(school.attendances).toBe(35_100);
    });
});

describe('describeShape', () => {
    it('puts the widest table first, so the size of the thing is the first line read', () => {
        const lines = describeShape({ profiles: 250, outbox: 54000, children: 300, attendances: 35100 });

        expect(lines[0]).toContain('outbox');
        expect(lines[0]).toContain('54,000');
    });

    it('reports what it was handed, not what anything predicted', () => {
        // It takes counts read back from the database, so a table that came out at an unexpected
        // size says so instead of being rounded into the story.
        expect(describeShape({ payments: 8310 })[0]).toContain('8,310');
    });

    it('leaves out the tables a load did not touch', () => {
        expect(describeShape({ profiles: 250, leads: 0 })).toHaveLength(1);
    });
});
