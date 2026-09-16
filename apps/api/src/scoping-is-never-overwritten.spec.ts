import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * Once a query has started composing, every further condition is an `andWhere`.
 *
 * `qb.where()` does not add a condition, it *replaces* the whole clause. So a `where` written after
 * the restriction that scopes a query to its owner deletes that restriction, and deletes it
 * silently: the query is still valid, still returns rows, and returns somebody else's.
 *
 * That is not hypothetical. `PaymentService.findOne` did exactly this — the scoping `andWhere` went
 * on first, a `.where('payment.id = :id')` went on after it, and for as long as it stood any parent
 * could read any other family's payment with the full profile attached. The rule has been in
 * `CLAUDE.md` since ("Numai `andWhere`, niciodată `where`, după ce ai început să compui"), where it
 * could be read but not enforced, and the thing it guards is the one mistake in this repository
 * that hands one family another family's data.
 *
 * It is also invisible to everything else we run. It is not a type error — both methods exist and
 * both return the builder. It is not a lint finding. `authorization.spec.ts` checks that a handler
 * has its guards, and the unit tests check that the scoping `andWhere` was *added*; neither can see
 * that a later line threw it away. Only reading the two calls in order tells you, and they are
 * often twenty lines apart.
 *
 * Two shapes, because the bug has appeared as both:
 *
 * - **Chained** — `.andWhere(…).where(…)` in one expression.
 * - **Through a variable** — `qb.andWhere(…)` under an `if`, then `qb.where(…)` further down. This
 *   is the shape that shipped, and it is the one a reader's eye slides over.
 *
 * A sub-query is not either of them and is deliberately not flagged: `qb.subQuery()` starts a
 * *fresh* builder, so the `where` that follows it is that builder's first condition and belongs
 * there. `ProjectService.childrenWithoutProjects` and `EnrollmentService` both read this way and
 * both are correct.
 */

const SOURCE_ROOT = __dirname;

/** Query-builder methods that mean composition has begun, so the clause must not be replaced. */
const COMPOSING = new Set(['andWhere', 'orWhere']);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [path] : [];
    });

/** The nearest function, method or arrow around a node — the scope a builder variable lives in. */
const enclosingScope = (node: ts.Node): ts.Node => {
    let current: ts.Node | undefined = node.parent;
    while (current && !ts.isFunctionLike(current)) current = current.parent;
    return current ?? node.getSourceFile();
};

interface Offence {
    file: string;
    line: number;
    shape: 'chained' | 'variable';
}

/**
 * Every place a `where` replaces a clause something else had already started composing.
 *
 * It reads the two shapes above and nothing cleverer: a builder handed to a function and composed
 * there is past what this can follow. That is the honest bound of it, and it is written down rather
 * than left to be discovered — a guard whose reach is unknown gets read as a proof.
 *
 * The cases below feed it the bug on purpose. A sweep that comes back clean because it cannot
 * recognise its own subject is worse than no sweep: it answers the question for everyone after,
 * and answers it wrongly.
 */
const clauseOverwrites = (source: string, fileName = 'sample.ts'): Offence[] => {
    const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const offences: Offence[] = [];
    const lineOf = (node: ts.Node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

    /** Identifiers this file assigns from a `createQueryBuilder(…)`, so `.where` on them is a clause. */
    const builderNames = new Set<string>();
    const collectBuilders = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            if (/\bcreateQueryBuilder\s*\(/.test(node.initializer.getText(tree))) builderNames.add(node.name.text);
        }
        ts.forEachChild(node, collectBuilders);
    };
    collectBuilders(tree);

    /** `where` and `andWhere` calls made on a builder variable, by scope and name. */
    const byVariable = new Map<string, { composedAt: number[]; replacedAt: ts.Node[] }>();
    const scopeIds = new Map<ts.Node, number>();
    const keyFor = (node: ts.Node, name: string) => {
        const scope = enclosingScope(node);
        if (!scopeIds.has(scope)) scopeIds.set(scope, scopeIds.size);
        return `${scopeIds.get(scope)}:${name}`;
    };

    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            const receiver = node.expression.expression;

            if (method === 'where' || COMPOSING.has(method)) {
                // Walk down the chain this call sits on, to whatever started it.
                let link: ts.Node = receiver;
                let composedEarlier = false;
                let ownBuilder = false;
                while (ts.isCallExpression(link) && ts.isPropertyAccessExpression(link.expression)) {
                    const name = link.expression.name.text;
                    // A sub-query is a builder of its own; nothing before it is this clause's.
                    if (name === 'subQuery' || name === 'createQueryBuilder') {
                        ownBuilder = true;
                        break;
                    }
                    if (COMPOSING.has(name)) composedEarlier = true;
                    link = link.expression.expression;
                }

                if (method === 'where' && composedEarlier) {
                    offences.push({ file: fileName, line: lineOf(node), shape: 'chained' });
                } else if (!ownBuilder && ts.isIdentifier(link) && builderNames.has(link.text)) {
                    // `qb.where(…)` / `qb.andWhere(…)` — order decides, and it is decided per scope.
                    const key = keyFor(node, link.text);
                    const seen = byVariable.get(key) ?? { composedAt: [], replacedAt: [] };
                    if (method === 'where') seen.replacedAt.push(node);
                    else seen.composedAt.push(node.getStart(tree));
                    byVariable.set(key, seen);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(tree);

    for (const { composedAt, replacedAt } of byVariable.values()) {
        if (composedAt.length === 0) continue;
        const first = Math.min(...composedAt);
        for (const call of replacedAt) {
            if (call.getStart(tree) > first) offences.push({ file: fileName, line: lineOf(call), shape: 'variable' });
        }
    }

    return offences.sort((a, b) => a.line - b.line);
};

describe('a scoped query is never overwritten by a later where', () => {
    it('finds none in src/', () => {
        const offences = sourceFiles(SOURCE_ROOT).flatMap((path) => clauseOverwrites(readFileSync(path, 'utf8'), relative(SOURCE_ROOT, path)));

        expect(offences.map((o) => `${o.file}:${o.line} — a .where() (${o.shape}) replaces a clause that was already being composed`)).toEqual([]);
    });

    it('sees the shape that shipped: scoped under an if, replaced further down', () => {
        const source = `
            const qb = this.paymentRepository.createQueryBuilder('payment');
            if (role !== Role.ADMIN) qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
            qb.where('payment.id = :id', { id });
        `;
        expect(clauseOverwrites(source)).toEqual([{ file: 'sample.ts', line: 4, shape: 'variable' }]);
    });

    it('sees it chained in one expression', () => {
        const source = `
            const rows = repo.createQueryBuilder('invoice').andWhere('user.id = :userId', { userId }).where('invoice.id = :id', { id }).getMany();
        `;
        expect(clauseOverwrites(source)).toEqual([{ file: 'sample.ts', line: 2, shape: 'chained' }]);
    });

    it('leaves a sub-query alone, because that where is its own builder first condition', () => {
        const source = `
            const rows = repo
                .createQueryBuilder('child')
                .andWhere('group.id = :groupId', { groupId })
                .andWhere((qb) => {
                    const sub = qb.subQuery().select('1').from(Project, 'project').where('project.child_id = child.id').getQuery();
                    return \`NOT EXISTS \${sub}\`;
                })
                .getMany();
        `;
        expect(clauseOverwrites(source)).toEqual([]);
    });

    it('leaves a where that is genuinely first alone, chained or through a variable', () => {
        const chained = `const rows = repo.createQueryBuilder('payment').where('payment.id = :id', { id }).andWhere('user.id = :userId', { userId }).getMany();`;
        const variable = `
            const qb = repo.createQueryBuilder('payment');
            qb.where('payment.id = :id', { id });
            if (role !== Role.ADMIN) qb.andWhere('user.id = :userId', { userId });
        `;
        expect(clauseOverwrites(chained)).toEqual([]);
        expect(clauseOverwrites(variable)).toEqual([]);
    });

    it('does not carry one method scoping into another method replacing', () => {
        const source = `
            class S {
                scoped(userId: number) {
                    const qb = repo.createQueryBuilder('payment');
                    qb.andWhere('user.id = :userId', { userId });
                    return qb.getMany();
                }
                byId(id: number) {
                    const qb = repo.createQueryBuilder('payment');
                    qb.where('payment.id = :id', { id });
                    return qb.getOne();
                }
            }
        `;
        expect(clauseOverwrites(source)).toEqual([]);
    });
});
