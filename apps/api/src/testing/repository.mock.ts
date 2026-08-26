import { getRepositoryToken } from '@nestjs/typeorm';
import { Provider } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/**
 * Helpers for service unit tests. Services receive TypeORM repositories through injection, and
 * tests should not need a database to verify business or authorization logic — only repositories
 * that record what was asked of them.
 */

export type MockRepository<T extends ObjectLiteral = ObjectLiteral> = {
    [K in keyof Repository<T>]?: jest.Mock;
};

export function createMockRepository<T extends ObjectLiteral = ObjectLiteral>(): MockRepository<T> {
    return {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        remove: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        createQueryBuilder: jest.fn(),
    };
}

/** Sugar over `{ provide: getRepositoryToken(Entity), useValue: ... }`. */
export function provideMockRepository(entity: Parameters<typeof getRepositoryToken>[0], mock: MockRepository): Provider {
    return { provide: getRepositoryToken(entity), useValue: mock };
}

/**
 * A fake query builder whose chaining methods return themselves while recording every call. The
 * row-level authorization pattern is expressed purely through `andWhere` and `leftJoin`, so a test
 * can assert *which conditions were added* without running any SQL — which is the question that
 * actually matters: "was the query narrowed to the authenticated parent?".
 */
export interface MockQueryBuilder<T extends ObjectLiteral = ObjectLiteral> extends Partial<SelectQueryBuilder<T>> {
    andWhereCalls: [string, Record<string, unknown> | undefined][];
    leftJoinCalls: string[];
}

export function createMockQueryBuilder<T extends ObjectLiteral = ObjectLiteral>(result: { many?: T[]; one?: T | null }): MockQueryBuilder<T> {
    const andWhereCalls: [string, Record<string, unknown> | undefined][] = [];
    const leftJoinCalls: string[] = [];

    const qb: Record<string, unknown> = {
        andWhereCalls,
        leftJoinCalls,
        getMany: jest.fn().mockResolvedValue(result.many ?? []),
        getOne: jest.fn().mockResolvedValue(result.one ?? null),
    };

    for (const method of ['leftJoinAndSelect', 'innerJoin', 'innerJoinAndSelect', 'orderBy', 'skip', 'take', 'select', 'where']) {
        qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.leftJoin = jest.fn((relation: string) => {
        leftJoinCalls.push(relation);
        return qb;
    });
    qb.andWhere = jest.fn((condition: string, params?: Record<string, unknown>) => {
        andWhereCalls.push([condition, params]);
        return qb;
    });

    return qb as unknown as MockQueryBuilder<T>;
}

/** Only the part `isScopedToUser` needs, so the inferred entity type does not matter. */
type RecordedCalls = Pick<MockQueryBuilder, 'andWhereCalls' | 'leftJoinCalls'>;

/** True when the query was narrowed to the given user — the pattern described in CLAUDE.md. */
export function isScopedToUser(qb: RecordedCalls, userId: number): boolean {
    return (
        qb.leftJoinCalls.includes('parent.user') && qb.andWhereCalls.some(([condition, params]) => condition.includes('user.id') && params?.userId === userId)
    );
}
