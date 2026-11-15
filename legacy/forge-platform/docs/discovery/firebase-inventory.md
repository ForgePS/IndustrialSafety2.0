# Firebase Inventory

**Sprint:** 1A  
**Date:** 2026-07-25

## 1. Firebase projects

| Alias / default | Project ID            | Used by                           |
| --------------- | --------------------- | --------------------------------- |
| Academy default | `forge-academy-95f84` | `forge-academy-backup`            |
| RMS default     | `rms-dashboard-7562e` | `forge-rms`, `firebase-app`       |
| RMS alias       | `horn-lake-fire-app`  | `firebase-app` `.firebaserc` only |

Regions observed: Functions `us-central1`.

## 2. Authentication

### Academy

- Firebase Auth email/password (`signInWithEmailAndPassword`, password reset).
- Profile document `users/{uid}` required after auth (missing profile → sign-out except bootstrap).
- Roles on user doc: `student`, `department_training_officer`, `instructor`, `academy_admin`, `certification_officer`, `super_admin`, `creator`.
- Link fields: `studentId`, `departmentId`, `instructorId`, `academyId`.
- No Cognito today.

### RMS

- Firebase Auth email/password.
- Department membership: `departments/{departmentId}/users/{uid}` with `status == "active"`.
- Platform creators: `platformCreators/{uid}` or bootstrap emails in rules:
  - `admin@forgepublicsafety.com`
  - `jpowell@hornlake.org`
  - `jeremyepowell@hotmail.com`
- Horn Lake org email shortcut: `*@hornlake.org` → `horn-lake-fd`.
- Demo department: `forge-demo`.
- Application RBAC: `departments/{id}/roles/{roleId}` + permission maps (`src/lib/permissions.js`, `src/data/defaultRoles.js`). Creator gets `CREATOR_PERMISSIONS`.
- Sensitive personnel views gated by permissions such as `canViewPersonnelPrivateInfo`.

## 3. Firestore — Academy (`forge-academy-95f84`)

Evidence: `firestore.rules`, `src/lib`, `functions/lib`, migration/signage collection helpers.

### Core academic / identity

`users`, `departments`, `students`, `courses`, `classes`, `registrations`, `attendanceDays`, `instructors`, `instructorCertifications`, `instructorAvailability`, `instructorAssignments`, `instructorEvaluations`, `completions`

### Certificates / skills / certifications

`certificates`, `certificateTemplates`, `certificateCounters`, `publicCertificateLookup`, `skillTemplates`, `skills`, `skillStations`, `evaluatorAssignments`, `skillEvaluations`, `certificationTypes`, `studentCertifications`, `certificationAuditLog`

### Testing

`questionBanks`, `testCategories`, `questionPools`, `testQuestions`, `testBlueprints`, `tests`, `testEligibility`, `testingWindows`, `testingRooms`, `testingSeats`, `proctorAssignments`, `testAccommodations`, `testVersions`, `testAssignments`, `testSessions`, `testEvents`, `proctorEvents`, `testAttempts`, `testResults`, `manualGradingQueue`, `questionAnalytics`, `examReviewQueue`, `retestRequests`, `remediationAssignments`, `certificateReleaseQueue`, `certificateApprovals`, `scoreOverrides`, `stateCertificationTests`, `challengeTestRequests`, `transcriptEntries`, `courseCompletions`

### Finance / housing / reporting

`invoices`, `invoiceCounters`, `invoiceSettings`, `rooms`, `roomAssignments`, `housingRosters`, `housingSettings`, `housingAuditLog`, `scheduledReportExports`

### LMS / RMS / Hub

`lmsIntegrationSettings`, `lmsCompletions`, `lmsGradePassbackLog`, `rmsIntegrationSettings`, `rmsRosterSyncLog`, `rmsTrainingSyncLog`, `hubIdentities`, `hubConnections`, `hubEvents`, `hubSyncState`, `hubDuplicateReviews`, `hubIdentityMerges`, `hubFemaSidCorrections`, `hubSyncFailures`, `hubAuditLogs`, `hubReconcileReports`

### Platform / communications

`systemSettings`, `platformConfig`, `platformAcademies`, `platformSubscriptionPlans`, `platformSubscriptions`, `staffConversations` (+ `messages` subcollection), `notifications`, `calendarEvents`, `portalAnnouncements`, `auditLogs`, `mail`, `emailOutbox`

### Digital Dashboard

`digitalDashboardMedia`, `digitalDashboardPlaylists` (+ `versions`), `digitalDashboardDisplays`, `digitalDashboardSchedules`, `digitalDashboardGroups`, `digitalDashboardLayouts` (+ `versions`), `digitalDashboardAlerts`, `digitalDashboardDiningMenus`, `digitalDashboardMediaFolders`, `digitalDashboardRssFeeds`, `digitalDashboardBrandKits`, `digitalDashboardApprovals`, `digitalDashboardPublications`, `digitalDashboardManifests`, `digitalDashboardDeviceCommands`, `digitalDashboardDataSources`, `digitalDashboardTrash`, `digitalDashboardAuditLogs`, `digitalDashboardAnalyticsDaily`, `digitalDashboardProofEvents` (+ `events`), `digitalDashboardReusableComponents`, `digitalDashboardEmergencyTemplates`, `digitalDashboardSettings`

### Migration

`migrationProjects` with subcollections: `sourceSystems`, `sourceFiles`, `moduleConfigs`, `mappingTemplates`, `mappingVersions`, `lookupTables`, `validationRules`, `rawPartitions` (+ `records`), `stagingPartitions` (+ `records`), `identityCandidates`, `relationshipIssues`, `dryRuns`, `importPlans`, `importRuns`, `importBatches`, `resultPartitions`, `attachmentJobs`, `reconciliationReports`, `rollbackPlans`, `errors`, `approvals`, `auditLogs`, `jobs`  
Also: `migrationSourceLinks`, `migrationSettings`

## 4. Firestore — RMS (`rms-dashboard-7562e`)

### Platform top-level (`forge-rms` firestore.rules)

`platformCreators`, `platformDepartments`, `platformConfig`, `platformSubscriptionPlans`, `platformSubscriptions`, `codePublications`, `codeNodes`, `codeImportBatches`, `departmentCodeLibraryAccess`, `rmsGateways`, `appData`, `rmsData`, `integrationSettings`, `academyTrainingSyncLog`, `hydrantDamageAckTokens`, `preFirePlans`, `hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests`

Public-readable reference collections (rules allow list): `emsProtocolsFull`, `fireSogsFull`, `fireSogDetails`, `fireCodesFull`, `fireCodeIndexFull`, `fireCodePdfSections`, `fireCodeDocxSections`, `hoseInventory`

### Department tree `departments/{departmentId}/…`

**Identity / config:** `public`, `profile`, `settings`, `lists/{listKey}`, `users`, `roles`, `dropdowns`, `auditLogs`, `notifications`

**Inspections / prevention (explicit matches):** `inspectionSettings`, `inspections`, `occupancies`, `inspectionAuditEvents`, `inspectionTypes`, `inspectionTemplates`, `inspectionTemplateVersions`, `codeSets`, `codeSections`, `localAmendments`, `adoptedCodeProfiles`, `codeSavedSections`, `codeSearchHistory`, `codeExtractionIssues`, `violationCatalog`, `violations`, `preplans`, `preplanRevisions`, `preplanTemplates`, `preplanTemplateVersions`, `preplanSymbolLibraries`, `preplanDiagrams`, `preplanVerifications`, `preplanDropdownLibraries`, `preplanDropdownOptions`, `preplanBuildings`, `preplanFiles`, `preplanQrTokens`, `inspectionDocumentTemplates`, `inspectionNotices`, `inspectionCertificates`, `inspectionNoticeDeliveries`, `inspectionReinspections`, `inspectionEnforcementOrders`, `inspectionCitations`, `inspectionAppeals`, `inspectionCorrectionSubmissions`, `fireProtectionSystems`, `fpsTestReports`, `fpsImpairments`, `fpsDeficiencies`, `fpsContractors`, `inspectionFeeSchedules`, `inspectionFees`, `inspectionInvoices`, `inspectionPayments`, `inspectionFeeAdjustments`, `inspectionSavedReports`, `inspectionReportRuns`, `inspectionScheduledReports`, `inspectionDevicePolicies`, `inspectionAutomations`, `inspectionAutomationRuns`, `inspectionWorkflows`, `inspectionWebhooks`, `inspectionCalendarEvents`, `inspectionNerisMappings`, `inspectionIntegrationAdapters`, `inspectionImportBatches`, `inspectionHardeningChecks`

**Fleet (explicit matches):** `fleetSettings`, `fleetClasses`, `fleetAssets`, `fleetAssetAliases`, `fleetAuditEvents`, `fleetMigrationReports`, `fleetChecklistTemplates`, `fleetChecklistTemplateVersions`, `fleetChecks`, `fleetMeterReadings`, `fleetDefects`, `fleetDefectCategories`, `fleetStatusEvents`, `fleetReserveRequests`, `fleetWorkOrders`, `fleetShops`, `fleetVendors`, `fleetPmPrograms`, `fleetPmSchedules`, `fleetTestPrograms`, `fleetTests`, `fleetFuelSites`, `fleetFuelTransactions`, `fleetFuelExceptionRules`, `fleetChargingSessions`, `fleetTelematicsAdapters`, `fleetTelematicsMappings`, `fleetTelematicsEvents`, `fleetTires`, `fleetBatteries`, `fleetFluidEvents`, `fleetRecalls`, `fleetWarranties`, `fleetWarrantyClaims`, `fleetAssignments`, `fleetTransfers`, `fleetReserveSwaps`, `fleetCheckouts`, `fleetPoolReservations`, `fleetLoadPlans`, `fleetDeconEvents`, `fleetAccidentEvents`, `fleetInsuranceClaims`, `fleetTowProviders`, `fleetRoadsideEvents`, `fleetSafetyReviews`, `fleetProcurementRequests`, `fleetSpecifications`, `fleetBuildProjects`, `fleetGrants`, `fleetAssetInsurance`, `fleetCostEntries`, `fleetDowntimeEvents`, `fleetReplacementModels`, `fleetReplacementCases`, `fleetCapitalPlanItems`, `fleetValuations`, `fleetDisposalRecords`, `fleetSavedReports`, `fleetReportRuns`, `fleetAutomations`, `fleetAutomationRuns`, `fleetWorkflows`, `fleetIntegrationAdapters`, `fleetNerisMappings`, `fleetCadMappings`, `fleetHardeningChecks`

**Academy hub (Admin SDK only in rules):** `academyIntegrations`, `academyAuditLogs`, `academyEvents`, `people` (+ `academyLinks`, `academyCache`)

**Hydrant damage:** `waterCompanies`, `waterCompanyContacts`, `waterDistricts`, `hydrantOwnershipReview`, `hydrantDamageReports`, `hydrantDamageEmailAttempts`, `hydrantDamageAcknowledgments`, `hydrantRepairVerifications`, `hydrantDamageAuditEvents`

**Catch-all:** `departments/{id}/{collection}/{document}` allows any remaining subcollection for department members (legacy list docs live here).

### Tenant list documents (`departments/{id}/lists/{listKey}`)

Canonical keys (`src/lib/tenantListKeys.js`) — legacy `hlfd-rms-*` prefix:

`hlfd-rms-personnel`, `hlfd-rms-certifications`, `hlfd-rms-training`, `hlfd-rms-apparatus`, `hlfd-rms-work-orders`, `hlfd-rms-assets`, `hlfd-rms-documents`, `hlfd-rms-occupancies`, `hlfd-rms-inspections`, `hlfd-rms-preplans`, `hlfd-rms-hose-tests`, `hlfd-rms-schedule-days`, `hlfd-rms-roster`, `hlfd-rms-leave-requests`, `hlfd-rms-overtime-offers`, `hlfd-rms-vacancy-pickups`, `hlfd-rms-shift-trades`, `hlfd-rms-call-shifts`, `hlfd-rms-daily-logs`, `hlfd-rms-time-cards`, `hlfd-rms-dd-displays`, `hlfd-rms-dd-media`, `hlfd-rms-dd-playlists`, `hlfd-rms-dd-schedules`, `hlfd-rms-active911-alerts`, `hlfd-rms-alert-dashboard-config`, `hlfd-rms-alert-business-directory`, `hlfd-rms-neris-fire-reports`

### firebase-app rules delta (legacy)

Same project; flatter/public-write collections emphasized: `preFirePlans`, `hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests`, `appData`, reference collections, `rmsData`, `integrationSettings`, `academyTrainingSyncLog`. Treat as **legacy shapes still present in project**, not the preferred application write path.

## 5. Firebase Storage

### Academy (`storage.rules`)

| Path pattern                                                    | Purpose                 |
| --------------------------------------------------------------- | ----------------------- |
| `platform-branding/platform/{file}`                             | Platform logo           |
| `platform-branding/academies/{academyId}/{file}`                | Academy branding        |
| `student-profiles/{studentId}/{file}`                           | Profile photos          |
| `digital-dashboard-media/{mediaId}/{file}`                      | Signage media           |
| `digital-dashboard-packages/{academyId}/{publicationId}/{file}` | Published packages      |
| `migration/{academyId}/{projectId}/{kind}/{fileId}/{filename}`  | Migration uploads       |
| `certificate-templates/{templateId}/{file}`                     | Certificate assets      |
| `skill-templates/{templateId}/{file}`                           | Skill sheet PDFs/images |

Defect: rules call undefined `isSuperAdmin()` for migration delete.

### RMS

**Rules (both repos):** effectively open (`allow read, write: if true`) with preferred prefix `departments/{departmentId}/**` in forge-rms comments.

**Code path builders (`forge-rms` `src/lib/storagePaths.js`):**

- `departments/{departmentId}/logos/…`
- `platform/branding/…`
- `departments/{departmentId}/personnel-photos/{personId}/…`
- `departments/{departmentId}/personnel-documents/{personId}/…`
- `departments/{departmentId}/certifications/{recordId}/…`
- `departments/{departmentId}/neris-attachments/{reportId}/…`
- `departments/{departmentId}/hydrant-inspections/{hydrantId}/…`
- `departments/{departmentId}/pre-fire-plans/{planId}/…`
- `departments/{departmentId}/document-library/…`

## 6. Cloud Functions

### Academy (`functions/index.js`) — selected inventory

**Firestore triggers:** `emailOnRegistrationCreated`, `emailOnRegistrationUpdated`, `onRmsTrainingSyncQueued`, `onLmsGradePassbackQueued`, `emailOnInvoiceCreated`

**Scheduled:** `scheduledReportExportsJob` (06:00 America/Chicago)

**HTTP:** `lmsCompletionWebhook`, `rmsPersonnelWebhook`, `hubAcademyCommand`

**Callables (groups):** portal user CRUD/password; testing publish/assign/start/save/submit/proctor/grade/override/remediation/retest/certificate-release/state/challenge/metrics; RMS roster pull + Hub identity/FEMA/sync; notifications; digital dashboard RSS/weather/CAP/pairing/proof/publish/payload; migration project lifecycle; `sendInvoiceEmailCallable`

### RMS (`functions/index.js`)

**Callables / HTTP:** `sendShiftBroadcastSms`, `pingTwilioConfig`, Active911 connect/disconnect/status/sync, Google APIs status/config/save/clear/geocode/directions/places, `alertDashboardPublicView`, Jotform damage webhook + setup/PDF/sync, `resolveForgePersonIdentity`, Academy connection/person/link/event callables (`listAcademyConnections` … `listMyAcademyTraining`), `trainingRegisteredWebhook`, `trainingCompletedWebhook`, `sendHydrantDamageReport`, `hydrantDamageAckPortalView`, `hydrantDamageAckPortalSubmit`

### RMS `functions-identity`

Duplicate/narrow deploy of `resolveForgePersonIdentity`.

### firebase-app functions

Academy training completed/registered webhook style handlers + tenancy helpers writing `rmsData` / `academyTrainingSyncLog`. Prefer forge-rms implementations when diverging.

## 7. Security rules observations

- Academy: default deny catch-all; role helpers; duplicated `invoiceSettings` match; broad instructor student reads.
- RMS: hard-coded creator emails; Horn Lake email domain special-case; public reads on `platformDepartments`, `rmsGateways`, some alert lists, `appData`/`rmsData`/`preFirePlans`; authenticated write on several shared collections; Storage fully open.
- firebase-app: hydrants/dailyActivity/hoseTests/preFirePlans allow unauthenticated write.

## 8. Environment variables

### Academy `.env.example`

`VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`

**Also used in functions (not in root example):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_REPLY_TO`, plus Hub/secrets (UNKNOWN complete list).

### RMS / firebase-app `.env.example`

Firebase Vite keys + optional `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `DAILY_ACTIVITY_FROM_EMAIL`

**Also used in functions (inferred):** Twilio, Active911, Google API keys, Jotform secrets, Academy integration secrets — stored in `integrationSettings` / Secret Manager patterns (confirm in console).

## 9. Unknowns

- Exact Auth user counts and Firestore document counts.
- Which Storage objects still use non-department legacy prefixes in RMS.
- Whether both `functions` and `functions-identity` are deployed in production simultaneously.
