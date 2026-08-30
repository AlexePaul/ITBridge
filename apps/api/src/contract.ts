/**
 * Type-level checks between the TypeORM entities and the contract in `@itbridge/types`.
 *
 * This file exports nothing executable and is imported from nowhere — it exists purely so that
 * `pnpm typecheck` fails when an entity changes without the wire format being updated. Without it
 * the contract would only catch drift coming from the frontend: the backend could rename a field
 * and `packages/types` would go on describing a reality that no longer exists.
 *
 * `Serialized<T>` turns `Date` into a string, because that is what `JSON.stringify` does on the way
 * out of a controller. The check is "the entity covers the contract", not equality: entities carry
 * relations and internal fields (`passwordHash`, `attendances`) that never leave through the API.
 */
import type { Serialized } from '@itbridge/types';
import type * as Wire from '@itbridge/types';

import type { User } from './entities/user.entity';
import type { Profile } from './entities/profile.entity';
import type { Child } from './entities/child.entity';
import type { Group } from './entities/group.entity';
import type { Location } from './entities/location.entity';
import type { Room } from './entities/room.entity';
import type { Attendance } from './entities/attendance.entity';
import type { ClassSession } from './entities/class-session.entity';
import type { Invoice } from './entities/invoice.entity';
import type { Payment } from './entities/payment.entity';
import type { Discount } from './entities/discount.entity';
import type { Project } from './entities/project.entity';
import type { ProjectVersion } from './entities/project-version.entity';
import type { ProjectFile } from './entities/project-file.entity';
import type { ProjectLink } from './entities/project-link.entity';
import type { UnassignedFile } from './entities/unassigned-file.entity';
import type { AgentStatus } from './entities/agent-status.entity';
import type { Weekday } from './enum/weekday.enum';
import type { AttendanceType } from './enum/attendance-type.enum';
import type { ClassSessionStatus } from './enum/class-session-status.enum';
import type { Role } from './enum/role.enum';
import type { ApprovalStatus } from './enum/approval-status.enum';
import type { ProjectStatus } from './enum/project-status.enum';
import type { ProjectSource } from './enum/project-source.enum';
import type { UnassignedFileReason } from './enum/unassigned-file-reason.enum';

/** Fails compilation when `Actual` does not satisfy `Expected` on the shared fields. */
type Covers<Expected, Actual> = Actual extends Expected ? true : { missingOrMismatched: Expected };

type Check<Expected, Actual extends Expected> = Covers<Expected, Actual>;

// Each line compiles only if the serialized entity covers the shape from the contract.
type _User = Check<Pick<Wire.User, 'id' | 'username' | 'role'>, Pick<Serialized<User>, 'id' | 'username' | 'role'>>;
type _ApprovalStatus = Check<Wire.ApprovalStatus, ApprovalStatus>;
type _Profile = Check<Pick<Wire.ProfileSummary, 'id' | 'firstName' | 'lastName'>, Pick<Serialized<Profile>, 'id' | 'firstName' | 'lastName'>>;
type _ProfileEmergency = Check<
    Pick<Wire.ProfileSummary, 'emergencyContactName' | 'emergencyContactRelation' | 'emergencyContactPhone'>,
    Pick<Serialized<Profile>, 'emergencyContactName' | 'emergencyContactRelation' | 'emergencyContactPhone'>
>;
type _Child = Check<Pick<Wire.Child, 'id' | 'firstName' | 'lastName' | 'birthDate'>, Pick<Serialized<Child>, 'id' | 'firstName' | 'lastName' | 'birthDate'>>;
type _Group = Check<Omit<Wire.Group, never>, Omit<Serialized<Group>, 'children'>>;
type _Location = Check<Omit<Wire.Location, never>, Omit<Serialized<Location>, 'rooms'>>;
type _Room = Check<Omit<Wire.Room, never>, Omit<Serialized<Room>, 'groups'>>;
type _ClassSession = Check<Omit<Wire.ClassSession, never>, Omit<Serialized<ClassSession>, 'attendances'>>;

// E14. Checked field by field rather than whole, because the entity carries several things that
// never leave: `classSession`, `uploadedBy`, the reassignment trail, and the outbox row id. The
// storage key is not among them and is not a field at all — it is derived by `projectFileKey`.
type _Project = Check<
    Pick<Wire.Project, 'id' | 'publicId' | 'title' | 'description' | 'capturedOn' | 'hasThumbnail' | 'sentAt' | 'sentToEmail' | 'createdAt'>,
    Pick<Serialized<Project>, 'id' | 'publicId' | 'title' | 'description' | 'capturedOn' | 'hasThumbnail' | 'sentAt' | 'sentToEmail' | 'createdAt'>
>;
type _ProjectVersion = Check<
    Pick<Wire.ProjectVersion, 'id' | 'versionNumber' | 'createdAt'>,
    Pick<Serialized<ProjectVersion>, 'id' | 'versionNumber' | 'createdAt'>
>;
type _ProjectFile = Check<
    Pick<Wire.ProjectFile, 'id' | 'originalName' | 'contentType' | 'sizeBytes' | 'createdAt'>,
    Pick<Serialized<ProjectFile>, 'id' | 'originalName' | 'contentType' | 'sizeBytes' | 'createdAt'>
>;
type _ProjectLink = Check<Pick<Wire.ProjectLink, 'id' | 'label' | 'url'>, Pick<Serialized<ProjectLink>, 'id' | 'label' | 'url'>>;
type _UnassignedFile = Check<
    Pick<Wire.UnassignedFile, 'id' | 'relativePath' | 'fileName' | 'sizeBytes' | 'reportedAt' | 'resolvedAt'>,
    Pick<Serialized<UnassignedFile>, 'id' | 'relativePath' | 'fileName' | 'sizeBytes' | 'reportedAt' | 'resolvedAt'>
>;
type _AgentStatus = Check<Omit<Wire.AgentStatus, never>, Omit<Serialized<AgentStatus>, never>>;

// The enums have to agree value for value, not merely be enums of the same shape. Two independent
// declarations of "ISO weekday" would otherwise be free to drift — one starting at 0, say.
type _Weekday = Check<Wire.Weekday, Weekday>;
type _WeekdayBack = Check<Weekday, Wire.Weekday>;
type _AttendanceType = Check<Wire.AttendanceType, AttendanceType>;
type _AttendanceTypeBack = Check<AttendanceType, Wire.AttendanceType>;
type _ClassSessionStatus = Check<Wire.ClassSessionStatus, ClassSessionStatus>;
type _ClassSessionStatusBack = Check<ClassSessionStatus, Wire.ClassSessionStatus>;
type _Role = Check<Wire.Role, Role>;
// E14's three are compared through `${Enum}` — the union of the enum's *values* — because the
// contract side is a union of literals, not an enum, and a TypeScript enum is nominal: neither
// direction of `extends` holds between the two however identical the values are. The template
// literal collapses the enum to exactly the strings that go on the wire, which is the thing that
// actually has to match. Nothing new in `@itbridge/types` may be an enum; see CLAUDE.md for the
// prebundler failure that rule comes from.
type _ProjectStatus = Check<Wire.ProjectStatus, `${ProjectStatus}`>;
type _ProjectStatusBack = Check<`${ProjectStatus}`, Wire.ProjectStatus>;
type _ProjectSource = Check<Wire.ProjectSource, `${ProjectSource}`>;
type _ProjectSourceBack = Check<`${ProjectSource}`, Wire.ProjectSource>;
type _UnassignedFileReason = Check<Wire.UnassignedFileReason, `${UnassignedFileReason}`>;
type _UnassignedFileReasonBack = Check<`${UnassignedFileReason}`, Wire.UnassignedFileReason>;
type _RoleBack = Check<Role, Wire.Role>;
// `date` and `startTime` used to be checked here. They are on the session now, not on the mark.
type _Attendance = Check<Pick<Wire.Attendance, 'id' | 'type' | 'present'>, Pick<Serialized<Attendance>, 'id' | 'type' | 'present'>>;
type _Invoice = Check<
    Pick<Wire.Invoice, 'id' | 'amount' | 'dateIssued' | 'monthIssued' | 'status'>,
    Pick<Serialized<Invoice>, 'id' | 'amount' | 'dateIssued' | 'monthIssued' | 'status'>
>;
type _Payment = Check<Pick<Wire.Payment, 'id' | 'method' | 'date'>, Pick<Serialized<Payment>, 'id' | 'method' | 'date'>>;
type _Discount = Check<Pick<Wire.Discount, 'id' | 'name' | 'value' | 'monthIssued'>, Pick<Serialized<Discount>, 'id' | 'name' | 'value' | 'monthIssued'>>;

// `OutboxMessage` has no entry here on purpose: nothing serves it. It is an internal queue, drained
// by a scheduler, and E17/S3 is explicit that the operation which queues a message does not wait
// for it. The delivery record an admin reads is E17/S5, and that is when it acquires a wire shape.
