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
import type { Enrollment } from './entities/enrollment.entity';
import type { InvoiceWorksheetRow } from './modules/invoice/invoice.service';
import type { FinanceReport } from './modules/dashboard/finance-report.service';
import type { OccupancyReport } from './modules/dashboard/occupancy-report.service';
import type { AnnouncementDetail, AnnouncementPreview, AnnouncementResult, AnnouncementSummary } from './modules/announcement/announcement.service';
import type { AnnouncementAudience } from './enum/announcement-audience.enum';
import type { MessageKind } from './enum/message-kind.enum';
import type { MessageFrequency } from './enum/message-frequency.enum';
import type { WaitlistEntry } from './entities/waitlist-entry.entity';
import type { NonTeachingPeriod } from './entities/non-teaching-period.entity';
import type { Location } from './entities/location.entity';
import type { Room } from './entities/room.entity';
import type { Attendance } from './entities/attendance.entity';
import type { ClassSession } from './entities/class-session.entity';
import type { Invoice } from './entities/invoice.entity';
import type { Payment } from './entities/payment.entity';
import type { PaymentMethod } from './enum/payment-method.enum';
import type { PaymentStatus } from './enum/payment-status.enum';
import type { Discount } from './entities/discount.entity';
import type { DiscountType } from './enum/discount-type.enum';
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
import type { EnrollmentStatus } from './enum/enrollment-status.enum';
import type { WaitlistStatus } from './enum/waitlist-status.enum';
import type { ProjectStatus } from './enum/project-status.enum';
import type { ProjectSource } from './enum/project-source.enum';
import type { UnassignedFileReason } from './enum/unassigned-file-reason.enum';
import type { OutboxMessage } from './entities/outbox-message.entity';
import type { OutboxStatus } from './enum/outbox-status.enum';
import type { DeliveryFailureReason } from './enum/delivery-failure-reason.enum';

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

// E11/S1 and S3. The status checks are the load-bearing ones: the wire types are unions of literals
// while the entities use enums, so these lines are what stops a status added on one side from
// silently not existing on the other.
// The worksheet row is assembled in the service rather than serialized from an entity, so the
// check here is that the two descriptions of it agree — the backend's own interface against the
// wire's. Without it the screen and the endpoint could drift a field apart in silence.
type _InvoiceWorksheetRow = Check<Wire.InvoiceWorksheetRow, InvoiceWorksheetRow>;
// E12/S2. The dates are `date` columns, which the driver hands back as strings — the same shape the
// wire has — so this check is about the fields existing, not about `Serialized` converting them.
type _NonTeachingPeriod = Check<
    Pick<Wire.NonTeachingPeriod, 'id' | 'name' | 'startDate' | 'endDate'>,
    Pick<Serialized<NonTeachingPeriod>, 'id' | 'name' | 'startDate' | 'endDate'>
>;
type _EnrollmentStatus = Check<Wire.EnrollmentStatus, EnrollmentStatus>;
type _WaitlistStatus = Check<Wire.WaitlistStatus, WaitlistStatus>;
type _Enrollment = Check<
    Pick<Wire.Enrollment, 'id' | 'status' | 'startDate' | 'endDate' | 'exitReason' | 'contractSignedAt'>,
    Pick<Serialized<Enrollment>, 'id' | 'status' | 'startDate' | 'endDate' | 'exitReason' | 'contractSignedAt'>
>;
type _WaitlistEntry = Check<
    Pick<Wire.WaitlistEntry, 'id' | 'status' | 'createdAt' | 'offeredAt' | 'respondBy' | 'note'>,
    Pick<Serialized<WaitlistEntry>, 'id' | 'status' | 'createdAt' | 'offeredAt' | 'respondBy' | 'note'>
>;
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
// Through `${Enum}` for the same reason E14's three are, below: the contract side is a union of
// literals now, and an enum is nominal, so neither direction of `extends` holds between them.
type _ClassSessionStatus = Check<Wire.ClassSessionStatus, `${ClassSessionStatus}`>;
type _ClassSessionStatusBack = Check<`${ClassSessionStatus}`, Wire.ClassSessionStatus>;
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
type _Payment = Check<
    Pick<Wire.Payment, 'id' | 'amount' | 'method' | 'status' | 'date' | 'externalReference' | 'smartbillReference' | 'notes' | 'createdAt'>,
    Pick<Serialized<Payment>, 'id' | 'amount' | 'method' | 'status' | 'date' | 'externalReference' | 'smartbillReference' | 'notes' | 'createdAt'>
>;
// `recordedBy` is deliberately not compared field-for-field: the entity holds a `User` relation,
// but the service selects only `id` and `username` onto the wire — never the credentials row — and
// the contract describes the wire.
type _PaymentMethod = Check<Wire.PaymentMethod, `${PaymentMethod}`>;
type _PaymentMethodBack = Check<`${PaymentMethod}`, Wire.PaymentMethod>;
type _PaymentStatus = Check<Wire.PaymentStatus, `${PaymentStatus}`>;
type _PaymentStatusBack = Check<`${PaymentStatus}`, Wire.PaymentStatus>;
type _Discount = Check<Pick<Wire.Discount, 'id' | 'name' | 'value' | 'monthIssued'>, Pick<Serialized<Discount>, 'id' | 'name' | 'value' | 'monthIssued'>>;
// Through `${Enum}`, like the other literal unions: an enum is nominal, so neither direction of
// `extends` holds between it and the strings it puts on the wire.
type _DiscountType = Check<Wire.DiscountType, `${DiscountType}`>;
type _DiscountTypeBack = Check<`${DiscountType}`, Wire.DiscountType>;

// E17/S5 gave the outbox a read surface, so the two statuses it puts on the wire are checked here.
// The row itself is compared loosely — `DeliveryRecord` is the queue's shape minus the fields the
// dispatcher owns (`nextAttemptAt`, `dedupeKey`, `attachments`), which the screen has no use for.
type _DeliveryStatus = Check<Wire.DeliveryStatus, `${OutboxStatus}`>;
type _DeliveryStatusBack = Check<`${OutboxStatus}`, Wire.DeliveryStatus>;
type _DeliveryFailureReason = Check<Wire.DeliveryFailureReason, `${DeliveryFailureReason}`>;
type _DeliveryFailureReasonBack = Check<`${DeliveryFailureReason}`, Wire.DeliveryFailureReason>;
type _DeliveryRecord = Check<
    Pick<Wire.DeliveryRecord, 'id' | 'to' | 'subject' | 'bodyText' | 'attempts' | 'lastError'>,
    Pick<Serialized<OutboxMessage>, 'id' | 'to' | 'subject' | 'bodyText' | 'attempts' | 'lastError'>
>;

// The rest of `OutboxMessage` has no entry here on purpose: nothing serves it. It is an internal queue, drained
// by a scheduler, and E17/S3 is explicit that the operation which queues a message does not wait
// for it. The delivery record an admin reads is E17/S5, and that is when it acquires a wire shape.

// E21/S2 and S4. The reports are service-shaped rather than entity-shaped, so the check is on the
// interfaces the services return: a field added to a month or a room on one side must appear on the
// other, or the page that reads it types against a figure that never arrives.
type _FinanceReport = Check<Wire.FinanceReport, FinanceReport>;
type _OccupancyReport = Check<Wire.OccupancyReport, OccupancyReport>;

// E17/S7. The announcement surface is service-shaped, like the reports: what leaves the controller
// is a summary assembled from an entity, a relation and a count over the queue, so checking the
// entity would check the wrong thing. `Serialized` turns `createdAt` into the string it becomes.
type _AnnouncementAudience = Check<Wire.AnnouncementAudience, `${AnnouncementAudience}`>;
type _AnnouncementAudienceBack = Check<`${AnnouncementAudience}`, Wire.AnnouncementAudience>;
type _AnnouncementKind = Check<Wire.AnnouncementKind, `${MessageKind}`>;
type _AnnouncementKindBack = Check<`${MessageKind}`, Wire.AnnouncementKind>;

// E17/S6. The family's cadence goes on the wire as a literal union, like every other enum here.
type _MessageFrequency = Check<Wire.MessageFrequency, `${MessageFrequency}`>;
type _MessageFrequencyBack = Check<`${MessageFrequency}`, Wire.MessageFrequency>;
type _AnnouncementPreview = Check<Wire.AnnouncementPreview, AnnouncementPreview>;
type _AnnouncementResult = Check<Wire.AnnouncementResult, AnnouncementResult>;
type _AnnouncementSummary = Check<Wire.AnnouncementSummary, Serialized<AnnouncementSummary>>;
// The detail's messages are the loose half: the screen wants a handful of columns off each outbox
// row, not the queue's own bookkeeping.
type _AnnouncementDetail = Check<
    Pick<Wire.AnnouncementDetail, 'id' | 'subject' | 'recipientCount' | 'declinedCount' | 'deliveries'>,
    Pick<Serialized<AnnouncementDetail>, 'id' | 'subject' | 'recipientCount' | 'declinedCount' | 'deliveries'>
>;
