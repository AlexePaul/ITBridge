/**
 * Verificări la nivel de tip între entitățile TypeORM și contractul din `@itbridge/types`.
 *
 * Fișierul nu exportă nimic executabil și nu e importat de nicăieri — există exclusiv ca
 * `pnpm typecheck` să eșueze când o entitate se schimbă fără ca formatul de pe sârmă să fie
 * actualizat. Fără el, contractul ar prinde doar drift-ul dinspre frontend: backend-ul ar putea
 * redenumi un câmp, iar `packages/types` ar rămâne să descrie o realitate care nu mai există.
 *
 * `Serialized<T>` traduce `Date` în string, fiindcă asta face `JSON.stringify` la ieșirea din
 * controller. Verificarea e „entitatea acoperă contractul", nu egalitate: entitățile au relații
 * și câmpuri interne (`passwordHash`, `attendances`) care nu ies niciodată prin API.
 */
import type { Serialized } from '@itbridge/types';
import type * as Wire from '@itbridge/types';

import type { User } from './entities/user.entity';
import type { Profile } from './entities/profile.entity';
import type { Child } from './entities/child.entity';
import type { Group } from './entities/group.entity';
import type { Attendance } from './entities/attendance.entity';
import type { Invoice } from './entities/invoice.entity';
import type { Payment } from './entities/payment.entity';
import type { Discount } from './entities/discount.entity';

/** Eșuează compilarea dacă `Actual` nu satisface `Expected` pe câmpurile comune. */
type Covers<Expected, Actual> = Actual extends Expected ? true : { missingOrMismatched: Expected };

type Check<Expected, Actual extends Expected> = Covers<Expected, Actual>;

// Fiecare linie compilează doar dacă entitatea serializată acoperă forma din contract.
type _User = Check<Pick<Wire.User, 'id' | 'username' | 'role'>, Pick<Serialized<User>, 'id' | 'username' | 'role'>>;
type _Profile = Check<Pick<Wire.ProfileSummary, 'id' | 'firstName' | 'lastName'>, Pick<Serialized<Profile>, 'id' | 'firstName' | 'lastName'>>;
type _Child = Check<Pick<Wire.Child, 'id' | 'firstName' | 'lastName' | 'birthDate'>, Pick<Serialized<Child>, 'id' | 'firstName' | 'lastName' | 'birthDate'>>;
type _Group = Check<Omit<Wire.Group, never>, Omit<Serialized<Group>, 'children'>>;
type _Attendance = Check<Pick<Wire.Attendance, 'id' | 'date' | 'startTime' | 'present'>, Pick<Serialized<Attendance>, 'id' | 'date' | 'startTime' | 'present'>>;
type _Invoice = Check<
    Pick<Wire.Invoice, 'id' | 'amount' | 'dateIssued' | 'monthIssued' | 'status'>,
    Pick<Serialized<Invoice>, 'id' | 'amount' | 'dateIssued' | 'monthIssued' | 'status'>
>;
type _Payment = Check<Pick<Wire.Payment, 'id' | 'method' | 'date'>, Pick<Serialized<Payment>, 'id' | 'method' | 'date'>>;
type _Discount = Check<Pick<Wire.Discount, 'id' | 'name' | 'value' | 'monthIssued'>, Pick<Serialized<Discount>, 'id' | 'name' | 'value' | 'monthIssued'>>;
