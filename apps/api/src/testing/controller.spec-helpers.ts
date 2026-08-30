import { Test, TestingModule } from '@nestjs/testing';
import { Provider, Type } from '@nestjs/common';
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
    /**
     * Anything else the controller's constructor asks for. `UserController` took a second service
     * when E11 gave it the approvals queue, and Nest refuses to build a controller whose
     * dependencies it cannot resolve — so this is the seam for the second one rather than a reason
     * to hand-roll a testing module.
     */
    extraProviders: Provider[] = [],
): Promise<{ controller: C; service: Partial<Record<keyof S, jest.Mock>> }> {
    const module: TestingModule = await Test.createTestingModule({
        controllers: [controller],
        providers: [
            { provide: service, useValue: mock },
            { provide: JwtService, useValue: { verifyAsync: jest.fn(), verify: jest.fn(), sign: jest.fn() } },
            ...extraProviders,
        ],
    }).compile();

    return { controller: module.get(controller), service: mock };
}

/** A request as a controller sees it after AuthGuard: the JWT payload under `req.user`. */
export const requestOf = (role: string, sub: number) => ({ user: { role, sub } }) as never;
