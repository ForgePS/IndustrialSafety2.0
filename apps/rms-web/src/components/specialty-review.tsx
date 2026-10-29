"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@forge/web-kit";
import {
  addReviewComment,
  approveIncident,
  approveSpecialtySection,
  getFormDescriptor,
  listAuditEvents,
  listReviewComments,
  listStatusHistory,
  reopenReviewComment,
  resolveReviewComment,
  returnIncident,
  returnSpecialtySection,
  validateIncident,
  type AuditEventRow,
  type FormDescriptor,
  type ReviewComment,
  type SpecialtyWorkflowGroup,
  type StatusHistoryRow,
  type ValidationIssue,
} from "@/lib/rms-api";
import { sectionLabel } from "@/components/incident-workspace";
import styles from "../app/page.module.css";

const REVIEWER_ROLES = [
  "FIRE_INVESTIGATOR",
  "HAZMAT_OFFICER",
  "SAFETY_OFFICER",
  "PREVENTION_OFFICER",
  "TRAINING_OFFICER",
] as const;

export function SpecialtyReviewPanel({
  tenantId,
  incidentId,
  status,
  reportOwnerUserId,
  onChanged,
}: {
  tenantId: string;
  incidentId: string;
  status: string;
  reportOwnerUserId?: string | null;
  onChanged: () => void;
}) {
  const { hasPermission } = useAuth();
  const canSpecialtyReview = hasPermission("rms.neris.specialty.review");
  const canIncidentReview = hasPermission("rms.neris.incident.review");
  const canApprove = hasPermission("rms.neris.incident.approve");
  const canReturn = hasPermission("rms.neris.incident.return");
  const canViewCasualty = hasPermission("rms.neris.civilian_casualty.view");
  const canViewFfCasualty = hasPermission("rms.neris.fire_service_casualty.view");
  const canViewAudit =
    hasPermission("rms.neris.audit.view") || hasPermission("platform.audit.read");

  const [descriptor, setDescriptor] = useState<FormDescriptor | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditEventRow[]>([]);
  const [reviewerRole, setReviewerRole] = useState<string>("");
  const [commentBody, setCommentBody] = useState("");
  const [targetSection, setTargetSection] = useState("");
  const [targetFieldId, setTargetFieldId] = useState("");
  const [targetRecordType, setTargetRecordType] = useState("");
  const [targetRecordId, setTargetRecordId] = useState("");
  const [targetAttachmentId, setTargetAttachmentId] = useState("");
  const [assignToOwner, setAssignToOwner] = useState(true);
  const [returnReason, setReturnReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const specialtyGroups = useMemo(
    () =>
      (descriptor?.specialtyWorkflows ?? []).filter(
        (g) => g.state === "REQUIRED" || g.state === "ACTIVE" || g.state === "NOT_APPLICABLE",
      ),
    [descriptor],
  );

  const fieldOptions = useMemo(() => {
    if (!descriptor || !targetSection) return [];
    return descriptor.modules
      .filter((m) => m.sectionKey === targetSection && m.visible)
      .flatMap((m) =>
        m.fields
          .filter((f) => f.visible)
          .map((f) => ({
            id: f.fieldId,
            label: f.displayLabel || f.fieldKey,
          })),
      );
  }, [descriptor, targetSection]);

  const load = useCallback(async () => {
    try {
      const [nextDescriptor, commentRows, validation, history, audits] = await Promise.all([
        getFormDescriptor(tenantId, incidentId),
        canIncidentReview || canSpecialtyReview
          ? listReviewComments(tenantId, incidentId)
          : Promise.resolve([]),
        validateIncident(tenantId, incidentId).catch(() => null),
        canSpecialtyReview || canViewAudit
          ? listStatusHistory(tenantId, incidentId).catch(() => [])
          : Promise.resolve([]),
        canViewAudit ? listAuditEvents(tenantId, 1, 100).catch(() => []) : Promise.resolve([]),
      ]);
      setDescriptor(nextDescriptor);
      setComments(commentRows);
      setIssues(validation?.findings ?? []);
      setStatusHistory(history);
      setAuditRows(
        audits.filter(
          (row) =>
            row.resourceId === incidentId ||
            (row.afterJson &&
              typeof row.afterJson === "object" &&
              "incidentId" in row.afterJson &&
              (row.afterJson as { incidentId?: string }).incidentId === incidentId) ||
            (row.beforeJson &&
              typeof row.beforeJson === "object" &&
              "incidentId" in row.beforeJson &&
              (row.beforeJson as { incidentId?: string }).incidentId === incidentId),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load specialty review");
    }
  }, [tenantId, incidentId, canIncidentReview, canSpecialtyReview, canViewAudit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function canSeeSection(group: SpecialtyWorkflowGroup): boolean {
    if (group.sectionKey === "CIVILIAN_CASUALTIES" && !canViewCasualty) return false;
    if (group.sectionKey === "FIRE_SERVICE_CASUALTIES" && !canViewFfCasualty) return false;
    return true;
  }

  if (!canSpecialtyReview && !canIncidentReview) {
    return (
      <div className={styles.panel}>
        <h2>Specialty review</h2>
        <p className={styles.muted}>You do not have specialty review permission.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h2>Specialty review</h2>
      <p className={styles.muted}>
        Review activated specialty sections, validation findings, and comments. Restricted casualty
        sections stay hidden without the matching permission.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <div className={styles.formRow}>
        <label htmlFor="reviewer-role">Reviewer role</label>
        <select
          id="reviewer-role"
          value={reviewerRole}
          onChange={(event) => setReviewerRole(event.target.value)}
        >
          <option value="">General</option>
          {REVIEWER_ROLES.map((role) => (
            <option key={role} value={role}>
              {role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <h3>Activated specialty sections</h3>
      {specialtyGroups.length === 0 ? (
        <p className={styles.muted}>No specialty sections are active on this incident.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
          {specialtyGroups.map((group) => {
            const visible = canSeeSection(group);
            const sectionIssues = issues.filter((i) => i.sectionKey === group.sectionKey);
            const blocking = sectionIssues.filter((i) => i.severity === "ERROR");
            const warnings = sectionIssues.filter((i) => i.severity === "WARNING");
            const guidance = sectionIssues.filter(
              (i) => i.severity === "GUIDANCE" || i.severity === "INFO",
            );
            return (
              <li
                key={group.sectionKey}
                style={{
                  border: "1px solid var(--border, #ddd)",
                  borderRadius: 8,
                  padding: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>{group.label}</strong>
                  <span className={styles.muted} aria-label={`Status ${group.state}`}>
                    {group.state}
                    {group.completionPercent != null
                      ? ` · ${group.completionPercent}% complete`
                      : ""}
                    {group.hasBlockingGaps ? " · blocking gaps" : ""}
                  </span>
                </div>
                <p className={styles.muted} style={{ margin: "0.35rem 0" }}>
                  {group.plainLanguageSummary}
                </p>
                {group.activationReasons.length > 0 ? (
                  <p style={{ margin: "0.35rem 0" }}>
                    Why activated: {group.activationReasons.join("; ")}
                  </p>
                ) : null}
                {!visible ? (
                  <p className={styles.muted}>
                    Restricted — casualty or health detail is not available for your role.
                  </p>
                ) : (
                  <>
                    {group.requiredFieldCount ? (
                      <p className={styles.muted}>
                        Required fields filled: {group.filledRequiredFieldCount ?? 0}/
                        {group.requiredFieldCount}
                      </p>
                    ) : null}
                    {sectionIssues.length > 0 ? (
                      <>
                        <p className={styles.muted}>
                          Findings: {blocking.length} blocking, {warnings.length} warnings,{" "}
                          {guidance.length} guidance
                        </p>
                        <ul>
                          {sectionIssues.map((issue, index) => (
                            <li key={`${group.sectionKey}-${index}`}>
                              <span className={styles.muted}>[{issue.severity}]</span>{" "}
                              {issue.message}{" "}
                              {issue.technicalReference || issue.sectionKey || issue.fieldId ? (
                                <Link
                                  href={`/incidents/${incidentId}/?section=${issue.sectionKey ?? group.sectionKey}${
                                    issue.technicalReference
                                      ? `&ref=${encodeURIComponent(issue.technicalReference)}`
                                      : issue.fieldId
                                        ? `&field=${encodeURIComponent(issue.fieldId)}`
                                        : ""
                                  }`}
                                >
                                  Open finding
                                </Link>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className={styles.muted}>No findings for this section.</p>
                    )}
                    <div className={styles.actions}>
                      <Link
                        className={styles.buttonSecondary}
                        href={`/incidents/${incidentId}/?section=${group.sectionKey}`}
                      >
                        Open section
                      </Link>
                      {canSpecialtyReview ? (
                        <>
                          <button
                            type="button"
                            className={styles.buttonSecondary}
                            disabled={busy || group.state === "NOT_APPLICABLE"}
                            onClick={() =>
                              void run(
                                () =>
                                  approveSpecialtySection(
                                    tenantId,
                                    incidentId,
                                    group.sectionKey,
                                    reviewerRole || undefined,
                                  ),
                                `${sectionLabel(group.sectionKey)} approved`,
                              )
                            }
                          >
                            Approve section
                          </button>
                          <button
                            type="button"
                            className={styles.buttonSecondary}
                            disabled={busy}
                            onClick={() => {
                              const reason =
                                returnReason.trim() ||
                                `Please correct ${sectionLabel(group.sectionKey)}.`;
                              void run(
                                () =>
                                  returnSpecialtySection(tenantId, incidentId, {
                                    sectionKey: group.sectionKey,
                                    reason,
                                    reviewerRole: reviewerRole || null,
                                  }),
                                `${sectionLabel(group.sectionKey)} returned`,
                              );
                            }}
                          >
                            Return section
                          </button>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3>Add review comment</h3>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label htmlFor="target-section">Section</label>
          <select
            id="target-section"
            value={targetSection}
            onChange={(event) => {
              setTargetSection(event.target.value);
              setTargetFieldId("");
            }}
          >
            <option value="">Full incident</option>
            {specialtyGroups.map((g) => (
              <option key={g.sectionKey} value={g.sectionKey}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="target-field">Field (optional)</label>
          <select
            id="target-field"
            value={targetFieldId}
            onChange={(event) => setTargetFieldId(event.target.value)}
            disabled={!targetSection}
          >
            <option value="">Entire section</option>
            {fieldOptions.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="target-record-type">Repeatable record type (optional)</label>
          <input
            id="target-record-type"
            value={targetRecordType}
            onChange={(event) => setTargetRecordType(event.target.value)}
            placeholder="e.g. exposure, civilian_casualty, hazmat_substance"
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="target-record-id">Repeatable record id (optional)</label>
          <input
            id="target-record-id"
            value={targetRecordId}
            onChange={(event) => setTargetRecordId(event.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="target-attachment">Attachment id (optional)</label>
          <input
            id="target-attachment"
            value={targetAttachmentId}
            onChange={(event) => setTargetAttachmentId(event.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="assign-owner">
            <input
              id="assign-owner"
              type="checkbox"
              checked={assignToOwner}
              onChange={(event) => setAssignToOwner(event.target.checked)}
              disabled={!reportOwnerUserId}
            />{" "}
            Assign to reporting officer
            {!reportOwnerUserId ? " (no report owner on incident)" : ""}
          </label>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="specialty-comment">Comment</label>
          <textarea
            id="specialty-comment"
            rows={3}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={busy || !commentBody.trim()}
            onClick={() =>
              void run(async () => {
                await addReviewComment(tenantId, incidentId, {
                  body: commentBody.trim(),
                  sectionKey: targetSection || null,
                  fieldId: targetFieldId || null,
                  specialtyRecordType: targetRecordType || null,
                  specialtyRecordId: targetRecordId || null,
                  attachmentId: targetAttachmentId || null,
                  reviewerRole: reviewerRole || null,
                  assignedToUserId: assignToOwner && reportOwnerUserId ? reportOwnerUserId : null,
                });
                setCommentBody("");
              }, "Comment added")
            }
          >
            Add comment
          </button>
          {canSpecialtyReview && targetSection && targetRecordType && targetRecordId ? (
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={busy || !returnReason.trim()}
              onClick={() =>
                void run(
                  () =>
                    returnSpecialtySection(tenantId, incidentId, {
                      sectionKey: targetSection,
                      reason: returnReason.trim(),
                      specialtyRecordType: targetRecordType,
                      specialtyRecordId: targetRecordId,
                      reviewerRole: reviewerRole || null,
                    }),
                  "Repeatable record returned for correction",
                )
              }
            >
              Return selected record
            </button>
          ) : null}
        </div>
      </div>

      <h3>Previous comments</h3>
      {comments.length === 0 ? (
        <p className={styles.muted}>No review comments yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
          {comments.map((comment) => (
            <li
              key={comment.id}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "0.75rem",
              }}
            >
              <p style={{ margin: 0 }}>{comment.body}</p>
              <p className={styles.muted} style={{ margin: "0.35rem 0" }}>
                Status: {comment.status ?? "OPEN"}
                {comment.sectionKey ? ` · Section ${sectionLabel(comment.sectionKey)}` : ""}
                {comment.fieldId ? " · Field" : ""}
                {comment.specialtyRecordType ? ` · Record ${comment.specialtyRecordType}` : ""}
                {comment.attachmentId ? " · Attachment" : ""}
                {comment.reviewerRole ? ` · ${comment.reviewerRole}` : ""}
                {comment.assignedToUserId ? " · Assigned to reporting officer" : ""}
                {comment.resolvedAt
                  ? ` · Resolved ${new Date(comment.resolvedAt).toLocaleString()}`
                  : ""}
              </p>
              <div className={styles.actions}>
                {comment.sectionKey ? (
                  <Link
                    href={`/incidents/${incidentId}/?section=${comment.sectionKey}${
                      comment.fieldId ? `&field=${encodeURIComponent(comment.fieldId)}` : ""
                    }`}
                  >
                    Go to target
                  </Link>
                ) : null}
                {(comment.status ?? "OPEN") !== "RESOLVED" ? (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => resolveReviewComment(tenantId, incidentId, comment.id),
                        "Comment resolved",
                      )
                    }
                  >
                    Mark resolved
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => reopenReviewComment(tenantId, incidentId, comment.id),
                        "Comment reopened",
                      )
                    }
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3>Correction history</h3>
      {statusHistory.length === 0 ? (
        <p className={styles.muted}>No status transitions recorded.</p>
      ) : (
        <ul>
          {statusHistory.map((row) => (
            <li key={row.id}>
              {row.fromStatus ?? "—"} → {row.toStatus}{" "}
              <span className={styles.muted}>{new Date(row.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Audit history (before / after)</h3>
      {!canViewAudit ? (
        <p className={styles.muted}>Audit history requires audit view permission.</p>
      ) : auditRows.length === 0 ? (
        <p className={styles.muted}>No incident-scoped audit events in the recent window.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
          {auditRows.slice(0, 25).map((row) => (
            <li
              key={row.id}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "0.75rem",
              }}
            >
              <strong>{row.action}</strong>{" "}
              <span className={styles.muted}>
                {row.resourceType} · {new Date(row.occurredAt).toLocaleString()} · {row.result}
              </span>
              {row.beforeJson || row.afterJson ? (
                <pre
                  style={{
                    margin: "0.5rem 0 0",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.85rem",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(
                    { before: row.beforeJson ?? null, after: row.afterJson ?? null },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h3>Incident actions</h3>
      <div className={styles.formRow}>
        <label htmlFor="return-reason">Return reason</label>
        <textarea
          id="return-reason"
          rows={2}
          value={returnReason}
          onChange={(event) => setReturnReason(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        {canReturn ? (
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={busy || !returnReason.trim()}
            onClick={() =>
              void run(
                () => returnIncident(tenantId, incidentId, returnReason.trim(), []),
                "Incident returned for correction",
              )
            }
          >
            Return full incident
          </button>
        ) : null}
        {canApprove ? (
          <button
            type="button"
            disabled={busy || status === "FINALIZED"}
            onClick={() =>
              void run(() => approveIncident(tenantId, incidentId), "Incident approved")
            }
          >
            Approve complete incident
          </button>
        ) : null}
      </div>
      <p className={styles.muted}>
        Incident status: {status}. Finalized incidents reject specialty edits.
      </p>
    </div>
  );
}
