"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@forge/web-kit";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { LotoProcedureView } from "@/components/loto-procedure-view";
import {
  fetchPublicLotoProcedure,
  fetchScanActions,
  fetchScanContext,
  identifyScanEmployee,
  reportScanIssue,
} from "@/lib/scan-api";
import { extractProcedureDisplay, lotoStatusLabel } from "@/lib/loto";
import {
  describeScanFailure,
  filterClientScanActions,
  isInlineScanAction,
  pickPrimaryScanAction,
  pushRecentScan,
  readStoredScanEmployee,
  writeStoredScanEmployee,
  type ScanAction,
  type ScanPublicContext,
} from "@/lib/scan-public";
import {
  fieldHrefForScanAction,
  hubPathForTarget,
  isOrgContextTarget,
  resourceTitle,
  targetTypeLabel,
} from "@/lib/scan-routes";

type Screen = "loading" | "gate" | "hub" | "loto" | "report" | "error";

export function ScanResultHub({ token }: { token: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const org = useFieldOrgOptional();
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);

  const [screen, setScreen] = useState<Screen>("loading");
  const [context, setContext] = useState<ScanPublicContext | null>(null);
  const [actions, setActions] = useState<ScanAction[]>([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [contextApplied, setContextApplied] = useState(false);
  const [lotoDetail, setLotoDetail] = useState<Record<string, unknown> | null>(null);

  const storedEmployee = readStoredScanEmployee(token);

  const applyOrgFromContext = useCallback(
    (ctx: ScanPublicContext) => {
      if (!org || !isOrgContextTarget(ctx.targetType) || !ctx.targetId) return;
      const type = String(ctx.targetType ?? "").toUpperCase().replace(/-/g, "_");
      const kind =
        type === "DIVISION" ? "division" : type === "DEPARTMENT" ? "department" : "location";
      org.applyScanOrgContext({
        locationId: ctx.targetId,
        locationName: ctx.asset?.locationName || ctx.asset?.label || ctx.name,
        divisionName: type === "DIVISION" ? ctx.name : null,
        departmentId: type === "DEPARTMENT" ? ctx.targetId : null,
        departmentName: type === "DEPARTMENT" ? ctx.name : null,
        kind,
      });
      setContextApplied(true);
    },
    [org],
  );

  const loadLotoProcedure = useCallback(async () => {
    const payload = await fetchPublicLotoProcedure(token);
    setLotoDetail(payload.detail ?? (payload as unknown as Record<string, unknown>));
    setScreen("loto");
  }, [token]);

  const load = useCallback(async () => {
    setScreen("loading");
    setError(null);
    try {
      const ctx = await fetchScanContext(token);
      setContext(ctx);
      pushRecentScan({
        token,
        label: ctx.asset?.label || ctx.name,
        targetType: ctx.targetType ?? null,
        targetId: ctx.targetId ?? null,
      });
      applyOrgFromContext(ctx);

      const needsGate =
        (ctx.requiresSignIn && !me) ||
        (ctx.requiresEmployeeNumber && !storedEmployee && !me);

      if (needsGate) {
        setScreen("gate");
        setActions(ctx.actions ?? []);
        return;
      }

      const refreshed = await fetchScanActions(token, {
        ...(storedEmployee ? { employeeNumber: storedEmployee } : {}),
      });
      const filtered = filterClientScanActions(refreshed.actions, {
        verifiedEmployee: refreshed.verifiedEmployee || Boolean(me),
        permissions,
      });
      setActions(filtered);

      // DOT vehicle stickers should open the DVIR form immediately.
      const primary = pickPrimaryScanAction(filtered);
      if (
        primary &&
        (primary.id === "dvir_pre_trip" || primary.id === "dvir_post_trip") &&
        !ctx.asset?.outOfService
      ) {
        router.replace(
          fieldHrefForScanAction(primary, {
            targetType: ctx.targetType ?? null,
            targetId: ctx.targetId ?? null,
            qrLinkId: ctx.qrLinkId,
            scanToken: token,
          }),
        );
        return;
      }

      // Match industrial-web: public LOTO stickers open the procedure without sign-in.
      if (
        ctx.publicLimited &&
        String(ctx.targetType ?? "").toUpperCase() === "LOTO_PROCEDURE"
      ) {
        try {
          await loadLotoProcedure();
          return;
        } catch {
          // Hub still usable for report-issue even if procedure payload fails.
        }
      }

      setScreen("hub");
    } catch (err) {
      setError(describeScanFailure(err));
      setScreen("error");
    }
  }, [token, me, permissions, storedEmployee, applyOrgFromContext, router, loadLotoProcedure]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onIdentify(event: FormEvent) {
    event.preventDefault();
    const value = employeeNumber.trim();
    if (!value) {
      setError("Enter your employee number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await identifyScanEmployee(token, value);
      writeStoredScanEmployee(token, value);
      await load();
    } catch (err) {
      setError(describeScanFailure(err) || "Could not verify employee number.");
    } finally {
      setBusy(false);
    }
  }

  function runAction(action: ScanAction) {
    if (!context) return;
    if (action.id === "open_loto") {
      setBusy(true);
      setError(null);
      void loadLotoProcedure()
        .catch((err) => setError(describeScanFailure(err) || "Could not load LOTO procedure."))
        .finally(() => setBusy(false));
      return;
    }
    if (action.kind === "report_issue") {
      setScreen("report");
      return;
    }
    if (isInlineScanAction(action) && action.kind !== "start_inspection") {
      if (action.kind === "view_history") {
        if (!me) {
          setError("Sign in to view equipment history.");
          return;
        }
        router.push(
          `/equipment/${encodeURIComponent(context.targetId ?? "unknown")}/?tab=history`,
        );
        return;
      }
    }
    const href = fieldHrefForScanAction(action, { ...context, scanToken: token });
    // Authenticated module deep-links require Cognito — keep anonymous users on the scan hub.
    if (!me && (href.startsWith("/loto/") || href.startsWith("/more/loto"))) {
      setBusy(true);
      setError(null);
      void loadLotoProcedure()
        .catch((err) => setError(describeScanFailure(err) || "Could not load LOTO procedure."))
        .finally(() => setBusy(false));
      return;
    }
    router.push(href);
  }

  function openPrimaryResource() {
    if (!context) return;
    if (String(context.targetType ?? "").toUpperCase() === "LOTO_PROCEDURE") {
      setBusy(true);
      setError(null);
      void loadLotoProcedure()
        .catch((err) => setError(describeScanFailure(err) || "Could not load LOTO procedure."))
        .finally(() => setBusy(false));
      return;
    }
    if (!me) {
      setError("Sign in to open this record in Field.");
      return;
    }
    router.push(hubPathForTarget(context.targetType, context.targetId));
  }

  async function submitIssue(event: FormEvent) {
    event.preventDefault();
    const employee = storedEmployee || employeeNumber.trim();
    const allowAnonymous = Boolean(context?.publicLimited);
    if (!allowAnonymous && !employee) {
      setError("Employee number is required to report an issue.");
      return;
    }
    if (!issueText.trim()) {
      setError("Describe the problem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportScanIssue(token, {
        ...(employee ? { employeeNumber: employee } : {}),
        description: issueText.trim(),
        title: "Field reported problem",
      });
      setScreen("hub");
      setIssueText("");
      setError(null);
      setSuccessMessage("Problem reported. Supervisors have been notified.");
    } catch (err) {
      setError(describeScanFailure(err) || "Could not submit the report.");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "loading") {
    return <LoadingState label="Looking up QR code…" />;
  }

  if (screen === "error") {
    return (
      <ErrorState
        title="Scan failed"
        message={error ?? "We couldn't read this QR code."}
        onRetry={() => void load()}
      />
    );
  }

  if (screen === "gate" && context) {
    return (
      <>
        <h1 className="ff-page-title">{resourceTitle(context)}</h1>
        <p className="ff-page-body">Enter your employee number to continue.</p>
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={onIdentify}>
          <div className="ff-field">
            <label htmlFor="scan-emp">Employee number</label>
            <input
              id="scan-emp"
              className="ff-input"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              autoComplete="username"
            />
          </div>
          <button type="submit" className="ff-btn" disabled={busy}>
            Continue
          </button>
        </form>
      </>
    );
  }

  if (screen === "loto" && context) {
    const display = extractProcedureDisplay(lotoDetail);
    const status =
      String(
        (lotoDetail?.procedure as { status?: string } | undefined)?.status ??
          lotoDetail?.status ??
          display.status ??
          "",
      ) || "";
    return (
      <>
        <p className="ff-brand-mark">{context.displayCode || "LOTO"}</p>
        <h1 className="ff-page-title">{display.title || resourceTitle(context)}</h1>
        {status ? <p className="ff-meta">{lotoStatusLabel(status)}</p> : null}
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        {lotoDetail ? (
          <LotoProcedureView display={display} />
        ) : (
          <LoadingState label="Loading LOTO procedure…" />
        )}
        <div className="ff-action-grid" style={{ marginTop: "1rem" }}>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setScreen("hub")}>
            Back to actions
          </button>
          <button type="button" className="ff-btn" onClick={() => setScreen("report")}>
            Report a problem
          </button>
        </div>
      </>
    );
  }

  if (screen === "report" && context) {
    return (
      <>
        <h1 className="ff-page-title">Report problem</h1>
        <p className="ff-page-body">{resourceTitle(context)}</p>
        {context.publicLimited ? (
          <p className="ff-page-body">You can report a problem without signing in.</p>
        ) : null}
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={submitIssue}>
          <div className="ff-field">
            <label htmlFor="issue">What is wrong?</label>
            <textarea
              id="issue"
              className="ff-input"
              style={{ minHeight: 120, padding: 14, width: "100%" }}
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
            />
          </div>
          <button type="submit" className="ff-btn" disabled={busy}>
            Submit
          </button>
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => setScreen(lotoDetail ? "loto" : "hub")}
          >
            Cancel
          </button>
        </form>
      </>
    );
  }

  if (!context) return null;

  const title = resourceTitle(context);
  const oos = Boolean(context.asset?.outOfService);
  const primary = pickPrimaryScanAction(actions);
  const secondary = actions.filter((a) => a.id !== primary?.id);
  const typeLabel = targetTypeLabel(context.targetType);

  return (
    <>
      <p className="ff-brand-mark">{context.displayCode || typeLabel}</p>
      <h1 className="ff-page-title">{title}</h1>
      {context.asset?.sublabel ? <p className="ff-meta">{context.asset.sublabel}</p> : null}
      <p className="ff-meta">
        {[context.asset?.status, context.asset?.locationName, context.companyName]
          .filter(Boolean)
          .join(" · ") || " "}
      </p>

      {contextApplied ? (
        <p className="ff-success" role="status">
          Working context updated for this {typeLabel.toLowerCase()}.
        </p>
      ) : null}

      {successMessage ? (
        <p className="ff-success" role="status">
          {successMessage}
        </p>
      ) : null}

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {oos ? (
        <div className="ff-oos" role="status">
          <strong>OUT OF SERVICE</strong>
          <span>{context.asset?.outOfServiceReason || "Do not operate this equipment."}</span>
        </div>
      ) : null}

      {primary?.kind === "start_inspection" ? (
        <div className="ff-due-card">
          <strong>
            {primary.frequency === "DAILY" ? "Daily inspection required" : "Inspection due"}
          </strong>
          <p>{primary.description || "Complete the inspection before operating."}</p>
          <button type="button" className="ff-btn" onClick={() => runAction(primary)}>
            START INSPECTION
          </button>
        </div>
      ) : primary ? (
        <button type="button" className="ff-scan-hero" onClick={() => runAction(primary)} disabled={busy}>
          {primary.label.toUpperCase()}
        </button>
      ) : (
        <button type="button" className="ff-scan-hero" onClick={openPrimaryResource} disabled={busy}>
          OPEN {typeLabel.toUpperCase()}
        </button>
      )}

      <section className="ff-section" aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="ff-section-title">
          Quick actions
        </h2>
        <div className="ff-action-grid">
          {secondary.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ff-action-tile"
              onClick={() => runAction(action)}
              disabled={busy}
            >
              {action.label}
              {action.description ? <span>{action.description}</span> : null}
            </button>
          ))}
          {!primary && secondary.length === 0 ? (
            <EmptyState
              title="No actions available"
              message="Your role may not have permissions for this resource, or open the record directly."
            />
          ) : null}
        </div>
      </section>

      <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/scan/")}>
        Scan another
      </button>
    </>
  );
}
