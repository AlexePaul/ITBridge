# Harta ecranelor

Fiecare ecran, fișierul lui, cererile pe care le face către API și cine le răspunde: controllerul
și serviciile pe care le cheamă, în ordinea în care rulează. Pentru bug-ul care nu dă nicio eroare
— un număr greșit, un rând lipsă —, unde codul de pe ecran nu există: pornești de la ecranul pe care
îl vezi. Vezi și [runbook.md](runbook.md), „Un bug".

**Generat din surse, nu scris de mână**: `pnpm --filter web screens:render` îl rescrie, iar
`apps/web/test/screen-map.spec.ts` pică dacă a rămas în urmă. Urmează pagina, componentele pe care
le desenează, composable-urile și magazinele Pinia pe care le cheamă; o cerere făcută altfel (un
`$fetch` direct) nu apare.

## Pe fiecare pagină

Cererile din jurul paginii: layout-ul, pluginurile și middleware-ul. Nu sunt repetate sub fiecare
ecran; dacă un număr din meniu e greșit, aici e cererea lui.

### `apps/web/app/layouts/dashboard.vue` — în jurul fiecărei pagini de admin: cifrele din meniu și locațiile

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/replacements/unplaced` | `AttendanceController.unplacedReplacements` în `apps/api/src/modules/attendance/attendance.controller.ts` | `ReplacementService.unplaced` în `apps/api/src/modules/attendance/replacement.service.ts` |
| `GET /errors/summary` | `ErrorReportController.summary` în `apps/api/src/modules/error-report/error-report.controller.ts` | `ErrorReportService.summary` în `apps/api/src/modules/error-report/error-report.service.ts` |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `GET /projects/pending` | `ProjectController.pending` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.pendingSummary` în `apps/api/src/modules/project/project.service.ts` |
| `GET /rooms` | `RoomController.getRooms` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.findRooms` în `apps/api/src/modules/room/room.service.ts` |
| `POST /auth/logout` | `AuthController.logout` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.logout` în `apps/api/src/modules/auth/auth.service.ts` |

### `apps/web/app/layouts/portal.vue` — în jurul fiecărei pagini a portalului

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /auth/logout` | `AuthController.logout` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.logout` în `apps/api/src/modules/auth/auth.service.ts` |

### `apps/web/app/plugins/01.auth.client.ts` — la încărcarea oricărei pagini, cu o sesiune salvată

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /auth/me` | `AuthController.getProfile` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.getUserProfile` în `apps/api/src/modules/auth/auth.service.ts` |

### `apps/web/app/plugins/03.profile.client.ts` — la încărcarea oricărei pagini, pentru un părinte

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |

### `apps/web/app/plugins/05.error-report.client.ts` — când un ecran se strică în browser

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /errors/client` | `ErrorReportController.reportFromBrowser` în `apps/api/src/modules/error-report/error-report.controller.ts` | `ErrorReportService.takesBrowserReport` în `apps/api/src/modules/error-report/error-report.service.ts`, apoi `ErrorReportService.record` în `apps/api/src/modules/error-report/error-report.service.ts` |

### `apps/web/app/middleware/01.auth.global.ts` — la fiecare navigare

Nu face nicio cerere către API.

### `apps/web/app/middleware/02.profile-setup.global.ts` — la fiecare navigare

Nu face nicio cerere către API.

### `apps/web/app/middleware/03.legal-acceptance.global.ts` — la fiecare navigare

Nu face nicio cerere către API.

### `apps/web/app/composables/api/useApi.ts` — la orice cerere care primește 401

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/refresh` | `AuthController.refresh` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.refreshToken` în `apps/api/src/modules/auth/auth.service.ts` |

## Zona de admin

### `/admin/absente` — Absențe anunțate

Pagina: `apps/web/app/pages/admin/absente/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /attendance/absences/:id` | `AttendanceController.withdrawAbsence` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AbsenceNoticeService.withdraw` în `apps/api/src/modules/attendance/absence-notice.service.ts` |
| `DELETE /attendance/absences/:id/replacement` | `AttendanceController.clearReplacement` în `apps/api/src/modules/attendance/attendance.controller.ts` | `ReplacementService.clear` în `apps/api/src/modules/attendance/replacement.service.ts` |
| `GET /attendance/absences` | `AttendanceController.upcomingAbsences` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AbsenceNoticeService.upcoming` în `apps/api/src/modules/attendance/absence-notice.service.ts` |
| `GET /attendance/absences/:id/replacement-options` | `AttendanceController.replacementOptions` în `apps/api/src/modules/attendance/attendance.controller.ts` | `ReplacementService.optionsFor` în `apps/api/src/modules/attendance/replacement.service.ts` |
| `GET /attendance/replacements/unplaced` | `AttendanceController.unplacedReplacements` în `apps/api/src/modules/attendance/attendance.controller.ts` | `ReplacementService.unplaced` în `apps/api/src/modules/attendance/replacement.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `POST /attendance/absences` | `AttendanceController.announceAbsence` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AbsenceNoticeService.announce` în `apps/api/src/modules/attendance/absence-notice.service.ts` |
| `PUT /attendance/absences/:id/replacement` | `AttendanceController.placeReplacement` în `apps/api/src/modules/attendance/attendance.controller.ts` | `ReplacementService.place` în `apps/api/src/modules/attendance/replacement.service.ts` |

### `/admin/acorduri` — Acorduri pentru lucrări

Pagina: `apps/web/app/pages/admin/acorduri/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /privacy/consents/in-force` | `ConsentController.inForce` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.inForce` în `apps/api/src/modules/privacy/publication-consent.service.ts` |

### `/admin/anunturi` — Anunțuri

Pagina: `apps/web/app/pages/admin/anunturi/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /announcements` | `AnnouncementController.list` în `apps/api/src/modules/announcement/announcement.controller.ts` | `AnnouncementService.list` în `apps/api/src/modules/announcement/announcement.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `POST /announcements` | `AnnouncementController.send` în `apps/api/src/modules/announcement/announcement.controller.ts` | `AnnouncementService.send` în `apps/api/src/modules/announcement/announcement.service.ts` |
| `POST /announcements/preview` | `AnnouncementController.preview` în `apps/api/src/modules/announcement/announcement.controller.ts` | `AnnouncementService.preview` în `apps/api/src/modules/announcement/announcement.service.ts` |
| `POST /announcements/test` | `AnnouncementController.sendTest` în `apps/api/src/modules/announcement/announcement.controller.ts` | `AnnouncementService.sendTest` în `apps/api/src/modules/announcement/announcement.service.ts` |

### `/admin/approvals` — Conturi în așteptare

Pagina: `apps/web/app/pages/admin/approvals/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /users/pending` | `UserController.getPendingAccounts` în `apps/api/src/modules/user/user.controller.ts` | `AccountApprovalService.listPending` în `apps/api/src/modules/user/account-approval.service.ts` |
| `GET /users/rejected` | `UserController.getRejectedAccounts` în `apps/api/src/modules/user/user.controller.ts` | `AccountApprovalService.listRejected` în `apps/api/src/modules/user/account-approval.service.ts` |
| `GET /users/suspended` | `UserController.getSuspendedAccounts` în `apps/api/src/modules/user/user.controller.ts` | `AccountSuspensionService.listSuspended` în `apps/api/src/modules/user/account-suspension.service.ts` |
| `POST /users/:id/approve` | `UserController.approveAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountApprovalService.approve` în `apps/api/src/modules/user/account-approval.service.ts` |
| `POST /users/:id/reactivate` | `UserController.reactivateAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountSuspensionService.reactivate` în `apps/api/src/modules/user/account-suspension.service.ts` |
| `POST /users/:id/reject` | `UserController.rejectAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountApprovalService.reject` în `apps/api/src/modules/user/account-approval.service.ts` |

### `/admin/attendance` — Prezența

Pagina: `apps/web/app/pages/admin/attendance/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /class-sessions/unmarked` | `ClassSessionController.getUnmarkedSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findUnmarkedSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/admin/attendance/azi` — Prezența de azi

Pagina: `apps/web/app/pages/admin/attendance/azi.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/session/:classSessionId/register` | `AttendanceController.sessionRegister` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.sessionRegister` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `PUT /attendance/session/:classSessionId/child/:childId` | `AttendanceController.upsertMark` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.upsertMark` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `PUT /class-sessions/:id/vacation` | `ClassSessionController.setVacation` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.setVacation` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/admin/attendance/children` — Gestionarea Prezenței Copiilor

Pagina: `apps/web/app/pages/admin/attendance/children/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |

### `/admin/attendance/children/:childId` — Gestionarea Prezenței unui Copil

Pagina: `apps/web/app/pages/admin/attendance/children/[childId].vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/child/:childId` | `AttendanceController.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |

### `/admin/attendance/group` — Prezența unei grupe

Pagina: `apps/web/app/pages/admin/attendance/group/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /reports/occupancy` | `ReportsController.occupancyReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `OccupancyReportService.build` în `apps/api/src/modules/dashboard/occupancy-report.service.ts` |

### `/admin/attendance/group/:groupId` — Înregistrarea Prezenței pe Grup

Pagina: `apps/web/app/pages/admin/attendance/group/[groupId].vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/session/:classSessionId/register` | `AttendanceController.sessionRegister` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.sessionRegister` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `GET /enrollments/group/:groupId/members` | `EnrollmentController.membersOn` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.membersOn` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `POST /attendance/session/:classSessionId` | `AttendanceController.createAttendance` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.createAttendance` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `POST /class-sessions/generate` | `ClassSessionController.generateSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.generateSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/admin/calendar` — Calendar școlar

Pagina: `apps/web/app/pages/admin/calendar/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /class-sessions/non-teaching/:id` | `ClassSessionController.removeNonTeachingPeriod` în `apps/api/src/modules/class-session/class-session.controller.ts` | `NonTeachingPeriodService.remove` în `apps/api/src/modules/class-session/non-teaching-period.service.ts` |
| `GET /class-sessions/non-teaching` | `ClassSessionController.nonTeachingPeriods` în `apps/api/src/modules/class-session/class-session.controller.ts` | `NonTeachingPeriodService.findAll` în `apps/api/src/modules/class-session/non-teaching-period.service.ts` |
| `GET /class-sessions/non-teaching/impact` | `ClassSessionController.nonTeachingImpact` în `apps/api/src/modules/class-session/class-session.controller.ts` | `NonTeachingPeriodService.impactOf` în `apps/api/src/modules/class-session/non-teaching-period.service.ts` |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `POST /class-sessions/non-teaching` | `ClassSessionController.createNonTeachingPeriod` în `apps/api/src/modules/class-session/class-session.controller.ts` | `NonTeachingPeriodService.create` în `apps/api/src/modules/class-session/non-teaching-period.service.ts` |

### `/admin/children` — Copii

Pagina: `apps/web/app/pages/admin/children/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |

### `/admin/children/:childId/confirmation` — Confirmare Ștergere Copil

Pagina: `apps/web/app/pages/admin/children/[childId]/confirmation.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /children/:childId` | `ChildController.deleteChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.deleteChild` în `apps/api/src/modules/child/child.service.ts` |

### `/admin/children/:childId/edit` — Editare copil

Pagina: `apps/web/app/pages/admin/children/[childId]/edit.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /enrollments/child/:childId` | `EnrollmentController.historyFor` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.historyFor` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /enrollments/transfer` | `EnrollmentController.transfer` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.transfer` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `PUT /children/:childId` | `ChildController.updateChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.updateChild` în `apps/api/src/modules/child/child.service.ts` |
| `PUT /children/:childId/family` | `ChildController.moveToFamily` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.moveToFamily` în `apps/api/src/modules/child/child.service.ts` |
| `PUT /enrollments/:id/contract` | `EnrollmentController.recordContract` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.recordContract` în `apps/api/src/modules/enrollment/enrollment.service.ts` |

### `/admin/contracte` — Contracte nesemnate

Pagina: `apps/web/app/pages/admin/contracte/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /enrollments/without-contract` | `EnrollmentController.withoutContract` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.withoutContract` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `PUT /enrollments/:id/contract` | `EnrollmentController.recordContract` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.recordContract` în `apps/api/src/modules/enrollment/enrollment.service.ts` |

### `/admin/dashboard` — Cum stăm

Pagina: `apps/web/app/pages/admin/dashboard.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /overview` | `OverviewController.overview` în `apps/api/src/modules/dashboard/overview.controller.ts` | `OverviewService.build` în `apps/api/src/modules/dashboard/overview.service.ts` |

### `/admin/emailuri` — Șabloane de email

Pagina: `apps/web/app/pages/admin/emailuri/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /mail-templates/:key` | `MailTemplateController.revert` în `apps/api/src/modules/mail/mail-template.controller.ts` | `MailTemplateService.revert` în `apps/api/src/modules/mail/mail-template.service.ts` |
| `GET /mail-templates` | `MailTemplateController.list` în `apps/api/src/modules/mail/mail-template.controller.ts` | `MailTemplateService.list` în `apps/api/src/modules/mail/mail-template.service.ts` |
| `GET /mail-templates/:key` | `MailTemplateController.get` în `apps/api/src/modules/mail/mail-template.controller.ts` | `MailTemplateService.get` în `apps/api/src/modules/mail/mail-template.service.ts` |
| `POST /mail-templates/:key/preview` | `MailTemplateController.preview` în `apps/api/src/modules/mail/mail-template.controller.ts` | `MailTemplateService.preview` în `apps/api/src/modules/mail/mail-template.service.ts` |
| `PUT /mail-templates/:key` | `MailTemplateController.save` în `apps/api/src/modules/mail/mail-template.controller.ts` | `MailTemplateService.save` în `apps/api/src/modules/mail/mail-template.service.ts` |

### `/admin/erori` — Erori

Pagina: `apps/web/app/pages/admin/erori/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /errors` | `ErrorReportController.list` în `apps/api/src/modules/error-report/error-report.controller.ts` | `ErrorReportService.list` în `apps/api/src/modules/error-report/error-report.service.ts` |
| `GET /errors/summary` | `ErrorReportController.summary` în `apps/api/src/modules/error-report/error-report.controller.ts` | `ErrorReportService.summary` în `apps/api/src/modules/error-report/error-report.service.ts` |
| `POST /errors/:id/resolve` | `ErrorReportController.resolve` în `apps/api/src/modules/error-report/error-report.controller.ts` | `ErrorReportService.resolve` în `apps/api/src/modules/error-report/error-report.service.ts` |

### `/admin/formare` — Formarea grupelor

Pagina: `apps/web/app/pages/admin/formare/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /enrollments/demand` | `EnrollmentController.demand` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.unmetDemand` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /enrollments/trials/unresolved` | `EnrollmentController.unresolvedTrials` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.unresolvedTrials` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `PUT /enrollments/:id/resolve-trial` | `EnrollmentController.resolveTrial` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.resolveTrial` în `apps/api/src/modules/enrollment/enrollment.service.ts` |

### `/admin/groups` — Gestionarea Grupelor

Pagina: `apps/web/app/pages/admin/groups/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /reports/occupancy` | `ReportsController.occupancyReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `OccupancyReportService.build` în `apps/api/src/modules/dashboard/occupancy-report.service.ts` |
| `POST /class-sessions/generate` | `ClassSessionController.generateSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.generateSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/admin/groups/:groupId/children` — Gestionează Copii

Pagina: `apps/web/app/pages/admin/groups/[groupId]/children.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /children/:childId/groups/:groupId` | `ChildController.removeChildFromGroup` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.removeChildFromGroup` în `apps/api/src/modules/child/child.service.ts` |
| `DELETE /enrollments/waitlist/:id` | `EnrollmentController.removeFromWaitlist` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.removeFromWaitlist` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /enrollments/group/:groupId/members` | `EnrollmentController.membersOn` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.membersOn` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /enrollments/group/:groupId/occupancy` | `EnrollmentController.occupancy` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.occupancyOf` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /enrollments/waitlist/group/:groupId` | `EnrollmentController.waitlist` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.waitlistFor` în `apps/api/src/modules/enrollment/enrollment.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `POST /children/:childId/groups/:groupId` | `ChildController.assignChildToGroup` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.assignChildToGroup` în `apps/api/src/modules/child/child.service.ts` |
| `POST /enrollments/waitlist` | `EnrollmentController.addToWaitlist` în `apps/api/src/modules/enrollment/enrollment.controller.ts` | `EnrollmentService.addToWaitlist` în `apps/api/src/modules/enrollment/enrollment.service.ts` |

### `/admin/groups/:groupId/edit` — Editează Grup

Pagina: `apps/web/app/pages/admin/groups/[groupId]/edit.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `GET /rooms` | `RoomController.getRooms` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.findRooms` în `apps/api/src/modules/room/room.service.ts` |
| `PUT /groups/:id` | `GroupController.updateGroup` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.updateGroup` în `apps/api/src/modules/group/group.service.ts` |

### `/admin/groups/new` — Adaugă Grup Nou

Pagina: `apps/web/app/pages/admin/groups/new.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `GET /rooms` | `RoomController.getRooms` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.findRooms` în `apps/api/src/modules/room/room.service.ts` |
| `POST /groups` | `GroupController.createGroup` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.createGroup` în `apps/api/src/modules/group/group.service.ts` |

### `/admin/invoices` — Facturi

Pagina: `apps/web/app/pages/admin/invoices/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /invoices/months` | `InvoiceController.issuedMonths` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.issuedMonths` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `GET /reports/finance` | `ReportsController.financeReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `FinanceReportService.build` în `apps/api/src/modules/dashboard/finance-report.service.ts` |

### `/admin/invoices/:invoiceId/pdf` — Factura PDF

Pagina: `apps/web/app/pages/admin/invoices/[invoiceId]/pdf.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /invoices/:id/pdf` | `InvoiceController.getInvoicePdf` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.getInvoicePdf` în `apps/api/src/modules/invoice/invoice.service.ts` |

### `/admin/invoices/:month` — Facturi pe Lună

Pagina: `apps/web/app/pages/admin/invoices/[month].vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /invoices/:id` | `InvoiceController.remove` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.deleteInvoice` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `GET /invoices` | `InvoiceController.findInvoices` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.findInvoices` în `apps/api/src/modules/invoice/invoice.service.ts`, apoi `ArrearsService.withBalances` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `GET /invoices/fiscal-queue` | `InvoiceController.fiscalQueue` în `apps/api/src/modules/invoice/invoice.controller.ts` | `FiscalIssuingService.status` în `apps/api/src/modules/invoice/fiscal-issuing.service.ts` |
| `POST /invoices/:id/fiscal/confirm` | `InvoiceController.confirmFiscal` în `apps/api/src/modules/invoice/invoice.controller.ts` | `FiscalIssuingService.confirmIssued` în `apps/api/src/modules/invoice/fiscal-issuing.service.ts` |
| `POST /invoices/:id/fiscal/retry` | `InvoiceController.retryFiscal` în `apps/api/src/modules/invoice/invoice.controller.ts` | `FiscalIssuingService.retry` în `apps/api/src/modules/invoice/fiscal-issuing.service.ts` |

### `/admin/invoices/emitere` — Emitere facturi

Pagina: `apps/web/app/pages/admin/invoices/emitere.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /invoices/overrides/:monthIssued/:childId` | `InvoiceController.clearOverride` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.clearSessionCountOverride` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `GET /invoices/worksheet` | `InvoiceController.worksheet` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.getWorksheet` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `POST /invoices/issue` | `InvoiceController.issueFromSessions` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.issueFromSessions` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `PUT /invoices/overrides` | `InvoiceController.setOverride` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.setSessionCountOverride` în `apps/api/src/modules/invoice/invoice.service.ts` |

### `/admin/leads` — Cereri și probe

Pagina: `apps/web/app/pages/admin/leads/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /leads` | `LeadController.list` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.list` în `apps/api/src/modules/lead/lead.service.ts` |
| `GET /leads/follow-up` | `LeadController.followUp` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.followUp` în `apps/api/src/modules/lead/lead.service.ts` |
| `PATCH /leads/:id` | `LeadController.update` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.update` în `apps/api/src/modules/lead/lead.service.ts` |
| `POST /leads` | `LeadController.create` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.create` în `apps/api/src/modules/lead/lead.service.ts` |
| `POST /leads/:id/contacted` | `LeadController.markContacted` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.markContacted` în `apps/api/src/modules/lead/lead.service.ts` |
| `POST /leads/:id/lost` | `LeadController.markLost` în `apps/api/src/modules/lead/lead.controller.ts` | `LeadService.markLost` în `apps/api/src/modules/lead/lead.service.ts` |

### `/admin/livrari` — Livrări

Pagina: `apps/web/app/pages/admin/livrari/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /deliveries` | `DeliveryLogController.list` în `apps/api/src/modules/mail/delivery-log.controller.ts` | `DeliveryLogService.list` în `apps/api/src/modules/mail/delivery-log.service.ts` |
| `GET /deliveries/summary` | `DeliveryLogController.summary` în `apps/api/src/modules/mail/delivery-log.controller.ts` | `DeliveryLogService.summary` în `apps/api/src/modules/mail/delivery-log.service.ts` |

### `/admin/locations` — Locații și săli

Pagina: `apps/web/app/pages/admin/locations/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /locations/:id` | `LocationController.deleteLocation` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.deleteLocation` în `apps/api/src/modules/location/location.service.ts` |
| `DELETE /rooms/:id` | `RoomController.deleteRoom` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.deleteRoom` în `apps/api/src/modules/room/room.service.ts` |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `GET /rooms` | `RoomController.getRooms` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.findRooms` în `apps/api/src/modules/room/room.service.ts` |
| `POST /rooms` | `RoomController.createRoom` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.createRoom` în `apps/api/src/modules/room/room.service.ts` |
| `PUT /rooms/:id` | `RoomController.updateRoom` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.updateRoom` în `apps/api/src/modules/room/room.service.ts` |

### `/admin/locations/:locationId/edit` — Editează locația

Pagina: `apps/web/app/pages/admin/locations/[locationId]/edit.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /locations` | `LocationController.getLocations` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.findLocations` în `apps/api/src/modules/location/location.service.ts` |
| `PUT /locations/:id` | `LocationController.updateLocation` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.updateLocation` în `apps/api/src/modules/location/location.service.ts` |

### `/admin/locations/new` — Adaugă locație

Pagina: `apps/web/app/pages/admin/locations/new.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /locations` | `LocationController.createLocation` în `apps/api/src/modules/location/location.controller.ts` | `LocationService.createLocation` în `apps/api/src/modules/location/location.service.ts` |

### `/admin/orar` — Orarul

Pagina: `apps/web/app/pages/admin/orar/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `GET /class-sessions/reschedule-windows` | `ClassSessionController.rescheduleWindows` în `apps/api/src/modules/class-session/class-session.controller.ts` | `RescheduleService.windowsFor` în `apps/api/src/modules/class-session/reschedule.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /rooms` | `RoomController.getRooms` în `apps/api/src/modules/room/room.controller.ts` | `RoomService.findRooms` în `apps/api/src/modules/room/room.service.ts` |
| `POST /class-sessions/reschedule` | `ClassSessionController.rescheduleSession` în `apps/api/src/modules/class-session/class-session.controller.ts` | `RescheduleService.reschedule` în `apps/api/src/modules/class-session/reschedule.service.ts` |
| `PUT /class-sessions/:id/cancel` | `ClassSessionController.cancelSession` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.cancelSession` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `PUT /class-sessions/:id/move` | `ClassSessionController.moveSession` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.moveSession` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `PUT /class-sessions/:id/reinstate` | `ClassSessionController.reinstateSession` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.reinstateSession` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `PUT /class-sessions/:id/vacation` | `ClassSessionController.setVacation` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.setVacation` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/admin/payments` — Gestionarea Plăților

Pagina: `apps/web/app/pages/admin/payments/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /payments/:id` | `PaymentController.deletePayment` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.deletePayment` în `apps/api/src/modules/payment/payment.service.ts` |
| `GET /payments` | `PaymentController.findPayments` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.findPayments` în `apps/api/src/modules/payment/payment.service.ts` |
| `GET /payments/fiscal-queue` | `PaymentController.fiscalQueue` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentFiscalService.status` în `apps/api/src/modules/payment/payment-fiscal.service.ts` |
| `POST /payments/:id/fiscal/confirm` | `PaymentController.confirmFiscal` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentFiscalService.confirmRecorded` în `apps/api/src/modules/payment/payment-fiscal.service.ts` |
| `POST /payments/:id/fiscal/retry` | `PaymentController.retryFiscal` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentFiscalService.retry` în `apps/api/src/modules/payment/payment-fiscal.service.ts` |
| `PUT /payments/:id` | `PaymentController.updatePayment` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.updatePayment` în `apps/api/src/modules/payment/payment.service.ts` |

### `/admin/payments/new` — Încasează

Pagina: `apps/web/app/pages/admin/payments/new.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /invoices/arrears` | `InvoiceController.arrears` în `apps/api/src/modules/invoice/invoice.controller.ts` | `ArrearsService.list` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `POST /payments` | `PaymentController.createPayment` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.createPayment` în `apps/api/src/modules/payment/payment.service.ts` |

### `/admin/profiles` — Profiluri de Utilizatori

Pagina: `apps/web/app/pages/admin/profiles/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |

### `/admin/profiles/:profileId` — Profil

Pagina: `apps/web/app/pages/admin/profiles/[profileId]/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /discounts/referral/:parentId` | `DiscountController.revokeReferral` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.revokeReferralMonth` în `apps/api/src/modules/discount/discount.service.ts` |
| `DELETE /privacy/consents/:childId/:purpose` | `ConsentController.revoke` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.revoke` în `apps/api/src/modules/privacy/publication-consent.service.ts` |
| `DELETE /privacy/erasure/:profileId/request` | `PrivacyController.withdrawErasureForFamily` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.withdrawRequest` în `apps/api/src/modules/privacy/erasure.service.ts` |
| `DELETE /privacy/retention/:profileId` | `PrivacyController.reinstate` în `apps/api/src/modules/privacy/privacy.controller.ts` | `RetentionService.reinstate` în `apps/api/src/modules/privacy/retention.service.ts` |
| `GET /discounts/referral/:parentId` | `DiscountController.readReferral` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.referralReward` în `apps/api/src/modules/discount/discount.service.ts` |
| `GET /privacy/consents/profile/:profileId` | `ConsentController.familyConsents` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.forProfile` în `apps/api/src/modules/privacy/publication-consent.service.ts` |
| `GET /privacy/export/:profileId` | `PrivacyController.exportFor` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ExportService.forProfile` în `apps/api/src/modules/privacy/export.service.ts` |
| `GET /privacy/retention/:profileId` | `PrivacyController.familyRetention` în `apps/api/src/modules/privacy/privacy.controller.ts` | `RetentionService.forFamily` în `apps/api/src/modules/privacy/retention.service.ts` |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /discounts/referral` | `DiscountController.grantReferral` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.grantReferralMonth` în `apps/api/src/modules/discount/discount.service.ts` |
| `POST /privacy/erasure/:profileId/request` | `PrivacyController.recordErasureRequest` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.request` în `apps/api/src/modules/privacy/erasure.service.ts` |
| `POST /privacy/retention/:profileId` | `PrivacyController.withdraw` în `apps/api/src/modules/privacy/privacy.controller.ts` | `RetentionService.withdraw` în `apps/api/src/modules/privacy/retention.service.ts` |
| `POST /profiles/:profileId/account-claim` | `ProfileController.sendAccountClaim` în `apps/api/src/modules/profile/profile.controller.ts` | `AccountClaimService.sendForProfile` în `apps/api/src/modules/auth/account-claim.service.ts` |
| `POST /users/:id/approve` | `UserController.approveAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountApprovalService.approve` în `apps/api/src/modules/user/account-approval.service.ts` |
| `POST /users/:id/reactivate` | `UserController.reactivateAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountSuspensionService.reactivate` în `apps/api/src/modules/user/account-suspension.service.ts` |
| `POST /users/:id/suspend` | `UserController.suspendAccount` în `apps/api/src/modules/user/user.controller.ts` | `AccountSuspensionService.suspend` în `apps/api/src/modules/user/account-suspension.service.ts` |
| `PUT /privacy/consents/:childId/:purpose` | `ConsentController.grant` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.grant` în `apps/api/src/modules/privacy/publication-consent.service.ts` |

### `/admin/profiles/:profileId/children/new` — Adaugă copil

Pagina: `apps/web/app/pages/admin/profiles/[profileId]/children/new.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /children` | `ChildController.createChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.createChild` în `apps/api/src/modules/child/child.service.ts` |

### `/admin/profiles/:profileId/confirmation` — Confirmare Ștergere Profil

Pagina: `apps/web/app/pages/admin/profiles/[profileId]/confirmation.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /profiles/:profileId` | `ProfileController.deleteProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.deleteProfile` în `apps/api/src/modules/profile/profile.service.ts` |

### `/admin/profiles/:profileId/edit` — Editează Profil

Pagina: `apps/web/app/pages/admin/profiles/[profileId]/edit.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `PUT /profiles/:profileId` | `ProfileController.updateProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.updateProfile` în `apps/api/src/modules/profile/profile.service.ts` |

### `/admin/profiles/new` — Adaugă Profil Nou

Pagina: `apps/web/app/pages/admin/profiles/new.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /users/without-profile` | `UserController.getUsersWithoutProfile` în `apps/api/src/modules/user/user.controller.ts` | `UserService.getUsersWithoutProfile` în `apps/api/src/modules/user/user.service.ts` |
| `POST /profiles` | `ProfileController.createProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.createProfile` în `apps/api/src/modules/profile/profile.service.ts` |

### `/admin/proiecte` — Proiectele elevilor

Pagina: `apps/web/app/pages/admin/proiecte/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /agent/status` | `AgentController.statuses` în `apps/api/src/modules/project/agent.controller.ts` | `AgentService.statuses` în `apps/api/src/modules/project/agent.service.ts` |
| `GET /agent/unassigned` | `AgentController.findUnassigned` în `apps/api/src/modules/project/agent.controller.ts` | `AgentService.findUnassigned` în `apps/api/src/modules/project/agent.service.ts` |
| `GET /groups` | `GroupController.getGroups` în `apps/api/src/modules/group/group.controller.ts` | `GroupService.getGroups` în `apps/api/src/modules/group/group.service.ts` |
| `GET /projects/pending` | `ProjectController.pending` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.pendingSummary` în `apps/api/src/modules/project/project.service.ts` |
| `PUT /agent/unassigned/:id/resolve` | `AgentController.resolveUnassigned` în `apps/api/src/modules/project/agent.controller.ts` | `AgentService.resolveUnassigned` în `apps/api/src/modules/project/agent.service.ts` |

### `/admin/proiecte/grupa/:groupId` — Proiectele grupei

Pagina: `apps/web/app/pages/admin/proiecte/grupa/[groupId].vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /projects/:id` | `ProjectController.deleteProject` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.deleteProject` în `apps/api/src/modules/project/project.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /projects` | `ProjectController.findProjects` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.findProjects` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/:id/thumbnail` | `ProjectController.thumbnail` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.thumbnail` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/group/:groupId/missing` | `ProjectController.childrenWithoutProjects` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.childrenWithoutProjects` în `apps/api/src/modules/project/project.service.ts` |
| `POST /projects/send` | `ProjectController.send` în `apps/api/src/modules/project/project.controller.ts` | `ProjectDeliveryService.send` în `apps/api/src/modules/project/project-delivery.service.ts` |
| `PUT /projects/:id/reassign` | `ProjectController.reassign` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.reassign` în `apps/api/src/modules/project/project.service.ts` |

### `/admin/rapoarte` — Rapoarte

Pagina: `apps/web/app/pages/admin/rapoarte/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /reports/finance` | `ReportsController.financeReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `FinanceReportService.build` în `apps/api/src/modules/dashboard/finance-report.service.ts` |
| `GET /reports/funnel` | `ReportsController.funnelReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `LeadFunnelService.funnel` în `apps/api/src/modules/lead/lead-funnel.service.ts` |
| `GET /reports/occupancy` | `ReportsController.occupancyReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `OccupancyReportService.build` în `apps/api/src/modules/dashboard/occupancy-report.service.ts` |
| `GET /reports/signals` | `ReportsController.signalsReport` în `apps/api/src/modules/dashboard/reports.controller.ts` | `EarlySignalsService.build` în `apps/api/src/modules/dashboard/early-signals.service.ts` |

### `/admin/reconciliere` — Reconciliere

Pagina: `apps/web/app/pages/admin/reconciliere/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /invoices/arrears` | `InvoiceController.arrears` în `apps/api/src/modules/invoice/invoice.controller.ts` | `ArrearsService.list` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `GET /invoices/fiscal-divergences` | `InvoiceController.fiscalDivergences` în `apps/api/src/modules/invoice/invoice.controller.ts` | `FiscalDivergenceService.report` în `apps/api/src/modules/invoice/fiscal-divergence.service.ts` |
| `GET /reconciliation/lines` | `ReconciliationController.lines` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.lines` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| `POST /invoices/fiscal-divergences/refresh` | `InvoiceController.refreshFiscalDivergences` în `apps/api/src/modules/invoice/invoice.controller.ts` | `FiscalDivergenceService.markAllDue` în `apps/api/src/modules/invoice/fiscal-divergence.service.ts` |
| `POST /reconciliation/lines/:id/ignore` | `ReconciliationController.ignore` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.ignore` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| `POST /reconciliation/lines/:id/match` | `ReconciliationController.match` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.match` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| `POST /reconciliation/lines/:id/reopen` | `ReconciliationController.reopen` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.reopen` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| `POST /reconciliation/lines/confirm-suggested` | `ReconciliationController.confirmSuggested` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.confirmSure` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |
| `POST /reconciliation/statements` | `ReconciliationController.importStatement` în `apps/api/src/modules/reconciliation/reconciliation.controller.ts` | `ReconciliationService.importStatement` în `apps/api/src/modules/reconciliation/reconciliation.service.ts` |

### `/admin/reduceri` — Reduceri

Pagina: `apps/web/app/pages/admin/reduceri/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /discounts/:id` | `DiscountController.deleteDiscount` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.deleteDiscount` în `apps/api/src/modules/discount/discount.service.ts` |
| `GET /discounts` | `DiscountController.findDiscounts` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.findDiscounts` în `apps/api/src/modules/discount/discount.service.ts` |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /discounts` | `DiscountController.createDiscount` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.createDiscount` în `apps/api/src/modules/discount/discount.service.ts` |
| `PUT /discounts/:id` | `DiscountController.updateDiscount` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.updateDiscount` în `apps/api/src/modules/discount/discount.service.ts` |

### `/admin/restante` — Restanțe

Pagina: `apps/web/app/pages/admin/restante/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /invoices/arrears` | `InvoiceController.arrears` în `apps/api/src/modules/invoice/invoice.controller.ts` | `ArrearsService.list` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `POST /payments` | `PaymentController.createPayment` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.createPayment` în `apps/api/src/modules/payment/payment.service.ts` |

### `/admin/sistem` — Starea platformei

Pagina: `apps/web/app/pages/admin/sistem/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /system/status` | `SystemStatusController.status` în `apps/api/src/modules/health/system-status.controller.ts` | `SystemStatusService.read` în `apps/api/src/modules/health/system-status.service.ts` |

### `/admin/stergeri` — Cereri de ștergere

Pagina: `apps/web/app/pages/admin/stergeri/index.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /privacy/erasure/pending` | `PrivacyController.pendingErasures` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.pending` în `apps/api/src/modules/privacy/erasure.service.ts` |
| `GET /privacy/retention` | `PrivacyController.retention` în `apps/api/src/modules/privacy/privacy.controller.ts` | `RetentionService.overview` în `apps/api/src/modules/privacy/retention.service.ts` |
| `POST /privacy/erasure/:profileId` | `PrivacyController.erase` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.erase` în `apps/api/src/modules/privacy/erasure.service.ts` |

## Portalul părintelui

### `/user/absente` — Absențe și recuperări

Pagina: `apps/web/app/pages/user/absente.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/absences` | `AttendanceController.upcomingAbsences` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AbsenceNoticeService.upcoming` în `apps/api/src/modules/attendance/absence-notice.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/user/dashboard` — Acasă

Pagina: `apps/web/app/pages/user/dashboard.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/absences` | `AttendanceController.upcomingAbsences` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AbsenceNoticeService.upcoming` în `apps/api/src/modules/attendance/absence-notice.service.ts` |
| `GET /attendance/child/:childId` | `AttendanceController.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |
| `GET /invoices` | `InvoiceController.findInvoices` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.findInvoices` în `apps/api/src/modules/invoice/invoice.service.ts`, apoi `ArrearsService.withBalances` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `GET /projects` | `ProjectController.findProjects` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.findProjects` în `apps/api/src/modules/project/project.service.ts` |
| `POST /auth/resend-confirmation` | `AuthController.resendConfirmation` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.resendConfirmation` în `apps/api/src/modules/auth/auth.service.ts` |

### `/user/payments` — Plăți și facturi

Pagina: `apps/web/app/pages/user/payments.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /discounts/family` | `DiscountController.familyDiscounts` în `apps/api/src/modules/discount/discount.controller.ts` | `DiscountService.familyDiscounts` în `apps/api/src/modules/discount/discount.service.ts` |
| `GET /invoices` | `InvoiceController.findInvoices` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.findInvoices` în `apps/api/src/modules/invoice/invoice.service.ts`, apoi `ArrearsService.withBalances` în `apps/api/src/modules/invoice/arrears.service.ts` |
| `GET /invoices/:id/pdf` | `InvoiceController.getInvoicePdf` în `apps/api/src/modules/invoice/invoice.controller.ts` | `InvoiceService.getInvoicePdf` în `apps/api/src/modules/invoice/invoice.service.ts` |
| `GET /invoices/payment-details` | `InvoiceController.paymentDetails` în `apps/api/src/modules/invoice/invoice.controller.ts` | — |
| `GET /payments` | `PaymentController.findPayments` în `apps/api/src/modules/payment/payment.controller.ts` | `PaymentService.findPayments` în `apps/api/src/modules/payment/payment.service.ts` |

### `/user/prezenta` — Prezența

Pagina: `apps/web/app/pages/user/prezenta.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /attendance/child/:childId` | `AttendanceController.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.controller.ts` | `AttendanceService.getAttendanceByChild` în `apps/api/src/modules/attendance/attendance.service.ts` |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /class-sessions` | `ClassSessionController.getSessions` în `apps/api/src/modules/class-session/class-session.controller.ts` | `ClassSessionService.findSessions` în `apps/api/src/modules/class-session/class-session.service.ts` |

### `/user/profile` — Profil

Pagina: `apps/web/app/pages/user/profile.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `DELETE /auth/sessions/:id` | `AuthController.closeSession` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.closeSession` în `apps/api/src/modules/auth/auth.service.ts` |
| `DELETE /children/:childId` | `ChildController.deleteChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.deleteChild` în `apps/api/src/modules/child/child.service.ts` |
| `DELETE /privacy/consents/:childId/:purpose` | `ConsentController.revoke` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.revoke` în `apps/api/src/modules/privacy/publication-consent.service.ts` |
| `DELETE /privacy/erasure` | `PrivacyController.withdrawErasure` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.withdrawRequest` în `apps/api/src/modules/privacy/erasure.service.ts` |
| `GET /auth/documents` | `AuthController.legalRecord` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.legalRecord` în `apps/api/src/modules/auth/auth.service.ts` |
| `GET /privacy/consents` | `ConsentController.ownConsents` în `apps/api/src/modules/privacy/consent.controller.ts` | `Repository<Profile>.findOne`, apoi `PublicationConsentService.forProfile` în `apps/api/src/modules/privacy/publication-consent.service.ts` |
| `GET /privacy/export` | `PrivacyController.exportOwn` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ExportService.forProfile` în `apps/api/src/modules/privacy/export.service.ts` |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /auth/change-password` | `AuthController.changePassword` în `apps/api/src/modules/auth/auth.controller.ts` | `PasswordResetService.change` în `apps/api/src/modules/auth/password-reset.service.ts` |
| `POST /auth/logout` | `AuthController.logout` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.logout` în `apps/api/src/modules/auth/auth.service.ts` |
| `POST /auth/logout-all` | `AuthController.logoutEverywhere` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.logoutEverywhere` în `apps/api/src/modules/auth/auth.service.ts` |
| `POST /auth/sessions` | `AuthController.sessionsWithCurrent` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.listSessions` în `apps/api/src/modules/auth/auth.service.ts` |
| `POST /children` | `ChildController.createChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.createChild` în `apps/api/src/modules/child/child.service.ts` |
| `POST /privacy/erasure` | `PrivacyController.requestErasure` în `apps/api/src/modules/privacy/privacy.controller.ts` | `ErasureService.request` în `apps/api/src/modules/privacy/erasure.service.ts` |
| `PUT /children/:childId` | `ChildController.updateChild` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.updateChild` în `apps/api/src/modules/child/child.service.ts` |
| `PUT /privacy/consents/:childId/:purpose` | `ConsentController.grant` în `apps/api/src/modules/privacy/consent.controller.ts` | `PublicationConsentService.grant` în `apps/api/src/modules/privacy/publication-consent.service.ts` |
| `PUT /profiles/:profileId` | `ProfileController.updateProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.updateProfile` în `apps/api/src/modules/profile/profile.service.ts` |

### `/user/profile-setup` — Completează profilul

Pagina: `apps/web/app/pages/user/profile-setup.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /auth/me` | `AuthController.getProfile` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.getUserProfile` în `apps/api/src/modules/auth/auth.service.ts` |
| `GET /profiles` | `ProfileController.findProfiles` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.findProfiles` în `apps/api/src/modules/profile/profile.service.ts` |
| `POST /profiles` | `ProfileController.createProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.createProfile` în `apps/api/src/modules/profile/profile.service.ts` |
| `PUT /profiles/:profileId` | `ProfileController.updateProfile` în `apps/api/src/modules/profile/profile.controller.ts` | `ProfileService.updateProfile` în `apps/api/src/modules/profile/profile.service.ts` |

### `/user/proiecte` — Proiectele copiilor

Pagina: `apps/web/app/pages/user/proiecte.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /children` | `ChildController.findChildren` în `apps/api/src/modules/child/child.controller.ts` | `ChildService.findChildren` în `apps/api/src/modules/child/child.service.ts` |
| `GET /projects` | `ProjectController.findProjects` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.findProjects` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/:id/files/:fileId` | `ProjectController.fileDownload` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.fileDownloadUrl` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/:id/thumbnail` | `ProjectController.thumbnail` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.thumbnail` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/child/:childId/archive` | `ProjectController.archive` în `apps/api/src/modules/project/project.controller.ts` | `ProjectArchiveService.forChild` în `apps/api/src/modules/project/project-archive.service.ts` |

### `/user/termeni-noi` — Am schimbat termenii

Pagina: `apps/web/app/pages/user/termeni-noi.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/accept-documents` | `AuthController.acceptDocuments` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.acceptDocuments` în `apps/api/src/modules/auth/auth.service.ts` |

## Autentificare și cont

### `/auth/confirm-email` — Confirmare email

Pagina: `apps/web/app/pages/auth/confirm-email.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /auth/me` | `AuthController.getProfile` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.getUserProfile` în `apps/api/src/modules/auth/auth.service.ts` |
| `POST /auth/confirm-email` | `AuthController.confirmEmail` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.confirmEmail` în `apps/api/src/modules/auth/auth.service.ts` |

### `/auth/cont-familie` — Termină-ți contul

Pagina: `apps/web/app/pages/auth/cont-familie.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/claim` | `AuthController.claim` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.claimAccount` în `apps/api/src/modules/auth/auth.service.ts` |

### `/auth/forgot-password` — Resetare parolă

Pagina: `apps/web/app/pages/auth/forgot-password.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/forgot-password` | `AuthController.forgotPassword` în `apps/api/src/modules/auth/auth.controller.ts` | `PasswordResetService.request` în `apps/api/src/modules/auth/password-reset.service.ts` |

### `/auth/login` — Autentificare

Pagina: `apps/web/app/pages/auth/login.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/login` | `AuthController.login` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.login` în `apps/api/src/modules/auth/auth.service.ts` |

### `/auth/register` — Înregistrare

Pagina: `apps/web/app/pages/auth/register.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/register` | `AuthController.register` în `apps/api/src/modules/auth/auth.controller.ts` | `AuthService.register` în `apps/api/src/modules/auth/auth.service.ts` |

### `/auth/reset-password` — Alege o parolă nouă

Pagina: `apps/web/app/pages/auth/reset-password.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /auth/reset-password` | `AuthController.resetPassword` în `apps/api/src/modules/auth/auth.controller.ts` | `PasswordResetService.reset` în `apps/api/src/modules/auth/password-reset.service.ts` |

## Site-ul public și paginile fără cont

### `/` — Acasă

Pagina: `apps/web/app/pages/index.vue`

Nu face nicio cerere către API.

### `/acord-lucrari` — Acordul pentru lucrările copilului

Pagina: `apps/web/app/pages/acord-lucrari.vue`

Nu face nicio cerere către API.

### `/confidentialitate` — Politica de confidențialitate

Pagina: `apps/web/app/pages/confidentialitate.vue`

Nu face nicio cerere către API.

### `/contact` — Contact

Pagina: `apps/web/app/pages/contact.vue`

Nu face nicio cerere către API.

### `/cookies` — Politica de cookie-uri

Pagina: `apps/web/app/pages/cookies.vue`

Nu face nicio cerere către API.

### `/cursuri` — Cursuri

Pagina: `apps/web/app/pages/cursuri/index.vue`

Nu face nicio cerere către API.

### `/cursuri/bac-informatica`

Pagina: `apps/web/app/pages/cursuri/bac-informatica.vue`

Nu face nicio cerere către API.

### `/cursuri/canva`

Pagina: `apps/web/app/pages/cursuri/canva.vue`

Nu face nicio cerere către API.

### `/cursuri/cpp`

Pagina: `apps/web/app/pages/cursuri/cpp.vue`

Nu face nicio cerere către API.

### `/cursuri/office`

Pagina: `apps/web/app/pages/cursuri/office.vue`

Nu face nicio cerere către API.

### `/cursuri/scratch`

Pagina: `apps/web/app/pages/cursuri/scratch.vue`

Nu face nicio cerere către API.

### `/cursuri/tinkercad`

Pagina: `apps/web/app/pages/cursuri/tinkercad.vue`

Nu face nicio cerere către API.

### `/despre-noi` — Despre noi

Pagina: `apps/web/app/pages/despre-noi.vue`

Nu face nicio cerere către API.

### `/dezabonare` — Dezabonare — IT Bridge School

Pagina: `apps/web/app/pages/dezabonare.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `POST /marketing/unsubscribe` | `UnsubscribeController.unsubscribe` în `apps/api/src/modules/mail/unsubscribe.controller.ts` | `UnsubscribeService.unsubscribe` în `apps/api/src/modules/mail/unsubscribe.service.ts` |

### `/files/:publicId` — Lucrarea copilului

Pagina: `apps/web/app/pages/files/[publicId].vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /projects/:id/files/:fileId` | `ProjectController.fileDownload` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.fileDownloadUrl` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/:id/thumbnail` | `ProjectController.thumbnail` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.thumbnail` în `apps/api/src/modules/project/project.service.ts` |
| `GET /projects/link/:publicId` | `ProjectController.findByPublicId` în `apps/api/src/modules/project/project.controller.ts` | `ProjectService.findByPublicId` în `apps/api/src/modules/project/project.service.ts` |
| `POST /projects/link/:publicId/report` | `ProjectController.reportProject` în `apps/api/src/modules/project/project.controller.ts` | `ProjectDeliveryService.report` în `apps/api/src/modules/project/project-delivery.service.ts` |

### `/locatii`

Pagina: `apps/web/app/pages/locatii/index.vue`

Nu face nicio cerere către API.

### `/locatii/drumul-taberei`

Pagina: `apps/web/app/pages/locatii/drumul-taberei.vue`

Nu face nicio cerere către API.

### `/locatii/straulesti`

Pagina: `apps/web/app/pages/locatii/straulesti.vue`

Nu face nicio cerere către API.

### `/proba` — Lecție de probă

Pagina: `apps/web/app/pages/proba.vue`

| Cerere | Răspunde | Serviciile |
| --- | --- | --- |
| `GET /trial/slots` | `TrialController.slots` în `apps/api/src/modules/lead/trial.controller.ts` | `TrialBookingService.slots` în `apps/api/src/modules/lead/trial-booking.service.ts` |
| `POST /trial/bookings` | `TrialController.book` în `apps/api/src/modules/lead/trial.controller.ts` | `TrialBookingService.book` în `apps/api/src/modules/lead/trial-booking.service.ts` |

### `/termeni` — Termeni și condiții

Pagina: `apps/web/app/pages/termeni.vue`

Nu face nicio cerere către API.

### `/versiuni/:doc/:versiune`

Pagina: `apps/web/app/pages/versiuni/[doc]/[versiune].vue`

Nu face nicio cerere către API.

## Rute pe care nu le cheamă niciun ecran

Unele au alt client — agentul din birou, un job, un link din email —, altele sunt drumuri vechi
păstrate pe server. Nu sunt neapărat de șters; sunt locul în care nu caută nimeni când se strică ceva
pe un ecran.

- `DELETE /groups/:id` — `GroupController.deleteGroup`
- `DELETE /users/:id` — `UserController.deleteUser`
- `GET /agent/mirror` — `AgentController.mirror`
- `GET /announcements/:id` — `AnnouncementController.findOne`
- `GET /audit` — `AuditController.find`
- `GET /auth/sessions` — `AuthController.sessions`
- `GET /groups/:id` — `GroupController.getGroupById`
- `GET /health` — `HealthController.health`
- `GET /invoices/:id` — `InvoiceController.findOne`
- `GET /leads/:id` — `LeadController.findOne`
- `GET /leads/undecided` — `LeadController.undecided`
- `GET /locations/:id` — `LocationController.getLocationById`
- `GET /payments/:id` — `PaymentController.findOne`
- `GET /ready` — `HealthController.ready`
- `GET /rooms/:id` — `RoomController.getRoomById`
- `GET /users` — `UserController.getAllUsers`
- `GET /users/:id` — `UserController.getUserById`
- `PATCH /attendance/:attendanceId` — `AttendanceController.updateAttendance`
- `POST /agent/heartbeat` — `AgentController.heartbeat`
- `POST /agent/unassigned` — `AgentController.reportUnassigned`
- `POST /enrollments` — `EnrollmentController.enrol`
- `POST /invoices` — `InvoiceController.createInvoice`
- `POST /invoices/preview` — `InvoiceController.previewInvoicePdf`
- `POST /projects` — `ProjectController.createProject`
- `POST /projects/files/:fileId/complete` — `ProjectController.completeUpload`
- `POST /projects/ingest` — `ProjectController.ingest`
- `POST /projects/uploads/register` — `ProjectController.registerLargeFile`
- `PUT /enrollments/:id/close` — `EnrollmentController.close`
- `PUT /invoices/:id` — `InvoiceController.update`
- `PUT /users/:id` — `UserController.updateUser`
