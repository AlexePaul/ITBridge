import { join } from 'node:path';

/**
 * Where the rendered inventory lives.
 *
 * Resolved from `__dirname` rather than `process.cwd()`, for the same reason `pdf.service.ts` reads
 * its fonts that way: the spec runs with the working directory at `apps/api`, the renderer can be
 * run from the repo root, and a path that depends on which of the two it was would work exactly
 * until somebody ran it the other way.
 *
 * Only ever called from source — by the spec through ts-jest, and by the render script through
 * ts-node. Nothing in `dist/` reads it, which is why four levels up is the whole story.
 */
export function inventoryDocPath(): string {
    return join(__dirname, '..', '..', '..', '..', 'docs', 'inventar-date.md');
}
