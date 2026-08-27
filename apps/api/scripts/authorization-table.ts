import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthGuard } from '../src/guards/auth.guard';
import { RolesGuard } from '../src/guards/role.guard';
import { ROLE_KEY } from '../src/decorators/role.decorator';
import { Role } from '../src/enum/role.enum';

import { AuthController } from '../src/modules/auth/auth.controller';
import { UserController } from '../src/modules/user/user.controller';
import { ProfileController } from '../src/modules/profile/profile.controller';
import { ChildController } from '../src/modules/child/child.controller';
import { GroupController } from '../src/modules/group/group.controller';
import { AttendanceController } from '../src/modules/attendance/attendance.controller';
import { InvoiceController } from '../src/modules/invoice/invoice.controller';
import { PaymentController } from '../src/modules/payment/payment.controller';
import { DiscountController } from '../src/modules/discount/discount.controller';
import { HealthController } from '../src/modules/health/health.controller';

/**
 * Prints the authorization table E05/S8 asks for, read from the same Nest metadata that
 * `src/authorization.spec.ts` asserts against.
 *
 * Generated rather than written by hand on purpose: a table maintained manually is wrong the first
 * time somebody forgets to update it, and a stale authorization table is worse than none — it reads
 * like a guarantee. Regenerate with:
 *
 *     pnpm --filter api authorization:table
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
    HealthController,
];

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
