import { getRepositoryToken } from '@nestjs/typeorm';
import { Provider } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/**
 * Helper-e pentru testele unitare pe servicii. Serviciile primesc repository-uri TypeORM prin
 * injecție, iar testele nu trebuie să atingă o bază de date ca să verifice logica de business sau
 * de autorizare — au nevoie doar de repository-uri care înregistrează ce li s-a cerut.
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

/** Zahăr peste `{ provide: getRepositoryToken(Entity), useValue: ... }`. */
export function provideMockRepository(entity: Parameters<typeof getRepositoryToken>[0], mock: MockRepository): Provider {
    return { provide: getRepositoryToken(entity), useValue: mock };
}

/**
 * Query builder fals, în care fiecare metodă de construcție se întoarce pe sine, iar apelurile
 * rămân înregistrate. Tiparul de autorizare pe date din servicii se exprimă exclusiv prin
 * `andWhere` și `leftJoin`, deci un test poate verifica *ce condiții au fost adăugate* fără să
 * execute vreun SQL — care e chiar întrebarea care contează: „a fost restrânsă interogarea la
 * părintele autentificat?".
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

/** Doar partea de care are nevoie `isScopedToUser`, ca să nu conteze entitatea inferată. */
type RecordedCalls = Pick<MockQueryBuilder, 'andWhereCalls' | 'leftJoinCalls'>;

/** Adevărat dacă interogarea a fost restrânsă la utilizatorul dat — tiparul din CLAUDE.md. */
export function isScopedToUser(qb: RecordedCalls, userId: number): boolean {
    return (
        qb.leftJoinCalls.includes('parent.user') && qb.andWhereCalls.some(([condition, params]) => condition.includes('user.id') && params?.userId === userId)
    );
}
