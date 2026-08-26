import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/role.guard';
import { ROLE_KEY } from './decorators/role.decorator';
import { Role } from './enum/role.enum';

import { AuthController } from './modules/auth/auth.controller';
import { UserController } from './modules/user/user.controller';
import { ProfileController } from './modules/profile/profile.controller';
import { ChildController } from './modules/child/child.controller';
import { GroupController } from './modules/group/group.controller';
import { AttendanceController } from './modules/attendance/attendance.controller';
import { InvoiceController } from './modules/invoice/invoice.controller';
import { PaymentController } from './modules/payment/payment.controller';
import { DiscountController } from './modules/discount/discount.controller';

/**
 * Matricea de autorizare, citită din metadatele Nest.
 *
 * Ideea, din E03/S4: protecția nu trebuie să depindă de disciplina umană la fiecare endpoint nou.
 * Testul enumeră singur toate handler-ele din toate controllerele, deci un endpoint adăugat mâine
 * fără `@UseGuards` apare aici fără să scrie nimeni un test pentru el.
 *
 * Verificarea e la nivel de metadate, nu prin HTTP: nu are nevoie de bază de date și rulează în
 * milisecunde. Testele de integrare din `test/` verifică separat că guard-ele chiar resping.
 */

const CONTROLLERS = [
    AuthController,
    UserController,
    ProfileController,
    ChildController,
    GroupController,
    AttendanceController,
    InvoiceController,
    PaymentController,
    DiscountController,
];

/** Endpoint-uri care au voie să fie publice, cu motivul. Orice altceva trebuie să aibă AuthGuard. */
const PUBLIC_ALLOWLIST = new Set([
    'AuthController.register', // creare de cont
    'AuthController.login',
    'AuthController.refresh', // se autentifică singur, prin refresh token
]);

interface Handler {
    controller: string;
    method: string;
    key: string;
    httpMethod: string;
    route: string;
    guards: unknown[];
    roles: Role[] | undefined;
}

function handlersOf(controller: new (...args: never[]) => object): Handler[] {
    const proto = controller.prototype as Record<string, unknown>;
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? [];
    const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';

    return Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
        .filter((name) => Reflect.hasMetadata(METHOD_METADATA, proto[name] as object))
        .map((name) => {
            const fn = proto[name] as object;
            const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, fn) as unknown[]) ?? [];
            return {
                controller: controller.name,
                method: name,
                key: `${controller.name}.${name}`,
                httpMethod: RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number],
                route: `/${basePath}${(Reflect.getMetadata(PATH_METADATA, fn) as string) || ''}`.replace(/\/+/g, '/'),
                guards: [...classGuards, ...methodGuards],
                roles: Reflect.getMetadata(ROLE_KEY, fn) as Role[] | undefined,
            };
        });
}

const HANDLERS = CONTROLLERS.flatMap(handlersOf);

describe('matricea de autorizare', () => {
    it('găsește handler-e în fiecare controller', () => {
        // Plasă de siguranță pentru testul însuși: dacă reflecția se strică, restul ar trece gol.
        expect(HANDLERS.length).toBeGreaterThan(20);
        for (const controller of CONTROLLERS) {
            expect(handlersOf(controller).length).toBeGreaterThan(0);
        }
    });

    describe.each(HANDLERS.map((h) => [h.key, h] as const))('%s', (_key, handler) => {
        it('e protejat de AuthGuard, sau e public în mod explicit', () => {
            if (PUBLIC_ALLOWLIST.has(handler.key)) {
                expect(handler.guards).not.toContain(AuthGuard);
                return;
            }
            expect(handler.guards).toContain(AuthGuard);
        });

        it('aduce RolesGuard atunci când cere un rol', () => {
            if (handler.roles === undefined) return;
            expect(handler.guards).toContain(RolesGuard);
        });

        it('nu declară RolesGuard fără să ceară vreun rol', () => {
            // Un RolesGuard fără @Roles lasă totul să treacă — e o falsă senzație de siguranță.
            if (!handler.guards.includes(RolesGuard)) return;
            expect(handler.roles).toBeDefined();
        });
    });

    describe('scrierile sunt rezervate adminului', () => {
        const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

        /**
         * Scrieri pe care un PARENT are voie să le facă, fiecare cu autorizarea pe date verificată
         * în service. Lista e explicită tocmai ca adăugarea unei scrieri deschise să fie o decizie,
         * nu o scăpare.
         */
        const PARENT_WRITABLE = new Set([
            'AuthController.register',
            'AuthController.login',
            'AuthController.refresh',
            'ProfileController.createProfile', // părintele își creează propriul profil
            'ProfileController.updateProfile', // service-ul verifică proprietatea
            'ProfileController.deleteProfile',
            'ChildController.createChild', // service-ul verifică profilul părintelui
            'ChildController.updateChild',
            'ChildController.deleteChild',
        ]);

        const writes = HANDLERS.filter((h) => WRITE_METHODS.includes(h.httpMethod));

        it('există scrieri de verificat', () => {
            expect(writes.length).toBeGreaterThan(10);
        });

        it.each(writes.filter((h) => !PARENT_WRITABLE.has(h.key)).map((h) => [h.key, h] as const))('%s cere rolul ADMIN', (_key, handler) => {
            expect(handler.roles).toEqual([Role.ADMIN]);
        });
    });
});
