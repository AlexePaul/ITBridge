import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { getMetadataArgsStorage } from 'typeorm';
import { DATA_INVENTORY, isPersonal } from './data-inventory';
import { inventoryDocPath } from './inventory-doc-path';
import { renderInventory } from './render-inventory';
import 'src/entities/entities.module';

/**
 * The half of E07 S1 that is code — the story's own acceptance, enforced.
 *
 * "A new column holding personal data cannot reach production without appearing in the inventory"
 * is not something prose can promise. So this reads TypeORM's **own** metadata rather than a list
 * anybody maintains: `getMetadataArgsStorage()` is filled by the decorators the moment the entity
 * classes are imported, so a column added tomorrow is here tomorrow, without a database and without
 * anybody remembering to add it twice.
 *
 * The same argument as `authorization.spec.ts`, which enumerates handlers rather than trusting a
 * list, and as `check:schema`, which builds the schema from migrations rather than believing a
 * comment.
 */
/** TypeORM records a decorator's target as the class itself; all we ever want from it is its name. */
type EntityClass = { name: string };

/**
 * The class name a relation points at.
 *
 * `@ManyToOne(() => Profile)` stores the thunk, which is the only form this codebase uses. TypeORM
 * also accepts a bare string and an `EntitySchema`; both are handled rather than cast away, because
 * a cast here would turn "somebody declared a relation the other way" into a crash inside a guard
 * whose whole job is to report clearly.
 */
function relationTargetName(declared: unknown): string {
    const resolved = typeof declared === 'function' ? (declared as () => unknown)() : declared;
    if (typeof resolved === 'string') return resolved;
    const named = resolved as { name?: string; options?: { name?: string } };
    return named.name ?? named.options?.name ?? '(unrecognised relation target)';
}

describe('data inventory (E07 S1)', () => {
    const storage = getMetadataArgsStorage();

    /** Entity class name → its columns, as the decorators recorded them. */
    const entityColumns = new Map<string, string[]>();
    for (const table of storage.tables) {
        entityColumns.set((table.target as EntityClass).name, []);
    }
    for (const column of storage.columns) {
        const entity = (column.target as EntityClass).name;
        entityColumns.get(entity)?.push(column.propertyName);
    }

    it('sees every entity, so the sweep below is not sweeping an empty room', () => {
        expect(entityColumns.size).toBeGreaterThan(25);
        for (const [entity, columns] of entityColumns) {
            expect(columns.length).toBeGreaterThan(0);
            expect(entity).not.toBe('');
        }
    });

    it('classifies every entity', () => {
        const missing = [...entityColumns.keys()].filter((entity) => !DATA_INVENTORY[entity]).sort();

        expect(missing).toEqual([]);
    });

    /** The acceptance criterion itself. */
    it('classifies every column of every entity', () => {
        const missing: string[] = [];
        for (const [entity, columns] of entityColumns) {
            const inventory = DATA_INVENTORY[entity];
            if (!inventory) continue;
            for (const column of columns) {
                if (!(column in inventory.columns)) missing.push(`${entity}.${column}`);
            }
        }

        // A column with no entry is the failure this story exists to prevent: it is how a phone
        // number ends up in a table nobody wrote down. Add it to `data-inventory.ts` — either as
        // personal data with the five answers, or as not personal with a named reason.
        expect(missing.sort()).toEqual([]);
    });

    it('has no entry for a column that no longer exists', () => {
        const stale: string[] = [];
        for (const [entity, inventory] of Object.entries(DATA_INVENTORY)) {
            const columns = entityColumns.get(entity);
            if (!columns) {
                stale.push(`${entity} (entity is gone)`);
                continue;
            }
            for (const column of Object.keys(inventory.columns)) {
                if (!columns.includes(column)) stale.push(`${entity}.${column}`);
            }
        }

        // A stale row is worse than a missing one: it reads as an answer.
        expect(stale.sort()).toEqual([]);
    });

    it('names the table each entity actually writes to', () => {
        const wrong: string[] = [];
        for (const table of storage.tables) {
            const entity = (table.target as EntityClass).name;
            const inventory = DATA_INVENTORY[entity];
            if (inventory && inventory.table !== table.name) {
                wrong.push(`${entity}: inventory says "${inventory.table}", the entity says "${String(table.name)}"`);
            }
        }

        expect(wrong).toEqual([]);
    });

    describe('every personal-data field answers the five questions', () => {
        const fields = Object.entries(DATA_INVENTORY).flatMap(([entity, inventory]) =>
            Object.entries(inventory.columns).map(([column, classification]) => ({ entity, column, classification })),
        );

        it('with a purpose written in words, not a placeholder', () => {
            const empty = fields
                .filter(({ classification }) => isPersonal(classification) && classification.purpose.trim().length < 10)
                .map(({ entity, column }) => `${entity}.${column}`);

            expect(empty).toEqual([]);
        });

        it('with somebody who can read it', () => {
            const unreadable = fields
                .filter(({ classification }) => isPersonal(classification) && classification.readableBy.length === 0)
                .map(({ entity, column }) => `${entity}.${column}`);

            // `nobody` is an answer — `passwordHash` is written and compared, never returned. An
            // empty list is not: it means the question was skipped.
            expect(unreadable).toEqual([]);
        });

        it('and belongs to a subject the entity says it holds', () => {
            const mismatched: string[] = [];
            for (const { entity, column, classification } of fields) {
                if (!isPersonal(classification)) continue;
                const subject = DATA_INVENTORY[entity].subject;
                if (subject === 'none') mismatched.push(`${entity}.${column} is personal, but the entity is about nobody`);
            }

            expect(mismatched).toEqual([]);
        });
    });

    /**
     * E07 S4 has to find every row about one family, twice: once to export it, once to delete it.
     * `linkedVia` is the path it walks, so a table holding personal data with no path is a row that
     * an export would silently miss — which is why the two exceptions below are named rather than
     * left to be discovered.
     */
    it('says how to walk from a personal row back to the family, or names why it cannot', () => {
        const UNREACHABLE_BY_DESIGN = new Set([
            // The path failed: that is what the row records. There is no `Child` to walk to.
            'UnassignedFile',
            // The queue is shared and also writes to the office, so there is no relation to a
            // profile. E07 S4 has to search by address here, not by join.
            'OutboxMessage',
            // The trail points at the row that changed, by type and id, on purpose: a relation to a
            // deletable row is how an audit log loses the entries that matter.
            'AuditLog',
        ]);

        const unreachable = Object.entries(DATA_INVENTORY)
            .filter(([entity, inventory]) => {
                const holdsPersonal = Object.values(inventory.columns).some(isPersonal);
                return holdsPersonal && inventory.linkedVia === null && !UNREACHABLE_BY_DESIGN.has(entity);
            })
            .map(([entity]) => entity);

        expect(unreachable).toEqual([]);
    });

    /**
     * A path that does not exist is worse than no path: E07 S4 would be written against it, and the
     * export would come back short with nothing to say why. So the paths are walked, relation by
     * relation, through the same metadata the entities declare.
     */
    it('walks every declared path to a real relation, ending at Profile', () => {
        /** Entity class name → its relations, as property name to target class name. */
        const relations = new Map<string, Map<string, string>>();
        for (const relation of storage.relations) {
            const owner = (relation.target as EntityClass).name;
            const targetName = relationTargetName(relation.type);
            if (!relations.has(owner)) relations.set(owner, new Map());
            relations.get(owner)!.set(relation.propertyName, targetName);
        }

        const broken: string[] = [];
        for (const [entity, inventory] of Object.entries(DATA_INVENTORY)) {
            const path = inventory.linkedVia;
            if (path === null) continue;
            // `self` is the one path with no hop to make: `profiles` *is* the family.
            if (path === 'self') {
                if (entity !== 'Profile') broken.push(`${entity}: only Profile may say "self"`);
                continue;
            }

            let current = entity;
            for (const step of path.split('.')) {
                const target = relations.get(current)?.get(step);
                if (!target) {
                    broken.push(`${entity}.${path}: "${current}" has no relation called "${step}"`);
                    current = '';
                    break;
                }
                current = target;
            }

            // The point of the walk is where it ends: a path that stops anywhere but the family is
            // a path an export cannot use.
            if (current && current !== 'Profile') broken.push(`${entity}.${path}: ends at ${current}, not Profile`);
        }

        expect(broken).toEqual([]);
    });

    it('does not claim a path on a table about nobody', () => {
        const overreaching = Object.entries(DATA_INVENTORY)
            .filter(([, inventory]) => inventory.subject === 'none' && inventory.linkedVia !== null)
            .map(([entity]) => entity);

        expect(overreaching).toEqual([]);
    });
});

/**
 * The document and the code cannot say different things — E07 S1's other half.
 *
 * `docs/inventar-date.md` is what E22 S2 reads to write the privacy note. The epic's whole reason
 * for putting the inventory in one place is that two tables kept by hand diverge, and the one under
 * a family's eyes is always the stale one. So the rendered file is compared here rather than
 * trusted: a change to the classification that nobody re-rendered fails the suite.
 */
describe('the rendered document (docs/inventar-date.md)', () => {
    it('is what the inventory renders to right now', () => {
        const expected = renderInventory();
        const actual = readFileSync(inventoryDocPath(), 'utf8');

        // Regenerate with `pnpm --filter api inventory:render`.
        expect(actual).toBe(expected);
    });
});
