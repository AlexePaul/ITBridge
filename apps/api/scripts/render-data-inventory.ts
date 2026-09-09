import { writeFileSync } from 'node:fs';
import { renderInventory } from '../src/privacy/render-inventory';
import { inventoryDocPath } from '../src/privacy/inventory-doc-path';

/**
 * Writes `docs/inventar-date.md` from the inventory — E07 S1.
 *
 * The output is **not** run through prettier, and the file is in `.prettierignore` to keep the
 * pre-commit hook off it. Prettier v3 loads its markdown parser by dynamic import, which ts-jest
 * cannot do, so the freshness check in `data-inventory.spec.ts` compares the raw render; with the
 * hook reformatting the committed file, that check would fail on pipe alignment and nothing else.
 * A generated file has no reader who cares whether its table pipes line up, and unaligned rows make
 * for smaller diffs when one purpose string changes.
 */
const path = inventoryDocPath();
writeFileSync(path, renderInventory());
console.log(`Wrote ${path}`);
