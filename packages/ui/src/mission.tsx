"use client";

import { useState, type ReactNode } from "react";

export type TimelineItem = {
  id: string;
  title: string;
  detail?: string;
  at?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

export function ActivityTimeline({
  items,
  emptyLabel = "No activity yet.",
}: {
  items: TimelineItem[];
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <p className="forge-muted">{emptyLabel}</p>;
  }
  return (
    <ol className="forge-timeline">
      {items.map((item) => (
        <li
          key={item.id}
          className={`forge-timeline__item forge-timeline__item--${item.tone ?? "neutral"}`}
        >
          <div className="forge-timeline__marker" aria-hidden />
          <div className="forge-timeline__content">
            <p className="forge-timeline__title">{item.title}</p>
            {item.detail ? <p className="forge-timeline__detail">{item.detail}</p> : null}
            {item.at ? <time className="forge-timeline__at">{item.at}</time> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export const AuditTimeline = ActivityTimeline;

export function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className={`forge-avatar forge-avatar--${size}`} title={name} aria-label={name}>
      {initials || "?"}
    </span>
  );
}

export function TenantAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <UserAvatar name={name} size={size} />;
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="forge-form-field">
      <span className="forge-form-field__label">
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </span>
      <input
        id={id}
        type="date"
        className="forge-input"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function MultiSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="forge-multiselect">
      <legend className="forge-form-field__label">{label}</legend>
      <div className="forge-multiselect__options">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="forge-multiselect__option"
              htmlFor={`${id}-${opt.value}`}
            >
              <input
                id={`${id}-${opt.value}`}
                type="checkbox"
                checked={checked}
                onChange={() => {
                  onChange(checked ? value.filter((v) => v !== opt.value) : [...value, opt.value]);
                }}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FileUploader({
  id,
  label,
  accept,
  onSelect,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  accept?: string;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="forge-file-uploader">
      <label htmlFor={id} className="forge-form-field__label">
        {label}
      </label>
      <input
        id={id}
        type="file"
        className="forge-input"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      {hint ? <p className="forge-form-field__hint">{hint}</p> : null}
    </div>
  );
}

export type ForgeAssetUploaderProps = {
  id: string;
  label: string;
  accept?: string;
  disabled?: boolean;
  hint?: string;
  maxBytes?: number;
  previewUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  uploading?: boolean;
  progress?: number | null;
  error?: string | null;
  onSelect: (file: File | null) => void;
  onRemove?: () => void;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Business-friendly drag/drop asset uploader. Callers upload via Forge APIs —
 * this component never asks for S3/CloudFront URLs.
 */
export function ForgeAssetUploader({
  id,
  label,
  accept = "image/png,image/jpeg,image/webp,image/svg+xml",
  disabled,
  hint = "PNG, JPG, or WEBP up to 5 MB. Drag a file here or browse.",
  maxBytes = 5_000_000,
  previewUrl,
  fileName,
  fileSize,
  uploading,
  progress,
  error,
  onSelect,
  onRemove,
}: ForgeAssetUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function acceptFile(file: File | null) {
    setLocalError(null);
    if (!file) {
      onSelect(null);
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      setLocalError(`This file exceeds the allowed upload size (${formatBytes(maxBytes)}).`);
      onSelect(null);
      return;
    }
    onSelect(file);
  }

  return (
    <div className="forge-asset-uploader">
      <label htmlFor={id} className="forge-form-field__label">
        {label}
      </label>
      <div
        className={`forge-asset-uploader__drop${dragOver ? " forge-asset-uploader__drop--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled) return;
          acceptFile(event.dataTransfer.files?.[0] ?? null);
        }}
        style={{
          border: "1px dashed var(--forge-color-border, #cbd5e0)",
          borderRadius: "0.75rem",
          padding: "1rem",
          background: dragOver ? "rgba(49, 130, 206, 0.08)" : "transparent",
        }}
      >
        {previewUrl ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <img
              src={previewUrl}
              alt="Upload preview"
              style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 8 }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{fileName ?? "Uploaded file"}</p>
              {typeof fileSize === "number" ? (
                <p className="forge-muted" style={{ margin: "0.25rem 0 0" }}>
                  {formatBytes(fileSize)}
                </p>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <label
                className="forge-button forge-button--secondary"
                htmlFor={id}
                style={{ cursor: "pointer" }}
              >
                Replace
              </label>
              {onRemove ? (
                <button
                  type="button"
                  className="forge-button forge-button--secondary"
                  onClick={onRemove}
                  disabled={disabled}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Drag and drop a file here</p>
            <p className="forge-muted" style={{ margin: "0.35rem 0 0.75rem" }}>
              or
            </p>
            <label
              className="forge-button"
              htmlFor={id}
              style={{ cursor: disabled ? "not-allowed" : "pointer" }}
            >
              Browse files
            </label>
          </div>
        )}
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          style={{ display: "none" }}
          onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {uploading ? (
        <p className="forge-muted" style={{ marginTop: "0.5rem" }}>
          Uploading{typeof progress === "number" ? `… ${Math.round(progress)}%` : "…"}
        </p>
      ) : null}
      {localError || error ? (
        <p
          className="forge-form-field__error"
          role="alert"
          style={{ color: "var(--forge-color-danger, #c53030)" }}
        >
          {localError ?? error}
        </p>
      ) : null}
      {hint ? <p className="forge-form-field__hint">{hint}</p> : null}
    </div>
  );
}

export type PermissionMatrixCell = {
  roleId: string;
  permissionId: string;
  granted: boolean;
};

export function PermissionMatrix({
  roles,
  permissions,
  cells,
  onToggle,
  readOnly,
  emptyLabel = "No permissions to display.",
}: {
  roles: Array<{ id: string; label: string }>;
  permissions: Array<{ id: string; label: string }>;
  cells: PermissionMatrixCell[];
  onToggle?: (roleId: string, permissionId: string, next: boolean) => void;
  readOnly?: boolean;
  emptyLabel?: string;
}) {
  if (!roles.length || !permissions.length) {
    return <p className="forge-muted">{emptyLabel}</p>;
  }
  const lookup = new Map(cells.map((c) => [`${c.roleId}:${c.permissionId}`, c.granted]));
  return (
    <div className="forge-permission-matrix" role="grid" aria-label="Permission matrix">
      <table>
        <thead>
          <tr>
            <th scope="col">Permission</th>
            {roles.map((r) => (
              <th key={r.id} scope="col">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.label}</th>
              {roles.map((r) => {
                const granted = lookup.get(`${r.id}:${p.id}`) ?? false;
                return (
                  <td key={`${r.id}:${p.id}`}>
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={readOnly || !onToggle}
                      aria-label={`${r.label}: ${p.label}`}
                      onChange={() => onToggle?.(r.id, p.id, !granted)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComingLater({ children = "Coming later" }: { children?: ReactNode }) {
  return <p className="forge-coming-later">{children}</p>;
}
