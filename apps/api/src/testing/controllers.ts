import { AuthController } from 'src/modules/auth/auth.controller';
import { UserController } from 'src/modules/user/user.controller';
import { ProfileController } from 'src/modules/profile/profile.controller';
import { ChildController } from 'src/modules/child/child.controller';
import { GroupController } from 'src/modules/group/group.controller';
import { AttendanceController } from 'src/modules/attendance/attendance.controller';
import { InvoiceController } from 'src/modules/invoice/invoice.controller';
import { PaymentController } from 'src/modules/payment/payment.controller';
import { DiscountController } from 'src/modules/discount/discount.controller';
import { HealthController } from 'src/modules/health/health.controller';

/**
 * Every HTTP surface the application exposes, in one place.
 *
 * There used to be two copies of this list — one in `authorization.spec.ts`, one in
 * `scripts/authorization-table.ts` — and they had already drifted apart inside a single pull
 * request: the script knew about `HealthController` and the test did not. So the generated
 * authorization table listed two endpoints as public that no test had ever checked, while both the
 * table's own preamble and the epic claimed every row was covered "by construction".
 *
 * One list now, and `authorization.spec.ts` separately asserts that it matches the controller files
 * actually on disk — so adding a controller without adding it here fails the suite rather than
 * quietly opting the whole file out of the authorization matrix.
 */
export const CONTROLLERS = [
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
