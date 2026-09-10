import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tests run on the school's clock, and that is load-bearing — not a preference.
 *
 * This codebase is full of one-day bugs waiting to happen: a `date` column read back as a `Date`
 * sits at local midnight, and `toISOString()` on it is the day before anywhere east of Greenwich.
 * CI runs in UTC, which is the one zone where none of them appear. So the suite would go green on
 * a machine that is not the school's, for a school whose every date is read in Bucharest.
 *
 * That is not hypothetical. `changedFieldNames` compared a birth date through `toISOString()` and
 * reported an unchanged one as changed — writing an audit entry that said somebody edited a child's
 * date of birth when nobody had. In UTC the test for it passes against the bug; in Europe/Bucharest
 * it fails. The pin is what makes the difference.
 *
 * `TZ` has to be set before Node starts — assigning `process.env.TZ` inside a spec is too late,
 * because the zone is already cached — so it lives on the scripts, and this asserts it stayed.
 */
const PACKAGE_JSON = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
};

/** Every script that starts jest. A new one belongs here the moment it exists. */
const TEST_SCRIPTS = ['test', 'test:watch', 'test:cov', 'test:debug', 'test:e2e'];

describe('the api test scripts', () => {
    it.each(TEST_SCRIPTS)('runs `%s` on Europe/Bucharest', (script) => {
        expect(PACKAGE_JSON.scripts[script]).toContain('TZ=Europe/Bucharest');
    });

    it('is actually running in that zone right now', () => {
        // The assertions above check what is declared; this checks what happened. Running jest
        // directly rather than through the script gets the machine's zone, and the suite then
        // quietly loses its ability to see a whole class of defect — so it says so instead.
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Bucharest');
    });
});
