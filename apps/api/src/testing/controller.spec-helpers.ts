import { Test, TestingModule } from '@nestjs/testing';
import { Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Builds a controller with its service replaced by a mock. Guards are registered as providers, so
 * `AuthGuard` asks for `JwtService` — we hand it a fake one, because controller tests do not
 * exercise guards. What guards do is covered by `authorization.spec.ts` at the metadata level, and
 * by the integration tests over HTTP.
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

/** A request as a controller sees it after AuthGuard: the JWT payload under `req.user`. */
export const requestOf = (role: string, sub: number) => ({ user: { role, sub } }) as never;
