"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { executiveWalkthroughApi } from "@/features/executive-walkthrough/api";
import type { WalkthroughSettings } from "@/features/executive-walkthrough/types";
import {
  DEFAULT_WALKTHROUGH_VOICE,
  WALKTHROUGH_VOICE_OPTIONS,
} from "@/features/executive-walkthrough/voices";
import { canAccessExecutiveWalkthrough } from "@/lib/platform-admin";

export default function SettingsPresentationPage() {
  const { me, loading: authLoading } = useAuth();
  const canAccess = canAccessExecutiveWalkthrough(me);
  const canEdit =
    Boolean(me?.isPlatformAdmin) ||
    (me?.activeProducts ?? []).includes("FORGE_CREATOR") ||
    Boolean(me?.permissions?.includes("industrial.admin")) ||
    Boolean(me?.permissions?.includes("industrial.presentation.executive.manage"));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<WalkthroughSettings | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!canAccess) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void executiveWalkthroughApi
      .getSettings()
      .then((row) => {
        if (!cancelled) setSettings(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, canAccess]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings || !canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await executiveWalkthroughApi.updateSettings(settings);
      setSettings(saved);
      setMessage("Presentation settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save settings");
    } finally {
      setBusy(false);
    }
  }

  if (!authLoading && !canAccess) {
    return (
      <div className="alert alert-secondary" role="status">
        Executive Walkthrough is only available on the Forge Platform demo tenant.
      </div>
    );
  }

  return (
    <div data-walkthrough="tenant-settings">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="mb-1">Forge Industrial Safety Walkthrough</h4>
          <p className="text-muted mb-0">
            Launch the Complete Platform Overview presentation and manage export defaults. Prefer{" "}
            <a href="/admin/walkthrough-studio/">Walkthrough Studio</a> for narration, demo reset,
            and share links. Target runtime is under ten minutes.
          </p>
        </div>
        <a className="btn btn-primary" href="/demo/industrial/">
          Launch Walkthrough
        </a>
      </div>

      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {settings ? (
        <form className="card" onSubmit={onSubmit}>
          <div className="card-body row g-3">
            <div className="col-12 form-check">
              <input
                id="ew-enabled"
                className="form-check-input"
                type="checkbox"
                checked={settings.enabled}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="ew-enabled">
                Presentation enabled
              </label>
            </div>
            <div className="col-md-6">
              <label className="form-label">Voice</label>
              <select
                className="form-select"
                value={settings.voiceId}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, voiceId: e.target.value })}
              >
                {WALKTHROUGH_VOICE_OPTIONS.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} — {voice.hint}
                  </option>
                ))}
                {!WALKTHROUGH_VOICE_OPTIONS.some((v) => v.id === settings.voiceId) ? (
                  <option value={settings.voiceId}>{settings.voiceId}</option>
                ) : null}
              </select>
              <div className="form-text">
                Default {DEFAULT_WALKTHROUGH_VOICE}. Uses Polly generative speech when available.
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Narration speed (%)</label>
              <input
                type="number"
                min={80}
                max={120}
                className="form-control"
                value={settings.narrationSpeed}
                disabled={!canEdit}
                onChange={(e) =>
                  setSettings({ ...settings, narrationSpeed: Number(e.target.value) || 100 })
                }
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Export resolution</label>
              <select
                className="form-select"
                value={settings.exportResolution}
                disabled={!canEdit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exportResolution: e.target.value as "1080p" | "720p",
                  })
                }
              >
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Retain exports (days)</label>
              <input
                type="number"
                min={1}
                className="form-control"
                value={settings.retentionDays ?? ""}
                placeholder="Until manually deleted"
                disabled={!canEdit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retentionDays: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="col-12 form-check">
              <input
                id="ew-captions-default"
                className="form-check-input"
                type="checkbox"
                checked={settings.captionsDefault}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, captionsDefault: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="ew-captions-default">
                Captions default on
              </label>
            </div>
            <div className="col-12 form-check">
              <input
                id="ew-intro"
                className="form-check-input"
                type="checkbox"
                checked={settings.includeIntro}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, includeIntro: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="ew-intro">
                Include standard Forge intro
              </label>
            </div>
            <div className="col-12 form-check">
              <input
                id="ew-outro"
                className="form-check-input"
                type="checkbox"
                checked={settings.includeOutro}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, includeOutro: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="ew-outro">
                Include standard Forge outro
              </label>
            </div>
            <div className="col-12">
              <label className="form-label">Optional custom closing text</label>
              <textarea
                className="form-control"
                rows={3}
                value={settings.closingText ?? ""}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, closingText: e.target.value || null })}
              />
            </div>
          </div>
          <div className="card-footer d-flex justify-content-end">
            <button type="submit" className="btn btn-primary" disabled={!canEdit || busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
