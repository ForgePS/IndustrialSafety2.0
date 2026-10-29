import type { ReactNode } from "react";
import type { MalwareVerdict } from "../types.js";

export function ImportStatusBadge({ status }: { status: string }) {
  return (
    <span className="forge-ic-badge" role="status" aria-label={`Import status ${status}`}>
      <span aria-hidden="true">●</span>
      {status}
    </span>
  );
}

export function MalwareVerdictBadge({ verdict }: { verdict: MalwareVerdict | string }) {
  const tone =
    verdict === "CLEAN" || verdict === "OVERRIDE_APPROVED"
      ? "success"
      : verdict === "QUARANTINED" || verdict === "INFECTED" || verdict === "SUSPICIOUS"
        ? "danger"
        : "muted";
  return (
    <span
      className={`forge-ic-badge forge-ic-badge--${tone}`}
      role="status"
      aria-label={`Malware verdict ${verdict}`}
    >
      <span aria-hidden="true">{verdict === "CLEAN" ? "✓" : "!"}</span>
      {verdict}
    </span>
  );
}

export function DuplicateConfidenceBadge({
  confidence,
  band,
}: {
  confidence: number;
  band?: string;
}) {
  const label = band ?? (confidence >= 0.85 ? "HIGH" : confidence >= 0.6 ? "MEDIUM" : "LOW");
  return (
    <span className="forge-ic-badge" role="status" aria-label={`Duplicate confidence ${label}`}>
      {label} ({Math.round(confidence * 100)}%)
    </span>
  );
}

export function SensitiveValue({
  value,
  sensitive,
  privileged,
  neverReturnable,
}: {
  value: unknown;
  sensitive?: boolean;
  privileged?: boolean;
  neverReturnable?: boolean;
}) {
  const text = value == null ? "—" : String(value);
  return (
    <span
      data-sensitive={sensitive ? "true" : undefined}
      data-privileged={privileged ? "true" : undefined}
      data-never-returnable={neverReturnable ? "true" : undefined}
      title={
        neverReturnable
          ? "Never-returnable credential"
          : sensitive
            ? "Sensitive (masked)"
            : undefined
      }
    >
      {text}
      {sensitive ? (
        <span className="forge-ic-sensitive-tag">
          {neverReturnable ? "[SECRET]" : privileged ? "[PRIVILEGED]" : "[MASKED]"}
        </span>
      ) : null}
    </span>
  );
}

export function PrivilegedAccessBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div role="status" className="forge-ic-banner forge-ic-banner--danger">
      <span className="forge-ic-banner-icon" aria-hidden="true">
        !
      </span>
      <div className="forge-ic-banner-body">
        <strong className="forge-ic-banner-title">Privileged access active</strong>
        <p className="forge-ic-banner-text">
          Credentials and secrets remain non-returnable. Do not copy values into tickets or chat.
        </p>
      </div>
    </div>
  );
}

const PRODUCTION_LIKE = new Set([
  "staging",
  "production",
  "govcloud-staging",
  "govcloud-production",
]);

export function isProductionLikeImportEnv(appEnv?: string | null): boolean {
  return Boolean(appEnv && PRODUCTION_LIKE.has(appEnv));
}

/** True when production-like env still uses the reference (blocked) scanner. */
export function isProductionImportUploadBlocked(input: {
  appEnv?: string | null | undefined;
  malwareProviderKey?: string | null | undefined;
}): boolean {
  if (!isProductionLikeImportEnv(input.appEnv)) return false;
  const key = (input.malwareProviderKey ?? "reference-malware").trim() || "reference-malware";
  return key === "reference-malware";
}

/** Outcome B production restriction banner — not dismissible; admins cannot bypass. */
export function ProductionScannerRestrictionBanner({
  appEnv,
  malwareProviderKey,
}: {
  appEnv?: string | null;
  /** When a production-grade provider is configured, banner is hidden. */
  malwareProviderKey?: string | null;
}) {
  if (!isProductionImportUploadBlocked({ appEnv, malwareProviderKey })) return null;
  return (
    <div role="alert" className="forge-ic-banner forge-ic-banner--warning">
      <span className="forge-ic-banner-icon" aria-hidden="true">
        !
      </span>
      <div className="forge-ic-banner-body">
        <strong className="forge-ic-banner-title">Production import restriction</strong>
        <p className="forge-ic-banner-text">
          Untrusted file imports are blocked until a production-grade malware scanner is configured.
          The reference scanner is development/test only. Administrators cannot bypass this control.
        </p>
      </div>
    </div>
  );
}

export function ImportEmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="forge-ic-empty">
      <p className="forge-ic-empty-title">{title}</p>
      {children}
    </div>
  );
}

export function ImportProgressBar({ percent, label }: { percent: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Import progress"}
      className="forge-ic-progress"
    >
      <div className="forge-ic-progress-bar" style={{ width: `${safe}%` }} />
    </div>
  );
}
