"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";

type PhotoMarkupSettings = {
  enabled: boolean;
  allowFreehand: boolean;
  allowSafetyIcons: boolean;
  allowText: boolean;
  allowBlur: boolean;
  allowRedaction: boolean;
  allowCrop: boolean;
  defaultColor: string;
  defaultStroke: "thin" | "medium" | "thick" | "extra";
  keepRevisionHistory: boolean;
  createRenderedCopy: boolean;
  defaultReportImage: "original" | "marked_if_available" | "both" | "ask";
};

const DEFAULTS: PhotoMarkupSettings = {
  enabled: true,
  allowFreehand: true,
  allowSafetyIcons: true,
  allowText: true,
  allowBlur: true,
  allowRedaction: true,
  allowCrop: true,
  defaultColor: "#DC2626",
  defaultStroke: "medium",
  keepRevisionHistory: true,
  createRenderedCopy: true,
  defaultReportImage: "marked_if_available",
};

export function PhotoMarkupSettingsPanel() {
  const [settings, setSettings] = useState<PhotoMarkupSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<PhotoMarkupSettings>("/api/v1/industrial/settings/photo-markup");
      setSettings({ ...DEFAULTS, ...data });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load photo markup settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const data = await apiSend<PhotoMarkupSettings>(
        "/api/v1/industrial/settings/photo-markup",
        "PUT",
        settings,
      );
      setSettings({ ...DEFAULTS, ...data });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  function toggle<K extends keyof PhotoMarkupSettings>(key: K, value: PhotoMarkupSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (loading) {
    return <p className="text-muted">Loading photo markup settings…</p>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">Photo Markup</h5>
        <p className="text-muted small mb-0">
          Non-destructive markup for Forge photos. Originals are always retained.
        </p>
      </div>
      <div className="card-body">
        {error ? <div className="alert alert-warning py-2">{error}</div> : null}
        {saved ? <div className="alert alert-success py-2">Settings saved.</div> : null}

        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="pm-enabled"
            checked={settings.enabled}
            onChange={(e) => toggle("enabled", e.target.checked)}
          />
          <label className="form-check-label" htmlFor="pm-enabled">
            Enable Photo Markup
          </label>
        </div>

        <h6 className="text-uppercase text-muted small">Tools</h6>
        {(
          [
            ["allowFreehand", "Allow freehand drawing"],
            ["allowSafetyIcons", "Allow safety icons"],
            ["allowText", "Allow text"],
            ["allowBlur", "Allow blur"],
            ["allowRedaction", "Allow redaction"],
            ["allowCrop", "Allow crop"],
          ] as const
        ).map(([key, label]) => (
          <div className="form-check mb-2" key={key}>
            <input
              className="form-check-input"
              type="checkbox"
              id={`pm-${key}`}
              checked={settings[key]}
              disabled={!settings.enabled}
              onChange={(e) => toggle(key, e.target.checked)}
            />
            <label className="form-check-label" htmlFor={`pm-${key}`}>
              {label}
            </label>
          </div>
        ))}

        <div className="row g-3 mt-2">
          <div className="col-md-4">
            <label className="form-label" htmlFor="pm-color">
              Default markup color
            </label>
            <input
              id="pm-color"
              type="color"
              className="form-control form-control-color"
              value={settings.defaultColor}
              disabled={!settings.enabled}
              onChange={(e) => toggle("defaultColor", e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="pm-stroke">
              Default stroke width
            </label>
            <select
              id="pm-stroke"
              className="form-select"
              value={settings.defaultStroke}
              disabled={!settings.enabled}
              onChange={(e) =>
                toggle("defaultStroke", e.target.value as PhotoMarkupSettings["defaultStroke"])
              }
            >
              <option value="thin">Thin</option>
              <option value="medium">Medium</option>
              <option value="thick">Thick</option>
              <option value="extra">Extra thick</option>
            </select>
          </div>
        </div>

        <h6 className="text-uppercase text-muted small mt-4">Storage</h6>
        <div className="form-check mb-2">
          <input className="form-check-input" type="checkbox" id="pm-original" checked disabled />
          <label className="form-check-label" htmlFor="pm-original">
            Save original (required)
          </label>
        </div>
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="pm-rendered"
            checked={settings.createRenderedCopy}
            disabled={!settings.enabled}
            onChange={(e) => toggle("createRenderedCopy", e.target.checked)}
          />
          <label className="form-check-label" htmlFor="pm-rendered">
            Create rendered copy
          </label>
        </div>
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="pm-history"
            checked={settings.keepRevisionHistory}
            disabled={!settings.enabled}
            onChange={(e) => toggle("keepRevisionHistory", e.target.checked)}
          />
          <label className="form-check-label" htmlFor="pm-history">
            Keep revision history
          </label>
        </div>

        <h6 className="text-uppercase text-muted small mt-4">Default report image</h6>
        {(
          [
            ["original", "Original"],
            ["marked_if_available", "Marked if available"],
            ["both", "Include both"],
            ["ask", "Ask when generating report"],
          ] as const
        ).map(([value, label]) => (
          <div className="form-check mb-2" key={value}>
            <input
              className="form-check-input"
              type="radio"
              name="pm-report"
              id={`pm-report-${value}`}
              checked={settings.defaultReportImage === value}
              disabled={!settings.enabled}
              onChange={() => toggle("defaultReportImage", value)}
            />
            <label className="form-check-label" htmlFor={`pm-report-${value}`}>
              {label}
            </label>
          </div>
        ))}

        <div className="mt-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
