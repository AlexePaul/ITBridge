import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Provider } from '@nestjs/common';
import { EntityManager, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

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
        // `findOneOrFail` is what a service reaches for when the row must exist by construction —
        // reading back a row it has just written inside its own transaction, say. Missing from the
        // double, the call returns undefined and the failure reads as a service bug.
        findOneOrFail: jest.fn(),
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

    // `addOrderBy` and `loadRelationCountAndMap` are here because the class-session queries chain
    // them; a chaining method missing from this list returns undefined and the next call in the
    // chain throws, which reads as a service bug rather than a gap in the double.
    for (const method of [
        'leftJoinAndSelect',
        'innerJoin',
        'innerJoinAndSelect',
        'loadRelationCountAndMap',
        'addSelect',
        'orderBy',
        'addOrderBy',
        'skip',
        'take',
        'limit',
        'select',
        'where',
        // The outbox claim's vocabulary. A test asserts the batch was asked for with
        // FOR UPDATE SKIP LOCKED, which is what keeps two schedulers off the same message.
        'setLock',
        'setOnLocked',
    ]) {
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

/**
 * A fake insert builder, for the `.insert().values().orIgnore().returning('*')` chain.
 *
 * `OutboxService.queue` inserts that way rather than with `save` plus a caught unique violation,
 * because a failed statement inside the caller's transaction aborts the whole transaction — a
 * duplicate notification would take the invoice down with it. `raw` is what `RETURNING` gave back:
 * the inserted row, or nothing at all when `ON CONFLICT DO NOTHING` did nothing.
 */
export interface MockInsertBuilder {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
}

export function createMockInsertBuilder(raw: unknown[]): MockInsertBuilder {
    const qb: Partial<MockInsertBuilder> = {};
    for (const method of ['insert', 'into', 'values', 'orIgnore', 'returning'] as const) {
        qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.execute = jest.fn().mockResolvedValue({ raw, identifiers: [], generatedMaps: [] });
    return qb as MockInsertBuilder;
}

/**
 * A stand-in for the `EntityManager` handed to a `dataSource.transaction` callback.
 *
 * Services that write more than one row do it in a transaction — a registration writes the user,
 * the profile, the confirmation token and two outbox messages, and either all of that happens or
 * none of it does. A unit test still wants to assert *what* was written without a database, so the
 * manager records its calls and `getRepository` hands back the same doubles the service would have
 * been injected with.
 */
export interface MockEntityManager {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    getRepository: jest.Mock;
}

export function createMockEntityManager(repositories: Map<unknown, MockRepository> = new Map()): MockEntityManager {
    return {
        // The real `create` merges the literal onto a new entity instance; for assertions the
        // literal itself is the interesting part, so it comes straight back.
        create: jest.fn((_entity: unknown, data: unknown) => data),
        save: jest.fn((_entityOrData: unknown, data?: unknown) => Promise.resolve(data ?? _entityOrData)),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        getRepository: jest.fn((entity: unknown) => repositories.get(entity) ?? createMockRepository()),
    };
}

/**
 * A `DataSource` whose `transaction` simply runs the callback with the given manager.
 *
 * No rollback is simulated: what the tests need is that the writes were *offered* to one manager,
 * which is what makes them one unit of work. Whether Postgres honours a rollback is Postgres's
 * business and is covered by the integration suite.
 */
export function provideMockDataSource(manager: MockEntityManager): Provider {
    const dataSource = {
        transaction: jest.fn((runInTransaction: (manager: EntityManager) => Promise<unknown>) => runInTransaction(manager as unknown as EntityManager)),
    };
    return { provide: getDataSourceToken(), useValue: dataSource };
}
