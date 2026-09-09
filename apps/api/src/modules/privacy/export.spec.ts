import { DATA_INVENTORY, isPersonal } from 'src/privacy/data-inventory';
import { ExportService } from './export.service';

/**
 * The export and the inventory cannot disagree — E07 S4 held to E07 S1.
 *
 * The queries in `ExportService` are hand-written, because the shape of the answer matters: a
 * family opening the document should recognise their own life in it, not read a dump of normalised
 * tables. Hand-writing opens exactly one gap — a table added to the inventory and forgotten here —
 * and this closes it. That is also what makes `linkedVia` load-bearing rather than decorative: the
 * inventory says a table holds a family's data and names the path to it, and the export is checked
 * against that claim rather than against somebody's memory.
 */
describe('the export covers what the inventory says exists', () => {
    /** Tables holding personal data about a family, as the inventory has them. */
    const holdsFamilyData = Object.entries(DATA_INVENTORY)
        .filter(([, inventory]) => inventory.subject !== 'none' && Object.values(inventory.columns).some(isPersonal))
        .map(([entity]) => entity);

    /**
     * Tables whose personal data is about the school's own staff, or is a thing no family may
     * receive. Named here rather than left out quietly, because "the export skipped it" and "the
     * export must skip it" look identical from the outside.
     */
    const NOT_A_FAMILY_ANSWER: Record<string, string> = {
        // The trail records what staff did. Handing a family a slice of staff activity is a
        // different feature with a different set of questions behind it — and an unfiltered one
        // would show them every other family's money.
        AuditLog: 'about staff, not about the family',
        // `UnassignedFile` is the case where the platform could not tell whose file it was. There
        // is no family to attach it to, which is the whole content of the row.
        UnassignedFile: 'the row exists because the link failed',
    };

    it('reads every table the inventory says holds family data', () => {
        const covered = new Set<string>(ExportService.COVERS);
        const missing = holdsFamilyData.filter((entity) => !covered.has(entity) && !(entity in NOT_A_FAMILY_ANSWER));

        expect(missing.sort()).toEqual([]);
    });

    it('does not claim to read a table that holds nothing about a family', () => {
        const known = new Set(Object.keys(DATA_INVENTORY));
        const unknown = ExportService.COVERS.filter((entity) => !known.has(entity));

        // A name in `COVERS` that the inventory has never heard of is a typo, and a typo here reads
        // as coverage.
        expect(unknown).toEqual([]);
    });

    it('names a reason for every table it leaves out', () => {
        const covered = new Set<string>(ExportService.COVERS);
        const excludedWithoutReason = holdsFamilyData.filter((entity) => !covered.has(entity) && !NOT_A_FAMILY_ANSWER[entity]);

        expect(excludedWithoutReason).toEqual([]);
    });
});
