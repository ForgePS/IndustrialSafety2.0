"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { EMERGENCY_SMS_SIGNUP_QR_TARGET } from "@forge/contracts";
import { apiGet, apiSend, useAuth } from "@forge/web-kit";
import { EmergencySmsSignupForm } from "@/components/emergency-sms-signup-form";
import { LotoProcedureDetailSections } from "@/components/loto-procedure-detail-sections";
import { QrCameraScanner } from "@/components/qr-camera-scanner";
import { ScanInspectionRunner } from "@/components/scan-inspection-runner";
import { TenantBrandHeader } from "@/components/tenant-brand-header";
import { formatApiErrorMessage } from "@/lib/api-error";
import { extractProcedureDisplay, lotoStatusBadgeClass, lotoStatusLabel } from "@/lib/loto";
import {
  clearStoredScanEmployee,
  filterClientScanActions,
  isInlineScanAction,
  readStoredScanEmployee,
  resolveScanPublicToken,
  scanActionUsesSignedInModule,
  writeStoredScanEmployee,
  type ScanAction,
  type ScanHistoryEntry,
  type ScanHistoryResult,
  type ScanIdentifyResult,
  type ScanInspectionCompleteResult,
  type ScanPublicContext,
} from "@/lib/scan-public";

function isSmsSignupContext(ctx: ScanPublicContext): boolean {
  return String(ctx.targetType ?? "").toUpperCase() === EMERGENCY_SMS_SIGNUP_QR_TARGET;
}

type Screen = "loading" | "gate" | "hub" | "error";
type HubPanel =
  | "actions"
  | "loto"
  | "report_issue"
  | "history"
  | "out_of_service"
  | "return_to_service"
  | "inspection";

function ScanPublicForm({ token }: { token: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);

  const [screen, setScreen] = useState<Screen>("loading");
  const [context, setContext] = useState<ScanPublicContext | null>(null);
  const [identify, setIdentify] = useState<ScanIdentifyResult | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [actions, setActions] = useState<ScanAction[]>([]);
  const [hubPanel, setHubPanel] = useState<HubPanel>("actions");
  const [activeInspection, setActiveInspection] = useState<ScanAction | null>(null);
  const [historyItems, setHistoryItems] = useState<ScanHistoryEntry[]>([]);
  const [issueDescription, setIssueDescription] = useState("");
  const [issuePriority, setIssuePriority] = useState("MEDIUM");
  const [issueOutOfService, setIssueOutOfService] = useState(false);
  const [oosReason, setOosReason] = useState("");
  const [oosNotes, setOosNotes] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [lotoDetail, setLotoDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const signedIn = Boolean(me?.tenantId);
  const storedEmployee = readStoredScanEmployee(token);
  const verifiedEmployee = Boolean(identify?.employeeNumber || storedEmployee);
  const activeEmployeeNumber = identify?.employeeNumber ?? storedEmployee ?? employeeNumber.trim();
  const allowAnonymousIssue = Boolean(context?.publicLimited);

  const loadLotoProcedure = useCallback(async () => {
    const payload = await apiGet<{ detail?: Record<string, unknown> }>(
      `/api/v1/public/scan/${encodeURIComponent(token)}/loto`,
    );
    setLotoDetail(payload.detail ?? (payload as Record<string, unknown>));
    setHubPanel("loto");
  }, [token]);

  const loadContext = useCallback(async () => {
    const data = await apiGet<ScanPublicContext>(
      `/api/v1/public/scan/${encodeURIComponent(token)}`,
    );
    setContext(data);
    return data;
  }, [token]);

  const refreshActions = useCallback(
    async (ctx: ScanPublicContext, employee?: string | null) => {
      const res = await apiSend<{ actions: ScanAction[]; verifiedEmployee: boolean }>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/actions`,
        "POST",
        {
          employeeNumber: employee ?? undefined,
        },
      );
      setActions(
        filterClientScanActions(res.actions ?? ctx.actions, {
          verifiedEmployee: res.verifiedEmployee || Boolean(employee),
          permissions,
        }),
      );
    },
    [token, me, permissions],
  );

  useEffect(() => {
    if (!token) {
      setScreen("error");
      setError("Scan link is missing a token.");
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const data = await loadContext();
        if (cancelled) return;

        if (isSmsSignupContext(data)) {
          setScreen("hub");
          return;
        }

        const stored = readStoredScanEmployee(token);
        if (stored) {
          setEmployeeNumber(stored);
          try {
            const verified = await apiSend<ScanIdentifyResult>(
              `/api/v1/public/scan/${encodeURIComponent(token)}/identify`,
              "POST",
              { employeeNumber: stored },
            );
            if (!cancelled) {
              setIdentify(verified);
              setActions(verified.actions ?? []);
              setScreen("hub");
              if (
                data.publicLimited &&
                String(data.targetType ?? "").toUpperCase() === "LOTO_PROCEDURE"
              ) {
                try {
                  await loadLotoProcedure();
                } catch {
                  // ignore — actions still available
                }
              }
              return;
            }
          } catch {
            clearStoredScanEmployee(token);
          }
        }

        if (data.requiresSignIn && !signedIn) {
          setScreen("gate");
          return;
        }

        if (data.requiresEmployeeNumber && !signedIn) {
          setScreen("gate");
          return;
        }

        await refreshActions(data, stored);
        setScreen("hub");
        if (
          data.publicLimited &&
          String(data.targetType ?? "").toUpperCase() === "LOTO_PROCEDURE"
        ) {
          try {
            await loadLotoProcedure();
          } catch {
            // Hub still usable for report-issue even if procedure payload fails.
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatApiErrorMessage(e, "This QR link could not be opened."));
          setScreen("error");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadContext, refreshActions, signedIn, loadLotoProcedure]);

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    const normalized = employeeNumber.trim();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const verified = await apiSend<ScanIdentifyResult>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/identify`,
        "POST",
        { employeeNumber: normalized },
      );
      writeStoredScanEmployee(token, normalized);
      setIdentify(verified);
      setActions(verified.actions ?? []);
      setScreen("hub");
    } catch (e) {
      setError(formatApiErrorMessage(e, "EMPLOYEE number could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  function switchEmployee() {
    clearStoredScanEmployee(token);
    setIdentify(null);
    setEmployeeNumber("");
    setHubPanel("actions");
    setScreen("gate");
  }

  async function reloadContextAndActions() {
    const data = await loadContext();
    await refreshActions(data, activeEmployeeNumber || null);
    return data;
  }

  async function openHistory() {
    if (!activeEmployeeNumber) return;
    setBusy(true);
    setError(null);
    try {
      const history = await apiSend<ScanHistoryResult>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/history`,
        "POST",
        {
          employeeNumber: activeEmployeeNumber,
        },
      );
      setHistoryItems(history.items ?? []);
      setHubPanel("history");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not load equipment history."));
    } finally {
      setBusy(false);
    }
  }

  function handleAction(action: ScanAction) {
    if (scanActionUsesSignedInModule(action, signedIn)) {
      router.push(action.href);
      return;
    }
    if (action.id === "open_loto") {
      setBusy(true);
      setError(null);
      void loadLotoProcedure()
        .catch((e) => setError(formatApiErrorMessage(e, "Could not load LOTO procedure.")))
        .finally(() => setBusy(false));
      return;
    }
    if (action.kind === "report_issue") {
      setHubPanel("report_issue");
      return;
    }
    if (action.kind === "view_history") {
      void openHistory();
      return;
    }
    if (action.kind === "mark_out_of_service") {
      setHubPanel("out_of_service");
      return;
    }
    if (action.kind === "return_to_service") {
      setHubPanel("return_to_service");
      return;
    }
    if (action.kind === "start_inspection") {
      setActiveInspection(action);
      setHubPanel("inspection");
      return;
    }
    if (!isInlineScanAction(action)) {
      router.push(action.href);
    }
  }

  async function submitIssue(event: FormEvent) {
    event.preventDefault();
    if (!allowAnonymousIssue && !activeEmployeeNumber) {
      setError("EMPLOYEE number is required to report an issue on this QR code.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/report-issue`, "POST", {
        ...(activeEmployeeNumber ? { employeeNumber: activeEmployeeNumber } : {}),
        description: issueDescription.trim(),
        priority: issuePriority,
        outOfService: allowAnonymousIssue ? false : issueOutOfService,
        appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      setIssueDescription("");
      setIssueOutOfService(false);
      setNotice("Problem reported. Supervisors have been notified.");
      await reloadContextAndActions();
      setHubPanel("actions");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not report issue."));
    } finally {
      setBusy(false);
    }
  }

  async function submitOutOfService(event: FormEvent) {
    event.preventDefault();
    if (!activeEmployeeNumber) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/out-of-service`, "POST", {
        employeeNumber: activeEmployeeNumber,
        reason: oosReason.trim(),
        notes: oosNotes.trim() || undefined,
      });
      setOosReason("");
      setOosNotes("");
      await reloadContextAndActions();
      setHubPanel("actions");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not mark asset out of service."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReturnToService(event: FormEvent) {
    event.preventDefault();
    if (!activeEmployeeNumber) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/public/scan/${encodeURIComponent(token)}/return-to-service`, "POST", {
        employeeNumber: activeEmployeeNumber,
        notes: returnNotes.trim() || undefined,
      });
      setReturnNotes("");
      await reloadContextAndActions();
      setHubPanel("actions");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not return asset to service."));
    } finally {
      setBusy(false);
    }
  }

  function handleInspectionComplete(result: ScanInspectionCompleteResult) {
    setActiveInspection(null);
    setHubPanel("actions");
    void reloadContextAndActions().then((data) => {
      if (result.assetOutOfService && data.asset) {
        setContext((prev) =>
          prev
            ? {
                ...prev,
                asset: {
                  ...data.asset!,
                  outOfService: true,
                  outOfServiceReason:
                    result.outOfServiceReason ?? data.asset?.outOfServiceReason ?? null,
                },
              }
            : prev,
        );
      }
    });
  }

  if (screen === "loading") {
    return (
      <div className="container py-4">
        <p className="text-muted mb-0">Opening scan link…</p>
      </div>
    );
  }

  if (screen === "error" || !context) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" role="alert">
          {error ?? "This QR link is not available."}
        </div>
        <Link href="/scan" className="btn btn-outline-primary btn-sm">
          Scan another code
        </Link>
      </div>
    );
  }

  if (isSmsSignupContext(context)) {
    return (
      <div className="container py-3 py-md-4" style={{ maxWidth: "720px" }}>
        <TenantBrandHeader
          tenantKey={context.tenantKey}
          companyName={context.companyName}
          logoUrl={context.logoUrl}
          title="Emergency SMS Alerts"
          subtitle="Employee signup"
        />
        <EmergencySmsSignupForm token={token} />
      </div>
    );
  }

  return (
    <div className="container py-3 py-md-4" style={{ maxWidth: "720px" }}>
      <TenantBrandHeader
        tenantKey={context.tenantKey}
        companyName={context.companyName}
        logoUrl={context.logoUrl}
        title={context.name}
        subtitle={context.displayCode ? `Code ${context.displayCode}` : "Forge QR Scan"}
      />

      {error ? (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success mt-3" role="status">
          {notice}
        </div>
      ) : null}

      {screen === "gate" ? (
        <div className="card border shadow-none mt-3">
          <div className="card-body">
            {context.requiresSignIn ? (
              <>
                <h6 className="mb-2">Sign in required</h6>
                <p className="small text-muted mb-3">
                  This QR link requires an authenticated Forge Industrial session. Sign in to the
                  app, then scan the code again.
                </p>
                <Link href="/" className="btn btn-primary btn-sm">
                  Open Forge Industrial
                </Link>
              </>
            ) : (
              <>
                <h6 className="mb-2">Verify EMPLOYEE number</h6>
                <p className="small text-muted mb-3">
                  Enter the EMPLOYEE number from your personnel record to continue.
                </p>
                <form className="row g-2" onSubmit={(event) => void submitEmployee(event)}>
                  <div className="col-sm-8">
                    <label className="form-label small" htmlFor="scan-employee-number">
                      EMPLOYEE #
                    </label>
                    <input
                      id="scan-employee-number"
                      className="form-control"
                      required
                      autoComplete="off"
                      value={employeeNumber}
                      onChange={(e) => setEmployeeNumber(e.target.value)}
                    />
                  </div>
                  <div className="col-sm-4 d-flex align-items-end">
                    <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                      {busy ? "Checking…" : "Continue"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      {screen === "hub" ? (
        <>
          {context.asset?.outOfService ? (
            <div className="alert alert-danger mt-3" role="alert">
              <strong>OUT OF SERVICE — DO NOT OPERATE</strong>
              {context.asset.outOfServiceReason ? (
                <div className="small mt-1">Reason: {context.asset.outOfServiceReason}</div>
              ) : null}
            </div>
          ) : null}

          {context.asset ? (
            <div className="card border shadow-none mt-3">
              <div className="card-body">
                <h6 className="mb-1">{context.asset.label}</h6>
                {context.asset.sublabel ? (
                  <p className="small text-muted mb-1">{context.asset.sublabel}</p>
                ) : null}
                {context.asset.locationName ? (
                  <p className="small mb-0">Location: {context.asset.locationName}</p>
                ) : null}
                {context.asset.status ? (
                  <span className="badge bg-label-secondary mt-2">{context.asset.status}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {context.description ? (
            <p className="text-muted small mt-3 mb-0">{context.description}</p>
          ) : null}

          {(identify || verifiedEmployee) && (
            <div className="alert alert-light border mt-3 py-2" role="status">
              <div className="small">
                Signed in as <strong>{identify?.displayName ?? "Verified EMPLOYEE"}</strong>
                {identify?.employeeNumber ? ` · #${identify.employeeNumber}` : ""}
                {identify?.departmentName ? ` · ${identify.departmentName}` : ""}
              </div>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 mt-1"
                onClick={switchEmployee}
              >
                Switch EMPLOYEE
              </button>
            </div>
          )}

          {identify?.trainingStatus && identify.trainingStatus.length > 0 ? (
            <div className="card border shadow-none mt-3">
              <div className="card-header">
                <h6 className="mb-0">Required training</h6>
              </div>
              <ul className="list-group list-group-flush">
                {identify.trainingStatus.map((item) => (
                  <li
                    key={item.assignmentId}
                    className="list-group-item d-flex justify-content-between align-items-center gap-2"
                  >
                    <div>
                      <div className="fw-semibold">{item.title}</div>
                      <div className="small text-muted">{item.status.replace(/_/g, " ")}</div>
                    </div>
                    <a className="btn btn-sm btn-outline-primary" href={item.href}>
                      {item.status === "CURRENT" ? "Review" : "Start training"}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="card border shadow-none mt-3">
            <div className="card-header">
              <h6 className="mb-0">
                {hubPanel === "actions"
                  ? "Actions"
                  : hubPanel === "loto"
                    ? "LOTO procedure"
                    : hubPanel === "report_issue"
                      ? "Report an issue"
                      : hubPanel === "history"
                        ? "Equipment history"
                        : hubPanel === "out_of_service"
                          ? "Mark out of service"
                          : hubPanel === "return_to_service"
                            ? "Return to service"
                            : "Inspection"}
              </h6>
            </div>
            <div className="card-body">
              {hubPanel === "actions" ? (
                <div className="d-grid gap-2">
                  {actions.length === 0 ? (
                    <p className="text-muted small mb-0">
                      {context.publicLimited
                        ? "This QR link provides public procedure and issue reporting."
                        : "No actions are available for your access level."}
                    </p>
                  ) : (
                    actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="btn btn-outline-primary text-start"
                        onClick={() => handleAction(action)}
                      >
                        <span className="fw-semibold d-block">{action.label}</span>
                        {action.description ? (
                          <span className="small text-muted">{action.description}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {hubPanel === "loto" ? (
                <div>
                  {lotoDetail ? (
                    <>
                      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                        <h6 className="mb-0">
                          {String(
                            (lotoDetail.procedure as { title?: string } | undefined)?.title ??
                              lotoDetail.title ??
                              "LOTO procedure",
                          )}
                        </h6>
                        <span
                          className={`badge ${lotoStatusBadgeClass(
                            String(
                              (lotoDetail.procedure as { status?: string } | undefined)?.status ??
                                lotoDetail.status ??
                                "",
                            ),
                          )}`}
                        >
                          {lotoStatusLabel(
                            String(
                              (lotoDetail.procedure as { status?: string } | undefined)?.status ??
                                lotoDetail.status ??
                                "",
                            ),
                          )}
                        </span>
                      </div>
                      <LotoProcedureDetailSections display={extractProcedureDisplay(lotoDetail)} />
                    </>
                  ) : (
                    <p className="text-muted small">Loading procedure…</p>
                  )}
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setHubPanel("actions")}
                    >
                      Back to actions
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => setHubPanel("report_issue")}
                    >
                      Report a problem
                    </button>
                  </div>
                </div>
              ) : null}

              {hubPanel === "report_issue" ? (
                <form className="d-grid gap-2" onSubmit={(event) => void submitIssue(event)}>
                  {!allowAnonymousIssue ? (
                    <p className="small text-muted mb-0">
                      Reporting requires a verified EMPLOYEE number on this QR code.
                    </p>
                  ) : (
                    <p className="small text-muted mb-0">
                      Anyone with this QR code can report a problem without signing in.
                    </p>
                  )}
                  <textarea
                    className="form-control"
                    rows={4}
                    required
                    placeholder="Describe the issue"
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                  />
                  <select
                    className="form-select"
                    value={issuePriority}
                    onChange={(e) => setIssuePriority(e.target.value)}
                  >
                    <option value="LOW">Low priority</option>
                    <option value="MEDIUM">Medium priority</option>
                    <option value="HIGH">High priority</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  {!allowAnonymousIssue ? (
                    <label className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={issueOutOfService}
                        onChange={(e) => setIssueOutOfService(e.target.checked)}
                      />
                      <span className="form-check-label small">Mark asset out of service</span>
                    </label>
                  ) : null}
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setHubPanel("actions")}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? "Submitting…" : "Submit issue"}
                    </button>
                  </div>
                </form>
              ) : null}

              {hubPanel === "history" ? (
                <div>
                  {historyItems.length === 0 ? (
                    <p className="text-muted small mb-2">No history records yet.</p>
                  ) : (
                    <ul className="list-unstyled mb-2">
                      {historyItems.map((entry) => (
                        <li key={entry.id} className="border-bottom py-2">
                          <div className="small text-muted">
                            {new Date(entry.at).toLocaleString()}
                            {entry.actorName ? ` · ${entry.actorName}` : ""}
                          </div>
                          <div className="fw-semibold small">{entry.title}</div>
                          {entry.subtitle ? (
                            <div className="small text-muted">{entry.subtitle}</div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setHubPanel("actions")}
                  >
                    Back to actions
                  </button>
                </div>
              ) : null}

              {hubPanel === "out_of_service" ? (
                <form className="d-grid gap-2" onSubmit={(event) => void submitOutOfService(event)}>
                  <textarea
                    className="form-control"
                    rows={3}
                    required
                    placeholder="Reason (required)"
                    value={oosReason}
                    onChange={(e) => setOosReason(e.target.value)}
                  />
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Optional notes"
                    value={oosNotes}
                    onChange={(e) => setOosNotes(e.target.value)}
                  />
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setHubPanel("actions")}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-danger" disabled={busy}>
                      {busy ? "Saving…" : "Mark out of service"}
                    </button>
                  </div>
                </form>
              ) : null}

              {hubPanel === "return_to_service" ? (
                <form
                  className="d-grid gap-2"
                  onSubmit={(event) => void submitReturnToService(event)}
                >
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Verification notes (optional)"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                  />
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setHubPanel("actions")}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-success" disabled={busy}>
                      {busy ? "Saving…" : "Return to service"}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>

          {hubPanel === "inspection" && activeInspection && activeEmployeeNumber ? (
            <ScanInspectionRunner
              token={token}
              employeeNumber={activeEmployeeNumber}
              label={activeInspection.label}
              {...(activeInspection.frequency ? { frequency: activeInspection.frequency } : {})}
              {...(activeInspection.templateId ? { templateId: activeInspection.templateId } : {})}
              onComplete={handleInspectionComplete}
              onCancel={() => {
                setActiveInspection(null);
                setHubPanel("actions");
              }}
            />
          ) : null}

          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => router.push("/scan")}
            >
              Scan another code
            </button>
            <Link href="/modules/scan" className="btn btn-sm btn-link">
              QR management
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScanPublicWorkspaceInner() {
  const params = useParams<{ token?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = resolveScanPublicToken({
    pathname,
    routeToken: typeof params.token === "string" ? params.token : null,
    queryToken: searchParams.get("token"),
  });

  if (!token) {
    return (
      <div className="container py-4" style={{ maxWidth: "720px" }}>
        <h4 className="mb-3">QR Scan</h4>
        <QrCameraScanner
          onToken={(value) => {
            window.location.assign(`/scan/${encodeURIComponent(value)}`);
          }}
          onError={(message) => {
            if (message) console.warn(message);
          }}
        />
      </div>
    );
  }

  return <ScanPublicForm token={token} />;
}

export function ScanPublicWorkspace() {
  return (
    <Suspense
      fallback={
        <div className="container py-4">
          <p className="text-muted">Loading scan…</p>
        </div>
      }
    >
      <ScanPublicWorkspaceInner />
    </Suspense>
  );
}
