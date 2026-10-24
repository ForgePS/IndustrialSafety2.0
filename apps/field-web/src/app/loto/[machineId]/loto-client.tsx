"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { FieldPrintButton } from "@/components/field-print-label";
import { LotoProcedureView } from "@/components/loto-procedure-view";
import { LotoProcedureWorkflowActions } from "@/components/loto-procedure-workflow-actions";
import { useFieldPathname } from "@/hooks/use-field-pathname";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { fieldLotoApi } from "@/lib/loto-api";
import { ensureLotoProcedurePrintQrPayload, lotoProcedurePrintFieldValues } from "@/lib/loto-print";
import {
  canApproveFieldLoto,
  canAuthorFieldLoto,
  canExecuteFieldLoto,
  canViewFieldLoto,
  fieldAuthOpts,
} from "@/lib/field-permissions";
import {
  canIssueLockout,
  checklistFromDisplay,
  extractLockoutSnapshot,
  extractProcedureDisplay,
  isDisplayableLotoImageUrl,
  isOpenLockoutStatus,
  lotoStatusLabel,
  profileDisplayName,
  type FieldLotoLockoutSnapshot,
  type FieldLotoProcedureDisplay,
  type FieldLotoStepItem,
} from "@/lib/loto";

type Phase = "loading" | "picker" | "ready" | "error";

/** Prefer the real browser path when static export params are still "placeholder". */
function resolveLotoRouteId(paramId: string, pathname: string): string {
  const fromParam = paramId.trim();
  if (fromParam && fromParam !== "placeholder") return fromParam;
  const match = pathname.match(/\/loto\/([^/]+)\/?/i);
  const fromPath = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  if (fromPath && fromPath !== "placeholder") return fromPath;
  return "";
}

function checklistStorageKey(procedureId: string): string {
  return `forge.field.loto.checklist.${procedureId}`;
}

function restoreChecklist(procedureId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(checklistStorageKey(procedureId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistChecklist(procedureId: string, checked: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(checklistStorageKey(procedureId), JSON.stringify(checked));
}

function LotoRunnerInner() {
  const params = useParams<{ machineId: string }>();
  const pathname = useFieldPathname();
  const search = useSearchParams();
  const router = useRouter();
  const routeId = resolveLotoRouteId(String(params?.machineId ?? ""), pathname);
  const lockoutIdHint = (search.get("lockoutId") ?? "").trim();

  const { me } = useAuth();
  const { profile } = useFieldProfile();
  const permissions = me?.permissions ?? [];
  const authOpts = fieldAuthOpts(me);
  const canView = canViewFieldLoto(permissions, authOpts);
  const canExecute = canExecuteFieldLoto(permissions, authOpts);
  const canAuthor = canAuthorFieldLoto(permissions, authOpts);
  const canApprove = canApproveFieldLoto(permissions, authOpts);
  const canQr = Boolean(
    me?.permissions?.includes("industrial.qr.view") ||
    me?.permissions?.includes("industrial.qr.manage") ||
    me?.permissions?.includes("industrial.qr.generate") ||
    me?.permissions?.includes("industrial.admin") ||
    authOpts.isPlatformAdmin,
  );

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [display, setDisplay] = useState<FieldLotoProcedureDisplay | null>(null);
  const [candidates, setCandidates] = useState<Array<Record<string, unknown>>>([]);
  const [checklist, setChecklist] = useState<FieldLotoStepItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [authorizedEmployee, setAuthorizedEmployee] = useState("");
  const [affectedEmployees, setAffectedEmployees] = useState("");
  const [lockTagId, setLockTagId] = useState("");
  const [tryStartRequired, setTryStartRequired] = useState(true);
  const [zeroEnergy, setZeroEnergy] = useState(false);
  const [tryStartDone, setTryStartDone] = useState(false);
  const [restorationDone, setRestorationDone] = useState(false);
  const [restorationChecked, setRestorationChecked] = useState<Record<string, boolean>>({});
  const [openLockout, setOpenLockout] = useState<FieldLotoLockoutSnapshot | null>(null);
  const [history, setHistory] = useState<FieldLotoLockoutSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [printFields, setPrintFields] = useState<Record<string, string>>({});

  async function archiveCurrentProcedure() {
    if (!canAuthor || !display?.id) return;
    const ok = window.confirm(
      `Archive procedure "${display.equipmentName}"? It will no longer appear in the active list.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fieldLotoApi.archiveProcedure(display.id);
      router.replace("/more/loto/");
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Unable to archive procedure.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const name = profileDisplayName(profile);
    if (name && !authorizedEmployee) setAuthorizedEmployee(name);
  }, [profile, authorizedEmployee]);

  const allStepsChecked = useMemo(() => {
    if (checklist.length === 0) return true;
    return checklist.every((step) => checked[step.id]);
  }, [checklist, checked]);

  const allRestorationChecked = useMemo(() => {
    if (!display || display.restorationChecks.length === 0) return restorationDone;
    return display.restorationChecks.every((check) => restorationChecked[check.id]);
  }, [display, restorationChecked, restorationDone]);

  const loadProcedure = useCallback(
    async (procedureId: string) => {
      const detail = await fieldLotoApi.getProcedure(procedureId);
      const next = extractProcedureDisplay(detail);
      setDisplay(next);
      const steps = checklistFromDisplay(next);
      setChecklist(steps);
      setChecked(restoreChecklist(procedureId));
      const nested = Array.isArray(detail.lockouts)
        ? (detail.lockouts as Array<Record<string, unknown>>)
        : [];
      const snapshots = nested
        .map((row) => extractLockoutSnapshot(row))
        .filter((row): row is FieldLotoLockoutSnapshot => Boolean(row));
      const open =
        snapshots.find((row) => row.id === lockoutIdHint && isOpenLockoutStatus(row.status)) ||
        snapshots.find((row) => isOpenLockoutStatus(row.status)) ||
        null;
      setOpenLockout(open);
      setHistory(snapshots.filter((row) => !isOpenLockoutStatus(row.status)));
      setPrintFields(
        lotoProcedurePrintFieldValues(
          { ...detail, id: next.id, equipmentName: next.equipmentName, status: next.status },
          next.equipmentName,
        ),
      );
      if (open) {
        setTryStartRequired(open.tryStartRequired);
        if (open.lockTagId) setLockTagId(open.lockTagId);
        if (open.affectedEmployees) setAffectedEmployees(open.affectedEmployees);
      }
      setPhase("ready");
    },
    [lockoutIdHint],
  );

  const bootstrap = useCallback(async () => {
    if (!canView) {
      setPhase("error");
      setError("You do not have permission to view lockout procedures.");
      return;
    }
    if (!routeId || routeId === "placeholder") {
      setPhase("error");
      setError("Scan a LOTO QR or pick a procedure from the list.");
      return;
    }
    setPhase("loading");
    setError(null);
    setNotice(null);
    try {
      await loadProcedure(routeId);
    } catch (err) {
      const notFound = err instanceof ApiError && err.status === 404;
      if (!notFound) {
        setPhase("error");
        setError(err instanceof Error ? err.message : "Unable to load procedure.");
        return;
      }
      try {
        const listed = await fieldLotoApi.listProcedures({
          equipmentId: routeId,
          page: 1,
          pageSize: 50,
        });
        const executable = (listed.items ?? []).filter((row) => canIssueLockout(row.status));
        if (executable.length === 1) {
          const onlyId = String(executable[0]?.id ?? "");
          if (onlyId) {
            router.replace(`/loto/${encodeURIComponent(onlyId)}/`);
            await loadProcedure(onlyId);
            return;
          }
        }
        if (executable.length > 1) {
          setCandidates(executable);
          setPhase("picker");
          return;
        }
        setPhase("error");
        setError("No active LOTO procedure found for this equipment.");
      } catch (listErr) {
        setPhase("error");
        setError(
          listErr instanceof Error ? listErr.message : "Unable to resolve LOTO for this id.",
        );
      }
    }
  }, [canView, routeId, loadProcedure, router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  function toggleStep(id: string, value: boolean) {
    setChecked((prev) => {
      const next = { ...prev, [id]: value };
      if (display?.id) persistChecklist(display.id, next);
      return next;
    });
  }

  async function onIssue() {
    if (!canExecute || !display?.id || !canIssueLockout(display.status)) return;
    if (!authorizedEmployee.trim()) {
      setError("Authorized employee is required.");
      return;
    }
    if (!allStepsChecked) {
      setError("Complete every isolation and verification step before issuing.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const issueBody: {
        authorizedEmployee: string;
        affectedEmployees?: string;
        lockTagId?: string;
        tryStartRequired: boolean;
        zeroEnergyVerified: boolean;
      } = {
        authorizedEmployee: authorizedEmployee.trim(),
        tryStartRequired,
        zeroEnergyVerified: false,
      };
      const tag = lockTagId.trim();
      if (tag) issueBody.lockTagId = tag;
      const affected = affectedEmployees.trim();
      if (affected) issueBody.affectedEmployees = affected;
      const issued = await fieldLotoApi.issue(display.id, issueBody);
      setOpenLockout(extractLockoutSnapshot(issued));
      setZeroEnergy(false);
      setTryStartDone(false);
      setRestorationDone(false);
      setNotice("Lockout issued. Confirm zero energy before work begins.");
      await loadProcedure(display.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to issue lockout.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    if (!canExecute || !openLockout) return;
    const id = openLockout.id;
    if (!id) return;
    if (!zeroEnergy) {
      setError("Confirm zero-energy verification before continuing.");
      return;
    }
    if (openLockout.tryStartRequired && !tryStartDone) {
      setError("Complete the try-start before verifying this lockout.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await fieldLotoApi.verifyLockout(id, {
        zeroEnergyConfirmed: true,
        tryStartCompleted: tryStartDone,
      });
      setOpenLockout(extractLockoutSnapshot(updated));
      setNotice("Lockout verified. Work may proceed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify lockout.");
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    if (!canExecute || !openLockout) return;
    const id = openLockout.id;
    if (!id) return;
    if (!allRestorationChecked) {
      setError("Complete restoration checks before closing the lockout.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await fieldLotoApi.closeLockout(id, { restorationComplete: true });
      setOpenLockout(extractLockoutSnapshot(updated));
      setNotice("Lockout closed. Equipment may be restored.");
      if (display?.id) {
        persistChecklist(display.id, {});
        setChecked({});
        await loadProcedure(display.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to close lockout.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(
    action: "submit-review" | "activate" | "approve" | "request-changes",
    body: Record<string, unknown> = {},
  ) {
    if (!display?.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fieldLotoApi.transition(display.id, action, body);
      const labels: Record<typeof action, string> = {
        "submit-review": "Submitted for EHS review.",
        activate: "Procedure activated.",
        approve: "Procedure approved and activated.",
        "request-changes": "Sent back for corrections.",
      };
      setNotice(labels[action]);
      await loadProcedure(display.id);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Unable to update procedure workflow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openPrintable() {
    if (!display?.id) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fieldLotoApi.printable(display.id);
      const blocked = openPrintableHtmlPopup(data.html, true);
      if (blocked) setError(blocked);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Unable to open printable procedure.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrintQr() {
    if (!display?.id) return;
    try {
      const qr = await ensureLotoProcedurePrintQrPayload(
        {
          id: display.id,
          equipmentName: display.equipmentName,
          title: display.title,
          status: display.status,
          procedureNumber: display.procedureNumber,
        },
        {
          canView: canQr || canView,
          canGenerate: canQr || canAuthor,
        },
      );
      setPrintFields((prev) => ({
        ...prev,
        ...lotoProcedurePrintFieldValues(
          {
            id: display.id,
            equipmentName: display.equipmentName,
            title: display.title,
            status: display.status,
          },
          display.equipmentName,
        ),
        qr: qr.qr,
        qrPayload: qr.qrPayload,
        ...(qr.description ? { description: qr.description } : {}),
      }));
    } catch {
      // Print label still works without QR.
    }
  }

  useEffect(() => {
    if (phase === "ready" && display?.id) {
      void refreshPrintQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when procedure identity changes
  }, [phase, display?.id]);

  if (phase === "loading") {
    return <p className="ff-page-body">Loading LOTO procedure…</p>;
  }

  if (phase === "error") {
    return (
      <>
        <h1 className="ff-page-title">LOTO</h1>
        <p className="ff-error" role="alert">
          {error}
        </p>
        <button type="button" className="ff-btn" onClick={() => router.push("/scan/")}>
          SCAN QR CODE
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => router.push("/more/loto/")}
        >
          Browse procedures
        </button>
      </>
    );
  }

  if (phase === "picker") {
    return (
      <>
        <h1 className="ff-page-title">Choose LOTO</h1>
        <p className="ff-page-body">More than one procedure is linked to this equipment.</p>
        <div className="ff-stack-list">
          {candidates.map((row) => {
            const id = String(row.id ?? "");
            return (
              <button
                key={id}
                type="button"
                className="ff-stack-item"
                onClick={() => router.push(`/loto/${encodeURIComponent(id)}/`)}
              >
                <strong>{String(row.title ?? row.equipmentName ?? id)}</strong>
                <span className="ff-meta">{lotoStatusLabel(row.status)}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (!display) return null;

  const lockoutStatus = openLockout?.status ?? "";
  const open = Boolean(openLockout && isOpenLockoutStatus(lockoutStatus));
  const canVerify = canExecute && open && lockoutStatus.toUpperCase() === "ISSUED";
  const canClose = canExecute && open && lockoutStatus.toUpperCase() === "VERIFIED";
  const issueReady = canExecute && canIssueLockout(display.status) && !open;

  return (
    <>
      <p className="ff-brand-mark">Lockout / Tagout</p>
      <h1 className="ff-page-title">{display.equipmentName}</h1>
      <p className="ff-meta">
        {lotoStatusLabel(display.status)}
        {display.title && display.title !== display.equipmentName ? ` · ${display.title}` : ""}
      </p>
      {!canExecute ? <p className="ff-page-body">View only for lockout issue / close.</p> : null}

      {(canAuthor || canApprove) && display.id ? (
        <section className="ff-section" aria-label="Procedure workflow">
          <LotoProcedureWorkflowActions
            status={display.status}
            busy={busy}
            canEdit={canAuthor}
            canApprove={canApprove}
            onEdit={() => router.push(`/more/loto/new/?id=${encodeURIComponent(display.id)}`)}
            onSubmitForReview={() => void transition("submit-review")}
            onActivate={() => void transition("activate")}
            onApprove={() => void transition("approve")}
            onRequestChanges={(notes) =>
              void transition("request-changes", { reviewReturnNotes: notes })
            }
            extras={
              <>
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  disabled={busy}
                  onClick={() => void openPrintable()}
                >
                  Printable sheet
                </button>
                {canAuthor ? (
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={busy}
                    onClick={() => void archiveCurrentProcedure()}
                  >
                    Archive
                  </button>
                ) : null}
              </>
            }
          />
        </section>
      ) : (
        <div className="ff-action-grid ff-section">
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            disabled={busy}
            onClick={() => void openPrintable()}
          >
            Printable sheet
          </button>
        </div>
      )}

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="ff-success" role="status">
          {notice}
        </p>
      ) : null}

      <LotoProcedureView display={display} />

      <section className="ff-section">
        <h2 className="ff-section-title">Control steps</h2>
        {checklist.length === 0 ? (
          <p className="ff-page-body">No isolation or verification steps saved.</p>
        ) : (
          <div className="ff-stack-list">
            {checklist.map((step) => {
              const label = `${step.stepNumber}. ${step.isVerification ? "Verify" : "Isolate"}: ${step.instruction}`;
              return (
                <label key={step.id} className="ff-check-row" htmlFor={`loto-step-${step.id}`}>
                  <input
                    id={`loto-step-${step.id}`}
                    type="checkbox"
                    aria-label={label}
                    checked={Boolean(checked[step.id])}
                    disabled={open}
                    onChange={(ev) => toggleStep(step.id, ev.target.checked)}
                  />
                  <span>
                    <strong>
                      {step.stepNumber}. {step.isVerification ? "Verify" : "Isolate"}
                    </strong>
                    <span className="ff-meta">{step.instruction}</span>
                    {step.customDescription ? (
                      <span className="ff-meta">Detail: {step.customDescription}</span>
                    ) : null}
                    {isDisplayableLotoImageUrl(step.stepImageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={step.stepImageUrl}
                        alt={`Step ${step.stepNumber}`}
                        style={{
                          display: "block",
                          maxWidth: "100%",
                          height: "auto",
                          marginTop: "0.5rem",
                          borderRadius: "0.5rem",
                        }}
                      />
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {open && openLockout ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Open lockout</h2>
          <p className="ff-page-body">
            {lotoStatusLabel(openLockout.status)}
            {openLockout.authorizedEmployee ? ` · ${openLockout.authorizedEmployee}` : ""}
          </p>
          {openLockout.lockTagId ? (
            <p className="ff-meta">Lock / tag: {openLockout.lockTagId}</p>
          ) : null}
          {openLockout.affectedEmployees ? (
            <p className="ff-meta">Affected: {openLockout.affectedEmployees}</p>
          ) : null}

          {canVerify ? (
            <>
              <label className="ff-check-row">
                <input
                  type="checkbox"
                  checked={zeroEnergy}
                  onChange={(ev) => setZeroEnergy(ev.target.checked)}
                />
                <span>Zero energy confirmed</span>
              </label>
              <label className="ff-check-row">
                <input
                  type="checkbox"
                  checked={tryStartDone}
                  onChange={(ev) => setTryStartDone(ev.target.checked)}
                />
                <span>
                  Try-start completed
                  {openLockout.tryStartRequired ? " (required)" : " (optional)"}
                </span>
              </label>
            </>
          ) : null}

          {canClose ? (
            display.restorationChecks.length > 0 ? (
              <div className="ff-stack-list">
                {display.restorationChecks.map((check) => (
                  <label key={check.id} className="ff-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(restorationChecked[check.id])}
                      onChange={(ev) =>
                        setRestorationChecked((prev) => ({
                          ...prev,
                          [check.id]: ev.target.checked,
                        }))
                      }
                    />
                    <span>{check.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <label className="ff-check-row">
                <input
                  type="checkbox"
                  checked={restorationDone}
                  onChange={(ev) => setRestorationDone(ev.target.checked)}
                />
                <span>Restoration complete / area clear</span>
              </label>
            )
          ) : null}
        </section>
      ) : null}

      {issueReady ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Issue lockout</h2>
          <div className="ff-field">
            <label htmlFor="loto-auth-emp">Authorized employee</label>
            <input
              id="loto-auth-emp"
              className="ff-input"
              value={authorizedEmployee}
              onChange={(ev) => setAuthorizedEmployee(ev.target.value)}
              required
            />
          </div>
          <div className="ff-field">
            <label htmlFor="loto-affected">Affected employees</label>
            <input
              id="loto-affected"
              className="ff-input"
              value={affectedEmployees}
              onChange={(ev) => setAffectedEmployees(ev.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="ff-field">
            <label htmlFor="loto-lock-tag">Lock / tag ID</label>
            <input
              id="loto-lock-tag"
              className="ff-input"
              value={lockTagId}
              onChange={(ev) => setLockTagId(ev.target.value)}
              placeholder="Optional"
            />
          </div>
          <label className="ff-check-row">
            <input
              type="checkbox"
              checked={tryStartRequired}
              onChange={(ev) => setTryStartRequired(ev.target.checked)}
            />
            <span>Try-start required after isolation</span>
          </label>
        </section>
      ) : null}

      {issueReady || canVerify || canClose ? (
        <div className="ff-sticky-cta">
          {issueReady ? (
            <button
              type="button"
              className="ff-btn"
              disabled={busy || !allStepsChecked || !authorizedEmployee.trim()}
              onClick={() => void onIssue()}
            >
              Issue lockout
            </button>
          ) : null}
          {canVerify ? (
            <button
              type="button"
              className="ff-btn"
              disabled={
                busy || !zeroEnergy || Boolean(openLockout?.tryStartRequired && !tryStartDone)
              }
              onClick={() => void onVerify()}
            >
              Verify lockout
            </button>
          ) : null}
          {canClose ? (
            <button
              type="button"
              className="ff-btn"
              disabled={busy || !allRestorationChecked}
              onClick={() => void onClose()}
            >
              Close lockout
            </button>
          ) : null}
        </div>
      ) : null}

      {!canIssueLockout(display.status) && !open ? (
        <p className="ff-page-body">
          This procedure is {lotoStatusLabel(display.status)}. Only active or approved procedures
          can be issued from Field.
        </p>
      ) : null}

      {history.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Lockout history</h2>
          <ul className="ff-plain-list">
            {history.map((row) => (
              <li key={row.id}>
                <strong>{lotoStatusLabel(row.status)}</strong>
                {row.authorizedEmployee ? ` · ${row.authorizedEmployee}` : ""}
                {row.lockTagId ? ` · ${row.lockTagId}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {display.id ? (
        <section className="ff-section" aria-label="Print">
          <h2 className="ff-section-title">Print</h2>
          <FieldPrintButton
            module="LOCKOUT_TAGOUT"
            recordType="loto_procedure"
            recordId={display.id}
            title={display.equipmentName}
            fieldValues={printFields}
            widthInches={2}
            heightInches={1}
          />
        </section>
      ) : null}
    </>
  );
}

export function LotoClient() {
  return (
    <Suspense fallback={<p className="ff-page-body">Loading…</p>}>
      <LotoRunnerInner />
    </Suspense>
  );
}
