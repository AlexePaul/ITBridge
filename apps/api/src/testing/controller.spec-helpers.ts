import { Test, TestingModule } from '@nestjs/testing';
import { Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Construiește un controller cu service-ul înlocuit de un mock. Guard-ele sunt înregistrate ca
 * providers, deci `AuthGuard` cere `JwtService` — îl dăm fals, fiindcă testele de controller nu
 * verifică guard-ele. Ce fac guard-ele e acoperit de `authorization.spec.ts`, la nivel de
 * metadate, și de testele de integrare, prin HTTP.
 */
export async function buildController<C, S extends object>(
    controller: Type<C>,
    service: Type<S>,
    mock: Partial<Record<keyof S, jest.Mock>>,
): Promise<{ controller: C; service: Partial<Record<keyof S, jest.Mock>> }> {
    const module: TestingModule = await Test.createTestingModule({
        controllers: [controller],
        providers: [
            { provide: service, useValue: mock },
            { provide: JwtService, useValue: { verifyAsync: jest.fn(), verify: jest.fn(), sign: jest.fn() } },
        ],
    }).compile();

    return { controller: module.get(controller), service: mock };
}

/** Cererea aşa cum o vede un controller după AuthGuard: payload-ul JWT sub `req.user`. */
export const requestOf = (role: string, sub: number) => ({ user: { role, sub } }) as never;
