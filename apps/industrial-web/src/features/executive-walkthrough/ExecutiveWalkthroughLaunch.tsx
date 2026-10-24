"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
  EXECUTIVE_WALKTHROUGH_STEPS,
  estimateWalkthroughRuntimeMs,
} from "@forge/contracts";
import { ApiError, useAuth } from "@forge/web-kit";
import { executiveWalkthroughApi } from "@/features/executive-walkthrough/api";
import { useWalkthroughController } from "@/features/executive-walkthrough/WalkthroughController";
import { WalkthroughExportDialog } from "@/features/executive-walkthrough/WalkthroughExportDialog";
import type { WalkthroughResolvedConfig } from "@/features/executive-walkthrough/types";
import { formatWalkthroughClock } from "@/features/executive-walkthrough/utils";
import { canAccessExecutiveWalkthrough } from "@/lib/platform-admin";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import {
  DEFAULT_WALKTHROUGH_VOICE,
  WALKTHROUGH_VOICE_OPTIONS,
  type WalkthroughVoiceId,
} from "@/features/executive-walkthrough/voices";

function isApiFailure(err: unknown): err is { message: string; status?: number; code?: string } {
  if (err instanceof ApiError) return true;
  if (!err || typeof err !== "object") return false;
  const row = err as { name?: string; message?: unknown };
  return row.name === "ApiError" && typeof row.message === "string";
}

function localFallbackConfig(apiMessage?: string): WalkthroughResolvedConfig {
  const projectedRuntimeMs = estimateWalkthroughRuntimeMs();
  return {
    presentationId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
    contentVersion: "local-preview",
    tenantDisplayName: "Producers Rice Mill",
    settings: {
      enabled: true,
      voiceId: DEFAULT_WALKTHROUGH_VOICE,
      narrationSpeed: 100,
      captionsDefault: true,
      includeIntro: true,
      includeOutro: true,
      exportResolution: "1080p",
      retentionDays: null,
      closingText: null,
    },
    steps: EXECUTIVE_WALKTHROUGH_STEPS.map((step) => ({
      id: step.id,
      title: step.title,
      route: step.route,
      durationMs: step.durationMs,
      narrationText: step.narrationText,
      ...(step.targetSelector ? { targetSelector: step.targetSelector } : {}),
      ...(step.secondarySelectors?.length
        ? { secondarySelectors: [...step.secondarySelectors] }
        : {}),
      ...(step.requiredModule ? { requiredModule: step.requiredModule } : {}),
      ...(step.skipIfUnavailable != null ? { skipIfUnavailable: step.skipIfUnavailable } : {}),
      narration: null,
    })),
    latestExport: null,
    validation: {
      ready: true,
      projectedRuntimeMs,
      issues: [
        {
          code: "local_preview",
          severity: "warning",
          message: apiMessage
            ? `API unavailable (${apiMessage}). Interactive walkthrough still works; Polly voice cache and MP4 export need the walkthrough API + migration 0088.`
            : "Running in local preview mode. Interactive walkthrough still works; Polly voice cache and MP4 export need the walkthrough API.",
        },
      ],
    },
  };
}

export function ExecutiveWalkthroughLaunch() {
  const { me, loading: authLoading, hasPermission } = useAuth();
  const ctrl = useWalkthroughController();
  const { logoLightUrl } = useTenantBranding();
  const [config, setConfig] = useState<WalkthroughResolvedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [voiceId, setVoiceId] = useState<WalkthroughVoiceId>(DEFAULT_WALKTHROUGH_VOICE);
  const [exportOpen, setExportOpen] = useState(false);
  const [audioOk, setAudioOk] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const canManageVoice =
    hasPermission("industrial.presentation.executive.manage") ||
    hasPermission("industrial.admin") ||
    Boolean(me?.isPlatformAdmin);

  const allowed = canAccessExecutiveWalkthrough(me);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoLightUrl]);

  const legalGateRequired =
    me?.legalAcknowledgments?.status === "REQUIRED" ||
    (error != null &&
      (error.includes("legal acknowledgment") || error.includes("LEGAL_ACKNOWLEDGMENT")));

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) {
      setLoading(false);
      return;
    }
    if (me?.legalAcknowledgments?.status === "REQUIRED") {
      setLoading(false);
      setConfig(null);
      setError("Required legal acknowledgments must be accepted before continuing");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void executiveWalkthroughApi
      .getConfig()
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setCaptions(data.settings.captionsDefault);
        const matched = WALKTHROUGH_VOICE_OPTIONS.find((v) => v.id === data.settings.voiceId);
        setVoiceId(matched?.id ?? DEFAULT_WALKTHROUGH_VOICE);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const legalBlocked =
          isApiFailure(err) &&
          (err.code === "LEGAL_ACKNOWLEDGMENT_REQUIRED" ||
            /legal acknowledgment/i.test(err.message));
        if (legalBlocked) {
          setConfig(null);
          setError("Required legal acknowledgments must be accepted before continuing");
          return;
        }
        const detail = isApiFailure(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
        // Preview still works without the walkthrough backend (migration/deploy pending).
        setConfig(localFallbackConfig(detail));
        setError(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, allowed, me?.legalAcknowledgments?.status, reloadToken]);

  const runtimeLabel = useMemo(
    () =>
      formatWalkthroughClock(
        config?.validation.projectedRuntimeMs ?? estimateWalkthroughRuntimeMs(),
      ),
    [config],
  );

  if (authLoading || loading) {
    return <p className="text-muted mb-0">Loading executive walkthrough…</p>;
  }

  if (!allowed) {
    return (
      <div className="alert alert-warning mb-0">
        You need industrial access to open the Producers Rice Mill demo walkthrough.
      </div>
    );
  }

  if (legalGateRequired) {
    const gatePath = me?.legalAcknowledgments?.gatePath || "/legal/acknowledge/";
    const returnTo = encodeURIComponent("/presentation/executive-walkthrough/");
    const href = `${gatePath}${gatePath.includes("?") ? "&" : "?"}next=${returnTo}`;
    return (
      <div className="alert alert-warning mb-0">
        <p className="mb-2">Required legal acknowledgments must be accepted before continuing.</p>
        <a className="btn btn-primary" href={href}>
          Review &amp; Acknowledge
        </a>
      </div>
    );
  }

  const hardBlocked = Boolean(config?.validation.issues.some((i) => i.severity === "error"));

  return (
    <div className="exec-walkthrough-launch" data-walkthrough="executive-launch">
      <div className="exec-walkthrough-launch-hero">
        {logoLightUrl.trim() && !logoFailed ? (
          <div className="exec-walkthrough-card-logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="exec-walkthrough-card-logo mb-0"
              src={logoLightUrl}
              alt="Forge Industrial Safety"
              onError={() => setLogoFailed(true)}
            />
          </div>
        ) : null}
        <p className="exec-walkthrough-brand mb-2">Forge Industrial Safety</p>
        <h1 className="mb-3">Producers Rice Mill Demo Walkthrough</h1>
        <p className="exec-walkthrough-support mb-4">
          A narrated demo of the Producers Rice Mill Forge Industrial Safety platform. Watch online
          in the live system or download an MP4. Pick a voice, then walk through Personnel,
          Training, My Training, Incidents, OSHA, Workers Comp, Inspections, Department of
          Transportation, Assets &amp; Equipment, Fleet, Safety Supplies, Lockout/Tagout, Emergency
          Alerts, Tasks, Calendar, Reminders, Messaging, Analytics, Reporting, and QR Management —
          target under ten minutes.
        </p>

        {config?.validation.issues.some((i) => i.code === "local_preview") ? (
          <div className="alert alert-info py-2">
            <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start">
              <div>{config.validation.issues.find((i) => i.code === "local_preview")?.message}</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  setReloadToken((n) => n + 1);
                }}
              >
                Retry API
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="alert alert-warning">{error}</div> : null}

        {config ? (
          <div className={`alert ${hardBlocked ? "alert-warning" : "alert-success"} py-2`}>
            {hardBlocked ? "Presentation Needs Attention" : "Presentation Ready"}
            <span className="ms-2 text-muted">Target runtime {runtimeLabel}</span>
            {config.validation.issues.filter((i) => i.code !== "local_preview").length ? (
              <ul className="mb-0 mt-2">
                {config.validation.issues
                  .filter((i) => i.code !== "local_preview")
                  .map((issue) => (
                    <li key={`${issue.code}-${issue.sceneId ?? ""}`}>{issue.message}</li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="exec-walkthrough-voice-picker mb-3">
          <label className="form-label" htmlFor="ew-launch-voice">
            Narration voice
          </label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {WALKTHROUGH_VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.id}
                type="button"
                className={`btn btn-sm ${voiceId === voice.id ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => {
                  setVoiceId(voice.id);
                  setAudioOk(null);
                  if (canManageVoice) {
                    void executiveWalkthroughApi
                      .updateSettings({ voiceId: voice.id })
                      .then((settings) => {
                        setConfig((prev) =>
                          prev ? { ...prev, settings: { ...prev.settings, ...settings } } : prev,
                        );
                      })
                      .catch(() => undefined);
                  }
                }}
              >
                {voice.label}
                <span className="ms-1 text-muted fw-normal d-none d-md-inline">— {voice.hint}</span>
              </button>
            ))}
          </div>
          <select
            id="ew-launch-voice"
            className="form-select"
            value={voiceId}
            aria-label="Narration voice"
            onChange={(e) => {
              const next = e.target.value as WalkthroughVoiceId;
              setVoiceId(next);
              setAudioOk(null);
              if (canManageVoice) {
                void executiveWalkthroughApi
                  .updateSettings({ voiceId: next })
                  .then((settings) => {
                    setConfig((prev) =>
                      prev ? { ...prev, settings: { ...prev.settings, ...settings } } : prev,
                    );
                  })
                  .catch(() => undefined);
              }
            }}
          >
            {WALKTHROUGH_VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label} — {voice.hint}
              </option>
            ))}
          </select>
          <div className="form-text">
            Select a voice before starting or downloading. The platform waits for each screen to
            load before narration continues.
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={hardBlocked}
            onClick={() => {
              void executiveWalkthroughApi
                .trackEvent("executive_walkthrough_started")
                .catch(() => undefined);
              ctrl.start({
                mode: "interactive",
                narrationEnabled: true,
                captions,
                voiceId,
                contentVersion: config?.contentVersion ?? "local-preview",
              });
            }}
          >
            Start Online Walkthrough
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            disabled={hardBlocked}
            onClick={() =>
              ctrl.start({
                mode: "interactive",
                narrationEnabled: false,
                captions,
                voiceId,
                contentVersion: config?.contentVersion ?? "local-preview",
              })
            }
          >
            Start Without Narration
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            Full Screen
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={async () => {
              try {
                const assets = await executiveWalkthroughApi.ensureNarration({ voiceId });
                const first = assets.assets[0];
                if (!first?.downloadUrl) {
                  setAudioOk("Narration assets prepared (no preview URL yet).");
                  return;
                }
                const audio = new Audio(first.downloadUrl);
                await audio.play();
                setAudioOk(`Audio test playing (${voiceId}).`);
              } catch (err) {
                setAudioOk(
                  err instanceof ApiError
                    ? `${err.message} (narration requires the walkthrough API + Polly)`
                    : "Audio test failed",
                );
              }
            }}
          >
            Test Audio
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setCaptions((v) => !v)}
          >
            Captions {captions ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => setExportOpen(true)}
          >
            Download MP4
          </button>
          <Link href="/settings/presentation/" className="btn btn-outline-secondary">
            Export Settings
          </Link>
          <Link href="/" className="btn btn-outline-secondary">
            Exit
          </Link>
        </div>
        {audioOk ? <p className="text-muted small mb-0">{audioOk}</p> : null}
      </div>

      {exportOpen ? (
        <WalkthroughExportDialog
          contentVersion={config?.contentVersion ?? "local-preview"}
          latestExport={config?.latestExport ?? null}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
