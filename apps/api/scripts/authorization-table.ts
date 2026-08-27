import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthGuard } from '../src/guards/auth.guard';
import { RolesGuard } from '../src/guards/role.guard';
import { ROLE_KEY } from '../src/decorators/role.decorator';
import { Role } from '../src/enum/role.enum';

import { CONTROLLERS } from '../src/testing/controllers';

/** Services that narrow their queries to the authenticated user for non-admins. */
const ROW_SCOPED = new Set([
    'InvoiceController.findInvoices',
    'InvoiceController.findOne',
    'InvoiceController.getInvoicePdf',
    'PaymentController.findPayments',
    'PaymentController.findOne',
    'ChildController.findChildren',
    'ChildController.updateChild',
    'ChildController.deleteChild',
    'ChildController.createChild',
    'ProfileController.findProfiles',
    'ProfileController.updateProfile',
    'ProfileController.deleteProfile',
    'ProfileController.createProfile', // a PARENT's userId is forced to their own
    'AttendanceController.getAttendanceByChild',
    'AuthController.logoutEverywhere',
    'AuthController.sessions',
]);

interface Row {
    method: string;
    route: string;
    handler: string;
    auth: string;
    roles: string;
    scoped: string;
}

function rowsFor(controller: new (...args: never[]) => object): Row[] {
    const proto = controller.prototype as Record<string, unknown>;
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? [];
    const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';

    return Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
        .filter((name) => Reflect.hasMetadata(METHOD_METADATA, proto[name] as object))
        .map((name) => {
            const fn = proto[name] as object;
            const guards = [...classGuards, ...((Reflect.getMetadata(GUARDS_METADATA, fn) as unknown[]) ?? [])];
            const roles = Reflect.getMetadata(ROLE_KEY, fn) as Role[] | undefined;
            const key = `${controller.name}.${name}`;

            return {
                method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number],
                route: `/${basePath}/${(Reflect.getMetadata(PATH_METADATA, fn) as string) || ''}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/',
                handler: key,
                auth: guards.includes(AuthGuard) ? 'yes' : '**public**',
                roles: roles?.join(', ') ?? (guards.includes(RolesGuard) ? '⚠ guard, no role' : 'any'),
                scoped: ROW_SCOPED.has(key) ? 'yes' : '—',
            };
        });
}

const rows = CONTROLLERS.flatMap(rowsFor).sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));

console.log('| Method | Route | Handler | AuthGuard | Role | Row-scoped |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
    console.log(`| ${r.method} | \`${r.route}\` | \`${r.handler}\` | ${r.auth} | ${r.roles} | ${r.scoped} |`);
}
console.log(`\n${rows.length} endpoints.`);
