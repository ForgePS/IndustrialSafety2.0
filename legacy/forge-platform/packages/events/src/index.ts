export interface ForgeDomainEvent<TPayload = unknown> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  tenantId: string | null;
  actorUserId: string | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | null;
  payload: TPayload;
}

export const DOMAIN_EVENT_TYPES = {
  TENANT_CREATED: "platform.tenant.created.v1",
  TENANT_ACTIVATED: "platform.tenant.activated.v1",
  TENANT_SUSPENDED: "platform.tenant.suspended.v1",
  TENANT_ARCHIVED: "platform.tenant.archived.v1",
  TENANT_STATUS_CHANGED: "platform.tenant.status_changed.v1",
  FACILITY_CREATED: "platform.facility.created.v1",
  FACILITY_UPDATED: "platform.facility.updated.v1",
  ORGANIZATION_CREATED: "platform.organization.created.v1",
  ORGANIZATION_UPDATED: "platform.organization.updated.v1",
  PERSON_CREATED: "platform.person.created.v1",
  PERSON_UPDATED: "platform.person.updated.v1",
  PERSON_MERGED: "platform.person.merged.v1",
  PERSON_ARCHIVED: "platform.person.archived.v1",
  USER_INVITED: "platform.user.invited.v1",
  USER_ACTIVATED: "platform.user.activated.v1",
  USER_DISABLED: "platform.user.disabled.v1",
  ROLE_ASSIGNED: "platform.role.assigned.v1",
  ROLE_REVOKED: "platform.role.revoked.v1",
  ENTITLEMENT_CHANGED: "platform.entitlement.changed.v1",
  SUBSCRIPTION_CHANGED: "platform.subscription.changed.v1",
  BILLING_PROVIDER_EVENT_RECEIVED: "platform.billing.provider_event.received.v1",
  BILLING_CONTRACT_CHANGED: "platform.billing.contract.changed.v1",
  FEATURE_CHANGED: "platform.feature.changed.v1",
  CONFIGURATION_CHANGED: "platform.configuration.changed.v1",
  CONFIGURATION_VERSION_PUBLISHED: "platform.configuration.version.published.v1",
  CONFIGURATION_VERSION_SCHEDULED: "platform.configuration.version.scheduled.v1",
  CONFIGURATION_VERSION_ARCHIVED: "platform.configuration.version.archived.v1",
  CONFIGURATION_VERSION_ROLLED_BACK: "platform.configuration.version.rolled_back.v1",
  // Sprint 1E additions.
  USER_INVITATION_CREATED: "platform.user_invitation.created.v1",
  USER_INVITATION_SENT: "platform.user_invitation.sent.v1",
  USER_INVITATION_ACCEPTED: "platform.user_invitation.accepted.v1",
  USER_INVITATION_REVOKED: "platform.user_invitation.revoked.v1",
  USER_INVITATION_EXPIRED: "platform.user_invitation.expired.v1",
  USER_INVITATION_FAILED: "platform.user_invitation.failed.v1",
  MEMBERSHIP_CREATED: "platform.membership.created.v1",
  MEMBERSHIP_ACTIVATED: "platform.membership.activated.v1",
  MEMBERSHIP_SUSPENDED: "platform.membership.suspended.v1",
  MEMBERSHIP_REVOKED: "platform.membership.revoked.v1",
  MEMBERSHIP_ROLES_CHANGED: "platform.membership.roles_changed.v1",
  ONBOARDING_COMPLETED: "platform.onboarding.completed.v1",
  NERIS_SCHEMA_VERSION_PUBLISHED: "neris.schema.version.published.v1",
  NERIS_OVERLAY_UPDATED: "neris.overlay.updated.v1",
  // NERIS Phase 2 incident shell.
  NERIS_INCIDENT_CREATED: "rms.neris.incident.created.v1",
  NERIS_INCIDENT_STATUS_CHANGED: "rms.neris.incident.status_changed.v1",
  NERIS_INCIDENT_SUBMITTED_FOR_REVIEW: "rms.neris.incident.submitted_for_review.v1",
  NERIS_INCIDENT_RETURNED: "rms.neris.incident.returned.v1",
  NERIS_INCIDENT_APPROVED: "rms.neris.incident.approved.v1",
  NERIS_INCIDENT_FINALIZED: "rms.neris.incident.finalized.v1",
  NERIS_INCIDENT_VOIDED: "rms.neris.incident.voided.v1",
  RMS_MASTERDATA_UPDATED: "rms.masterdata.updated.v1",
  // NERIS Phase 4 CAD.
  CAD_MESSAGE_RECEIVED: "rms.cad.message.received.v1",
  CAD_EVENT_NORMALIZED: "rms.cad.event.normalized.v1",
  CAD_EVENT_APPLIED: "rms.cad.event.applied.v1",
  CAD_INCIDENT_CREATED: "rms.cad.incident.created.v1",
  CAD_INCIDENT_UPDATED: "rms.cad.incident.updated.v1",
  CAD_INCIDENT_LINKED: "rms.cad.incident.linked.v1",
  CAD_CONFLICT_CREATED: "rms.cad.conflict.created.v1",
  CAD_CONNECTION_HEALTH_CHANGED: "rms.cad.connection.health_changed.v1",
  // Universal Import Platform (S1/S2 event definitions).
  IMPORT_JOB_CREATED: "import.job.created.v1",
  IMPORT_JOB_UPDATED: "import.job.updated.v1",
  IMPORT_JOB_CANCELLED: "import.job.cancelled.v1",
  IMPORT_FILE_REGISTERED: "import.file.registered.v1",
  IMPORT_UPLOAD_INITIALIZED: "import.upload.initialized.v1",
  IMPORT_UPLOAD_COMPLETED: "import.upload.completed.v1",
  IMPORT_UPLOAD_CANCELLED: "import.upload.cancelled.v1",
  IMPORT_FORMAT_DETECTION_STARTED: "import.format_detection.started.v1",
  IMPORT_FORMAT_DETECTION_PASSED: "import.format_detection.passed.v1",
  IMPORT_FORMAT_DETECTION_FAILED: "import.format_detection.failed.v1",
  IMPORT_DUPLICATES_DETECTED: "import.duplicates.detected.v1",
  IMPORT_DUPLICATE_REVIEWED: "import.duplicate.reviewed.v1",
  IMPORT_DUPLICATE_APPROVED: "import.duplicate.approved.v1",
  IMPORT_DUPLICATE_REJECTED: "import.duplicate.rejected.v1",
  IMPORT_ROWS_STAGED: "import.rows.staged.v1",
  IMPORT_ZIP_VALIDATED: "import.zip.validated.v1",
  IMPORT_API_SOURCE_VALIDATED: "import.api_source.validated.v1",
  IMPORT_PROFILE_CREATED: "import.profile.created.v1",
  IMPORT_PROFILE_UPDATED: "import.profile.updated.v1",
  IMPORT_PROFILE_ARCHIVED: "import.profile.archived.v1",
  IMPORT_PROFILE_RESTORED: "import.profile.restored.v1",
  IMPORT_MAPPINGS_UPDATED: "import.mappings.updated.v1",
  IMPORT_VALIDATION_REQUESTED: "import.validation.requested.v1",
  IMPORT_PREVIEW_REQUESTED: "import.preview.requested.v1",
  IMPORT_SUBMITTED_FOR_APPROVAL: "import.submitted_for_approval.v1",
  IMPORT_VALIDATION_STARTED: "import.validation.started.v1",
  IMPORT_VALIDATION_COMPLETED: "import.validation.completed.v1",
  IMPORT_PREVIEW_GENERATED: "import.preview.generated.v1",
  IMPORT_APPROVED: "import.approved.v1",
  IMPORT_REJECTED: "import.rejected.v1",
  IMPORT_EXECUTION_QUEUED: "import.execution.queued.v1",
  IMPORT_EXECUTION_STARTED: "import.execution.started.v1",
  IMPORT_EXECUTION_COMPLETED: "import.execution.completed.v1",
  IMPORT_EXECUTION_COMPLETED_WITH_ERRORS: "import.execution.completed_with_errors.v1",
  IMPORT_EXECUTION_FAILED: "import.execution.failed.v1",
  IMPORT_EXECUTION_CANCEL_REQUESTED: "import.execution.cancel.requested.v1",
  IMPORT_EXECUTION_CANCELLED: "import.execution.cancelled.v1",
  IMPORT_EXECUTION_DLQ: "import.execution.dlq.v1",
  IMPORT_EXECUTION_LOCK_ACQUIRED: "import.execution.lock.acquired.v1",
  IMPORT_EXECUTION_LOCK_RELEASED: "import.execution.lock.released.v1",
  IMPORT_BATCH_STARTED: "import.batch.started.v1",
  IMPORT_BATCH_COMPLETED: "import.batch.completed.v1",
  IMPORT_ROW_COMMITTED: "import.row.committed.v1",
  IMPORT_ROW_FAILED: "import.row.failed.v1",
  IMPORT_ROW_RETRIED: "import.row.retried.v1",
  IMPORT_SCAN_SUBMITTED: "import.scan.submitted.v1",
  IMPORT_SCAN_STARTED: "import.scan.started.v1",
  IMPORT_SCAN_COMPLETED: "import.scan.completed.v1",
  IMPORT_SCAN_CLEAN: "import.scan.clean.v1",
  IMPORT_SCAN_INFECTED: "import.scan.infected.v1",
  IMPORT_SCAN_SUSPICIOUS: "import.scan.suspicious.v1",
  IMPORT_SCAN_FAILED: "import.scan.failed.v1",
  IMPORT_SCAN_TIMEOUT: "import.scan.timeout.v1",
  IMPORT_SCAN_RESCAN_REQUESTED: "import.scan.rescan_requested.v1",
  IMPORT_FILE_QUARANTINED: "import.file.quarantined.v1",
  IMPORT_SENSITIVE_VIEWED: "import.sensitive.viewed.v1",
  IMPORT_SENSITIVE_DOWNLOAD_REQUESTED: "import.sensitive.download_requested.v1",
  IMPORT_SENSITIVE_ACCESS_DENIED: "import.sensitive.access_denied.v1",
  IMPORT_ROLLBACK_REQUESTED: "import.rollback.requested.v1",
  IMPORT_ROLLBACK_CLASSIFIED: "import.rollback.classified.v1",
  IMPORT_ROLLBACK_COMPLETED: "import.rollback.completed.v1",
  IMPORT_ROLLBACK_REFUSED: "import.rollback.refused.v1",
  IMPORT_SENSITIVE_FIELD_ACCESSED: "import.sensitive_field.accessed.v1",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

/**
 * Events the Sprint 1E pipeline proof asserts end to end
 * (API transaction, outbox, EventBridge, SQS, worker, handler).
 */
export const PIPELINE_PROOF_EVENT_TYPES = [
  DOMAIN_EVENT_TYPES.TENANT_CREATED,
  DOMAIN_EVENT_TYPES.USER_INVITATION_CREATED,
  DOMAIN_EVENT_TYPES.MEMBERSHIP_ACTIVATED,
  DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
  DOMAIN_EVENT_TYPES.FEATURE_CHANGED,
] as const satisfies readonly DomainEventType[];

export function createDomainEvent<TPayload>(input: {
  id: string;
  type: DomainEventType | string;
  version?: number;
  occurredAt?: string;
  tenantId: string | null;
  actorUserId: string | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string | null;
  payload: TPayload;
}): ForgeDomainEvent<TPayload> {
  return {
    id: input.id,
    type: input.type,
    version: input.version ?? 1,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    payload: input.payload,
  };
}

export function assertSafeEventPayload(payload: unknown): void {
  const serialized = JSON.stringify(payload ?? {});
  if (/("ssn"|"password"|"token"|"secret")\s*:/i.test(serialized)) {
    throw new Error("Event payload appears to contain sensitive fields");
  }
}
