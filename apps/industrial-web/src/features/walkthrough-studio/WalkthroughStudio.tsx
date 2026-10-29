"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@forge/web-kit";
import { formatWalkthroughRuntime, INDUSTRIAL_PLATFORM_WALKTHROUGH_ID } from "@forge/contracts";
import { canAccessWalkthroughStudio, canManageWalkthroughStudio } from "@/lib/platform-admin";
import { formatApiErrorMessage } from "@/lib/api-error";
import {
  walkthroughStudioApi,
  type AnalyticsDto,
  type DemoEnvironmentDto,
  type RuntimeDto,
  type SceneDto,
  type ShareLinkDto,
  type ValidationDto,
  type VoiceDto,
  type WalkthroughCardDto,
  type WalkthroughDetailDto,
} from "./api";

type StudioTab = "walkthroughs" | "narration" | "demo" | "exports" | "analytics";

const RUNTIME_BADGE: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning text-dark",
  orange: "bg-warning text-dark",
  red: "bg-danger",
};

/** Local WPM estimate — avoid importing heavy contracts helpers into this client page. */
function estimateNarrationMsLocal(text: string | null | undefined): number {
  const words = String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (!words) return 0;
  return Math.round((words / 150) * 60_000);
}

export function WalkthroughStudio() {
  const { me, loading: authLoading } = useAuth();
  const canAccess = canAccessWalkthroughStudio(me);
  const canManage = canManageWalkthroughStudio(me);
  const [tab, setTab] = useState<StudioTab>("walkthroughs");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cards, setCards] = useState<WalkthroughCardDto[]>([]);
  const [runtime, setRuntime] = useState<RuntimeDto | null>(null);
  const [detail, setDetail] = useState<WalkthroughDetailDto | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceDto[]>([]);
  const [demo, setDemo] = useState<DemoEnvironmentDto | null>(null);
  const [validation, setValidation] = useState<ValidationDto | null>(null);
  const [exports, setExports] = useState<unknown[]>([]);
  const [shares, setShares] = useState<ShareLinkDto[]>([]);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [exportForm, setExportForm] = useState({
    voiceProfileId: "",
    resolution: "1080p" as "1080p" | "720p",
    captions: "off" as "off" | "burned_in" | "subtitle_track",
    overrideRuntime: false,
  });
  const [analytics, setAnalytics] = useState<AnalyticsDto | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const selectedScene: SceneDto | null = useMemo(() => {
    if (!detail) return null;
    return detail.scenes.find((s) => s.id === selectedSceneId) ?? detail.scenes[0] ?? null;
  }, [detail, selectedSceneId]);

  const refresh = useCallback(async () => {
    setError(null);
    const [list, voicesRes, demoRes, exportsRes] = await Promise.all([
      walkthroughStudioApi.list(),
      walkthroughStudioApi.voices(),
      walkthroughStudioApi.demo().catch(() => null),
      walkthroughStudioApi.listExports().catch(() => null),
    ]);
    setCards(list.items);
    setRuntime(list.runtime);
    setVoices(voicesRes.items);
    setDemo(demoRes);
    setExports(
      Array.isArray(exportsRes?.studioExports) && exportsRes.studioExports.length
        ? exportsRes.studioExports
        : Array.isArray(exportsRes?.items)
          ? exportsRes.items
          : [],
    );
    setExportForm((prev) => ({
      ...prev,
      voiceProfileId: prev.voiceProfileId || voicesRes.defaultVoiceProfileId,
    }));
    const primary = list.items[0];
    if (primary) {
      // Prefer row UUID — binding a presentation code into id::uuid crashes Postgres.
      // Fall back to stable code only when the list card has no id (API handles code-only).
      const d = await walkthroughStudioApi.get(
        primary.id || primary.code || INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
      );
      setDetail(d);
      setSelectedSceneId((prev) => prev ?? d.scenes[0]?.id ?? null);
      const shareRes = await walkthroughStudioApi
        .listShares(d.walkthrough.id || primary.id)
        .catch(() => null);
      setShares(shareRes?.items ?? []);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!canAccess) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void refresh()
      .catch((err) => {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, "Unable to load Walkthrough Studio"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, canAccess, refresh]);

  useEffect(() => {
    if (!canAccess || tab !== "analytics") return;
    let cancelled = false;
    setAnalyticsLoading(true);
    void walkthroughStudioApi
      .analytics()
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, "Unable to load walkthrough analytics"));
          setAnalytics(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canAccess, tab]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(formatApiErrorMessage(err, "Unable to complete Walkthrough Studio request"));
    } finally {
      setBusy(false);
    }
  }

  if (!authLoading && !canAccess) {
    return (
      <div className="alert alert-secondary" role="status">
        Walkthrough Studio is only available on the Forge Platform demo tenant.
      </div>
    );
  }

  if (loading) {
    return <div className="text-muted">Loading Walkthrough Studio…</div>;
  }

  return (
    <div className="walkthrough-studio" data-walkthrough-id="walkthrough-studio">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <div className="text-muted small text-uppercase mb-1">System Tools</div>
          <h4 className="mb-1">Walkthrough Studio</h4>
          <p className="text-muted mb-0">
            Create, narrate, present, and export Forge Industrial Safety demonstrations.
          </p>
        </div>
        {runtime ? (
          <div className="text-end">
            <div className="small text-muted mb-1">Master runtime</div>
            <span className={`badge ${RUNTIME_BADGE[runtime.status] ?? "bg-secondary"} fs-6`}>
              {runtime.formatted} · {runtime.status.toUpperCase()}
            </span>
            <div className="small text-muted mt-1">Limit 9:45 · Target 8:15–9:15</div>
          </div>
        ) : null}
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <ul className="nav nav-pills mb-3 flex-wrap gap-1" role="tablist">
        {(
          [
            ["walkthroughs", "Walkthroughs"],
            ["narration", "Narration"],
            ["demo", "Demo Environment"],
            ["exports", "Video Exports"],
            ["analytics", "Analytics"],
          ] as const
        ).map(([id, label]) => (
          <li className="nav-item" key={id}>
            <button
              type="button"
              className={`nav-link ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "walkthroughs" ? (
        <div className="row g-3">
          {cards.map((card) => (
            <div className="col-12 col-lg-8" key={card.id}>
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between gap-2 flex-wrap">
                    <div>
                      <h5 className="mb-1">{card.name}</h5>
                      <p className="text-muted mb-2">{card.description}</p>
                    </div>
                    <span className="badge bg-label-primary align-self-start text-capitalize">
                      {card.status}
                    </span>
                  </div>
                  <div className="row g-2 small mb-3">
                    <div className="col-6 col-md-3">
                      <div className="text-muted">Runtime</div>
                      <strong>{card.runtimeFormatted}</strong>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="text-muted">Chapters</div>
                      <strong>{card.chapterCount}</strong>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="text-muted">Voice</div>
                      <strong>{card.voice.displayName}</strong>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="text-muted">Version</div>
                      <strong>{card.version}</strong>
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Link className="btn btn-primary btn-sm" href="/demo/industrial/">
                      Present
                    </Link>
                    <Link
                      className="btn btn-outline-primary btn-sm"
                      href="/demo/industrial/?preview=1"
                    >
                      Preview
                    </Link>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void withBusy(async () => {
                          const v = await walkthroughStudioApi.validate(card.id);
                          setValidation(v);
                          setMessage(
                            v.canPublish
                              ? "Walkthrough validation passed. Ready to publish."
                              : "Validation found blocking issues.",
                          );
                        })
                      }
                    >
                      Validate
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={busy || !canManage}
                      onClick={() =>
                        void withBusy(async () => {
                          const share = await walkthroughStudioApi.createShare(card.id, {
                            allowInteractive: true,
                            allowChapterNavigation: true,
                            allowVideoDownload: false,
                          });
                          setSharePath(share.path);
                          setMessage(`Share link created: ${share.path}`);
                          const shareRes = await walkthroughStudioApi.listShares(card.id);
                          setShares(shareRes.items);
                        })
                      }
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={busy || !canManage}
                      onClick={() => setTab("exports")}
                    >
                      Generate MP4
                    </button>
                  </div>
                  {sharePath ? (
                    <div className="alert alert-info mt-3 mb-0 py-2 small">
                      Public path (host on demo.forgepublicsafety.com): <code>{sharePath}</code>
                    </div>
                  ) : null}
                  {shares.length > 0 ? (
                    <div className="table-responsive mt-3">
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Path</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {shares.map((share) => (
                            <tr key={share.id}>
                              <td>
                                <code>{share.path}</code>
                              </td>
                              <td>{share.isRevoked ? "Revoked" : "Active"}</td>
                              <td className="text-end">
                                {!share.isRevoked ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={busy || !canManage}
                                    onClick={() =>
                                      void withBusy(async () => {
                                        await walkthroughStudioApi.revokeShare(card.id, share.id);
                                        setShares(
                                          (await walkthroughStudioApi.listShares(card.id)).items,
                                        );
                                        setMessage(`Revoked ${share.path}`);
                                      })
                                    }
                                  >
                                    Revoke
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {validation ? (
                    <div className="mt-3">
                      <div className="small text-muted mb-1">
                        Validation · {validation.runtime.formatted} ·{" "}
                        {validation.ok ? "OK" : "Issues"}
                      </div>
                      <ul className="mb-0 small">
                        {validation.issues.length === 0 ? (
                          <li>No issues found.</li>
                        ) : (
                          validation.issues.map((issue) => (
                            <li key={issue.code + issue.message}>
                              <span className="text-uppercase">{issue.severity}</span>:{" "}
                              {issue.message}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {detail ? (
            <div className="col-12">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Timeline editor</h6>
                  <span className="small text-muted">
                    {detail.chapters.length} chapters · {detail.scenes.length} scenes
                  </span>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-12 col-md-3">
                      <div className="list-group list-group-flush border rounded">
                        {detail.chapters.map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            className={`list-group-item list-group-item-action ${
                              selectedScene?.id === ch.id ? "active" : ""
                            }`}
                            onClick={() => setSelectedSceneId(ch.id)}
                          >
                            <div className="fw-medium">{ch.title}</div>
                            <div className="small opacity-75">
                              {formatWalkthroughRuntime(ch.targetDurationMs)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-12 col-md-5">
                      <div className="border rounded p-3 bg-lighter h-100">
                        <div className="text-muted small mb-2">Live demo preview</div>
                        <h6 className="mb-1">{selectedScene?.name ?? "Select a chapter"}</h6>
                        <p className="small text-muted mb-2">{selectedScene?.route}</p>
                        <Link
                          className="btn btn-sm btn-outline-primary"
                          href={selectedScene?.route || "/demo/industrial/"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Forge route
                        </Link>
                      </div>
                    </div>
                    <div className="col-12 col-md-4">
                      {selectedScene ? (
                        <SceneConfigPanel
                          scene={selectedScene}
                          canManage={canManage}
                          busy={busy}
                          onSave={(patch) =>
                            void withBusy(async () => {
                              const wtId = detail.walkthrough.id;
                              const updated = await walkthroughStudioApi.patchScene(wtId, {
                                sceneKey: selectedScene.id,
                                ...patch,
                              });
                              if (!updated?.scenes || !Array.isArray(updated.scenes)) {
                                throw new Error(
                                  "Save succeeded but the walkthrough response was incomplete.",
                                );
                              }
                              const saved = updated.scenes.find((s) => s.id === selectedScene.id);
                              if (
                                patch.narrationText != null &&
                                saved?.narrationText !== patch.narrationText
                              ) {
                                throw new Error(
                                  "Narration script did not persist. Refresh and try saving again.",
                                );
                              }
                              setDetail(updated);
                              setMessage("Scene timing and narration saved.");
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 overflow-auto">
                    <div className="d-flex gap-1" style={{ minWidth: "max-content" }}>
                      {detail.scenes.map((scene) => (
                        <button
                          key={scene.id}
                          type="button"
                          className={`btn btn-sm ${
                            selectedScene?.id === scene.id ? "btn-primary" : "btn-outline-secondary"
                          }`}
                          style={{ minWidth: 88 }}
                          onClick={() => setSelectedSceneId(scene.id)}
                        >
                          {scene.name.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "narration" ? (
        <NarrationPanel
          detail={detail}
          voices={voices}
          selectedScene={selectedScene}
          canManage={canManage}
          busy={busy}
          onSelectScene={setSelectedSceneId}
          onPreview={(voiceProfileId) =>
            void withBusy(async () => {
              const preview = await walkthroughStudioApi.previewVoice({ voiceProfileId });
              if (preview.downloadUrl) {
                const audio = new Audio(preview.downloadUrl);
                void audio.play();
                setMessage(`Playing ${preview.voice.displayName} preview.`);
              } else {
                setMessage("Preview audio is not available yet for this voice.");
              }
            })
          }
          onSave={(sceneId, patch) =>
            void withBusy(async () => {
              const wtId = detail?.walkthrough.id ?? INDUSTRIAL_PLATFORM_WALKTHROUGH_ID;
              const updated = await walkthroughStudioApi.patchScene(wtId, {
                sceneKey: sceneId,
                ...patch,
              });
              if (!updated?.scenes || !Array.isArray(updated.scenes)) {
                throw new Error("Save succeeded but the walkthrough response was incomplete.");
              }
              const saved = updated.scenes.find((s) => s.id === sceneId);
              if (patch.narrationText != null && saved?.narrationText !== patch.narrationText) {
                throw new Error("Narration script did not persist. Refresh and try saving again.");
              }
              setDetail(updated);
              setMessage("Narration and pause updated.");
            })
          }
        />
      ) : null}

      {tab === "demo" ? (
        <DemoPanel
          demo={demo}
          canManage={canManage}
          busy={busy}
          onEnable={() =>
            void withBusy(async () => {
              const next = await walkthroughStudioApi.enableDemo(true);
              setDemo(next);
              setMessage(
                "Demo mode enabled. External SMS, email, alerts, and DOT side effects are blocked.",
              );
            })
          }
          onReset={() =>
            void withBusy(async () => {
              const result = await walkthroughStudioApi.resetDemo();
              setMessage(result.message);
              setDemo(await walkthroughStudioApi.demo());
            })
          }
        />
      ) : null}

      {tab === "exports" ? (
        <ExportsPanel
          exports={exports}
          exportForm={exportForm}
          voices={voices}
          runtime={runtime}
          canManage={canManage}
          busy={busy}
          onChange={setExportForm}
          onGenerate={() =>
            void withBusy(async () => {
              await walkthroughStudioApi.createExport(exportForm);
              setMessage("MP4 export queued.");
              const exportsRes = await walkthroughStudioApi.listExports();
              setExports(
                Array.isArray(exportsRes.studioExports) && exportsRes.studioExports.length
                  ? exportsRes.studioExports
                  : Array.isArray(exportsRes.items)
                    ? exportsRes.items
                    : [],
              );
            })
          }
          onDownload={(exportId) =>
            void withBusy(async () => {
              const result = await walkthroughStudioApi.downloadExport(exportId);
              window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
              void walkthroughStudioApi
                .trackEvent({ eventType: "mp4_download", payload: { exportId } })
                .catch(() => undefined);
              setMessage(`Download ready: ${result.fileName}`);
            })
          }
        />
      ) : null}

      {tab === "analytics" ? (
        <AnalyticsPanel
          analytics={analytics}
          loading={analyticsLoading}
          onRefresh={() =>
            void withBusy(async () => {
              setAnalyticsLoading(true);
              try {
                setAnalytics(await walkthroughStudioApi.analytics());
                setMessage("Analytics refreshed.");
              } finally {
                setAnalyticsLoading(false);
              }
            })
          }
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function pauseSecondsFromScene(scene: SceneDto): number {
  return Math.max(0, Math.round((scene.availablePauseMs / 1000) * 10) / 10);
}

function durationMsFromPause(narrationEstimateMs: number, pauseSeconds: number): number {
  const pauseMs = Math.max(0, Math.round(pauseSeconds * 1000));
  const total = Math.max(1_000, Math.round(narrationEstimateMs) + pauseMs);
  // Keep within API scene duration limit (5 minutes).
  return Math.min(300_000, total);
}

function parsePauseInput(raw: string): number {
  const cleaned = raw.trim();
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(90, Math.round(value * 10) / 10);
}

function safeNarrationEstimateMs(text: string | null | undefined): number {
  return estimateNarrationMsLocal(text);
}

type ScenePatch = {
  narrationText: string;
  durationMs: number;
};

function SceneConfigPanel({
  scene,
  canManage,
  busy,
  onSave,
}: {
  scene: SceneDto;
  canManage: boolean;
  busy: boolean;
  onSave: (patch: ScenePatch) => void;
}) {
  const [text, setText] = useState(scene.narrationText);
  const [pauseInput, setPauseInput] = useState(() => String(pauseSecondsFromScene(scene)));
  useEffect(() => {
    setText(scene.narrationText);
    setPauseInput(String(pauseSecondsFromScene(scene)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset the draft only when the scene fields change, not on every parent re-render
  }, [scene.id, scene.narrationText, scene.availablePauseMs]);

  const pauseSeconds = parsePauseInput(pauseInput);
  const narrationEstimateMs = safeNarrationEstimateMs(text);
  const nextDurationMs = durationMsFromPause(narrationEstimateMs, pauseSeconds);

  return (
    <div>
      <div className="small text-muted mb-1">Scene configuration</div>
      <h6>{scene.name}</h6>
      {!canManage ? (
        <div className="alert alert-warning py-2 small" role="status">
          You can view Available pause, but saving requires walkthrough manage permission.
        </div>
      ) : null}
      <label className="form-label small mb-1" htmlFor={`pause-${scene.id}`}>
        Available pause (seconds)
      </label>
      <div className="input-group input-group-sm mb-2">
        <input
          id={`pause-${scene.id}`}
          type="number"
          className="form-control"
          min={0}
          max={90}
          step={0.5}
          value={pauseInput}
          disabled={!canManage || busy}
          onChange={(e) => setPauseInput(e.target.value)}
          onBlur={() => setPauseInput(String(pauseSeconds))}
        />
        <span className="input-group-text">sec</span>
      </div>
      <div className="small mb-2 text-muted">
        Narration {formatWalkthroughRuntime(narrationEstimateMs)} · Scene becomes{" "}
        {formatWalkthroughRuntime(nextDurationMs)}
      </div>
      <textarea
        className="form-control form-control-sm mb-2"
        rows={8}
        value={text}
        disabled={!canManage || busy}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={!canManage || busy}
        onClick={() =>
          onSave({
            narrationText: text,
            durationMs: durationMsFromPause(narrationEstimateMs, pauseSeconds),
          })
        }
      >
        Save pause &amp; narration
      </button>
    </div>
  );
}

function NarrationPanel({
  detail,
  voices,
  selectedScene,
  canManage,
  busy,
  onSelectScene,
  onPreview,
  onSave,
}: {
  detail: WalkthroughDetailDto | null;
  voices: VoiceDto[];
  selectedScene: SceneDto | null;
  canManage: boolean;
  busy: boolean;
  onSelectScene: (id: string) => void;
  onPreview: (voiceProfileId: string) => void;
  onSave: (sceneId: string, patch: ScenePatch) => void;
}) {
  const [text, setText] = useState(selectedScene?.narrationText ?? "");
  const [pauseInput, setPauseInput] = useState(() =>
    selectedScene ? String(pauseSecondsFromScene(selectedScene)) : "0",
  );
  useEffect(() => {
    setText(selectedScene?.narrationText ?? "");
    setPauseInput(selectedScene ? String(pauseSecondsFromScene(selectedScene)) : "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset the draft only when the scene fields change, not on every parent re-render
  }, [selectedScene?.id, selectedScene?.narrationText, selectedScene?.availablePauseMs]);

  const pauseSeconds = parsePauseInput(pauseInput);
  const narrationEstimateMs = safeNarrationEstimateMs(text);
  const nextDurationMs = selectedScene ? durationMsFromPause(narrationEstimateMs, pauseSeconds) : 0;

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-4">
        <div className="card">
          <div className="card-header">
            <h6 className="mb-0">Voice selector</h6>
          </div>
          <div className="card-body d-flex flex-column gap-2">
            {voices.map((voice) => (
              <div key={voice.id} className="border rounded p-2">
                <div className="d-flex justify-content-between gap-2">
                  <div>
                    <div className="fw-medium">
                      {voice.displayName}
                      {voice.recommended ? (
                        <span className="badge bg-label-success ms-2">Recommended</span>
                      ) : null}
                    </div>
                    <div className="small text-muted">
                      {voice.gender} · {voice.accent} · {voice.provider}
                    </div>
                    <div className="small">{voice.tone}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary align-self-start"
                    disabled={busy}
                    onClick={() => onPreview(voice.id)}
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-8">
        <div className="card">
          <div className="card-header d-flex justify-content-between">
            <h6 className="mb-0">Script editor</h6>
            {selectedScene ? (
              <span className="small text-muted">
                Words: {text.trim().split(/\s+/).filter(Boolean).length}
              </span>
            ) : null}
          </div>
          <div className="card-body">
            <div className="mb-3 d-flex flex-wrap gap-1">
              {detail?.scenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  className={`btn btn-sm ${
                    selectedScene?.id === scene.id ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => onSelectScene(scene.id)}
                >
                  {scene.name}
                </button>
              ))}
            </div>
            {selectedScene ? (
              <>
                {!canManage ? (
                  <div className="alert alert-warning py-2 small" role="status">
                    You can view Available pause, but saving requires walkthrough manage permission.
                  </div>
                ) : null}
                <label className="form-label" htmlFor={`narration-pause-${selectedScene.id}`}>
                  Available pause (seconds)
                </label>
                <div className="input-group mb-2" style={{ maxWidth: 220 }}>
                  <input
                    id={`narration-pause-${selectedScene.id}`}
                    type="number"
                    className="form-control"
                    min={0}
                    max={90}
                    step={0.5}
                    value={pauseInput}
                    disabled={!canManage || busy}
                    onChange={(e) => setPauseInput(e.target.value)}
                    onBlur={() => setPauseInput(String(pauseSeconds))}
                  />
                  <span className="input-group-text">sec</span>
                </div>
                <div className="small mb-2 text-muted">
                  Narration {formatWalkthroughRuntime(narrationEstimateMs)} · Scene becomes{" "}
                  {formatWalkthroughRuntime(nextDurationMs)}
                </div>
                <textarea
                  className="form-control mb-2"
                  rows={10}
                  value={text}
                  disabled={!canManage || busy}
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canManage || busy}
                  onClick={() =>
                    onSave(selectedScene.id, {
                      narrationText: text,
                      durationMs: durationMsFromPause(narrationEstimateMs, pauseSeconds),
                    })
                  }
                >
                  Save script &amp; pause
                </button>
              </>
            ) : (
              <p className="text-muted mb-0">Select a chapter to edit narration.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoPanel({
  demo,
  canManage,
  busy,
  onEnable,
  onReset,
}: {
  demo: DemoEnvironmentDto | null;
  canManage: boolean;
  busy: boolean;
  onEnable: () => void;
  onReset: () => void;
}) {
  return (
    <div className="card">
      <div className="card-body">
        <h5 className="mb-1">Forge Industrial Demo</h5>
        <p className="text-muted">
          Suggested tenant <code>{demo?.tenant?.suggestedSlug ?? "forge-industrial-demo"}</code> ·{" "}
          {demo?.tenant?.suggestedCompany ?? "Forge Demo Manufacturing"}
        </p>
        <div className="mb-3">
          <span
            className={`badge ${demo?.tenant?.isDemoTenant ? "bg-warning text-dark" : "bg-label-secondary"}`}
          >
            {demo?.tenant?.isDemoTenant ? "DEMO ENVIRONMENT" : "Production tenant"}
          </span>
        </div>
        <div className="row g-2 small mb-3">
          {Object.entries(demo?.seedTargets ?? {}).map(([key, value]) => (
            <div className="col-6 col-md-3" key={key}>
              <div className="text-muted">{key}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary"
            disabled={!canManage || busy || Boolean(demo?.tenant?.isDemoTenant)}
            onClick={onEnable}
          >
            Enable demo mode
          </button>
          <button
            type="button"
            className="btn btn-warning"
            disabled={!canManage || busy || !demo?.tenant?.isDemoTenant}
            onClick={onReset}
          >
            Reset Demo
          </button>
        </div>
        {demo?.tenant?.isDemoTenant ? (
          <ul className="mt-3 mb-0 small text-muted">
            <li>External SMS blocked</li>
            <li>External email blocked</li>
            <li>Emergency alerts stay internal</li>
            <li>Real printers and DOT updates blocked</li>
            {demo.seedStatus?.liveCounts ? (
              <li>
                Seeded rows: {demo.seedStatus.liveCounts.sites} sites,{" "}
                {demo.seedStatus.liveCounts.departments ?? 0} departments,{" "}
                {demo.seedStatus.liveCounts.personnel} personnel,{" "}
                {demo.seedStatus.liveCounts.equipmentAssets ?? 0} equipment,{" "}
                {demo.seedStatus.liveCounts.incidents ?? 0} incidents,{" "}
                {demo.seedStatus.liveCounts.inspections ?? 0} inspections
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ExportsPanel({
  exports,
  exportForm,
  voices,
  runtime,
  canManage,
  busy,
  onChange,
  onGenerate,
  onDownload,
}: {
  exports: unknown[];
  exportForm: {
    voiceProfileId: string;
    resolution: "1080p" | "720p";
    captions: "off" | "burned_in" | "subtitle_track";
    overrideRuntime: boolean;
  };
  voices: VoiceDto[];
  runtime: RuntimeDto | null;
  canManage: boolean;
  busy: boolean;
  onChange: (next: typeof exportForm) => void;
  onGenerate: () => void;
  onDownload: (exportId: string) => void;
}) {
  const overLimit = runtime ? !runtime.underLimit : false;
  return (
    <div className="row g-3">
      <div className="col-12 col-lg-4">
        <div className="card">
          <div className="card-header">
            <h6 className="mb-0">Generate MP4</h6>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label" htmlFor="wts-export-voice">
                Voice
              </label>
              <select
                id="wts-export-voice"
                className="form-select"
                value={exportForm.voiceProfileId}
                onChange={(e) => onChange({ ...exportForm, voiceProfileId: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="wts-export-resolution">
                Resolution
              </label>
              <select
                id="wts-export-resolution"
                className="form-select"
                value={exportForm.resolution}
                onChange={(e) =>
                  onChange({
                    ...exportForm,
                    resolution: e.target.value as "1080p" | "720p",
                  })
                }
              >
                <option value="1080p">1080p — Recommended</option>
                <option value="720p">720p — Smaller file</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="wts-export-captions">
                Captions
              </label>
              <select
                id="wts-export-captions"
                className="form-select"
                value={exportForm.captions}
                onChange={(e) =>
                  onChange({
                    ...exportForm,
                    captions: e.target.value as typeof exportForm.captions,
                  })
                }
              >
                <option value="off">Captions Off</option>
                <option value="burned_in">Burned-In Captions</option>
                <option value="subtitle_track">Subtitle Track</option>
              </select>
            </div>
            {overLimit ? (
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="overrideRuntime"
                  checked={exportForm.overrideRuntime}
                  onChange={(e) => onChange({ ...exportForm, overrideRuntime: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="overrideRuntime">
                  Override Standard Runtime
                </label>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary w-100"
              disabled={!canManage || busy || (overLimit && !exportForm.overrideRuntime)}
              onClick={onGenerate}
            >
              Generate MP4
            </button>
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-8">
        <div className="card">
          <div className="card-header">
            <h6 className="mb-0">Export history</h6>
          </div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Resolution</th>
                  <th>Voice</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      No exports yet.
                    </td>
                  </tr>
                ) : (
                  exports.map((row, idx) => {
                    const item = row as Record<string, unknown>;
                    const ready =
                      item.downloadReady === true ||
                      String(item.status ?? "").toLowerCase() === "completed";
                    const exportId = String(item.id ?? "");
                    return (
                      <tr key={exportId || String(idx)}>
                        <td>{String(item.status ?? "—")}</td>
                        <td>{String(item.resolution ?? "—")}</td>
                        <td>{String(item.voiceProfileId ?? item.voiceId ?? "—")}</td>
                        <td>
                          {item.createdAt
                            ? new Date(String(item.createdAt)).toLocaleString()
                            : item.requestedAt
                              ? new Date(String(item.requestedAt)).toLocaleString()
                              : "—"}
                        </td>
                        <td className="text-end">
                          {ready && exportId ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={!canManage || busy}
                              onClick={() => onDownload(exportId)}
                            >
                              Download
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({
  analytics,
  loading,
  onRefresh,
  busy,
}: {
  analytics: AnalyticsDto | null;
  loading: boolean;
  onRefresh: () => void;
  busy: boolean;
}) {
  const chapterExits = analytics
    ? Object.entries(analytics.chapterExits).sort((a, b) => b[1] - a[1])
    : [];
  const hasActivity =
    Boolean(analytics) &&
    (analytics!.starts > 0 ||
      analytics!.completions > 0 ||
      analytics!.replays > 0 ||
      analytics!.exploreSelections > 0 ||
      analytics!.mp4Downloads > 0 ||
      chapterExits.length > 0);

  return (
    <div className="row g-3">
      <div className="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h6 className="mb-1">Walkthrough usage</h6>
          <p className="text-muted small mb-0">
            Starts, completions, and module interest from interactive demos and share links.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={busy || loading}
          onClick={onRefresh}
        >
          Refresh
        </button>
      </div>

      {loading && !analytics ? (
        <div className="col-12">
          <p className="text-muted mb-0">Loading analytics…</p>
        </div>
      ) : null}

      {analytics ? (
        <>
          <div className="col-6 col-md-4 col-xl">
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small">Starts</div>
                <div className="fs-4 fw-semibold">{analytics.starts}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl">
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small">Completions</div>
                <div className="fs-4 fw-semibold">{analytics.completions}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl">
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small">Replays</div>
                <div className="fs-4 fw-semibold">{analytics.replays}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl">
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small">Explore Forge</div>
                <div className="fs-4 fw-semibold">{analytics.exploreSelections}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl">
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small">MP4 downloads</div>
                <div className="fs-4 fw-semibold">{analytics.mp4Downloads}</div>
              </div>
            </div>
          </div>

          {!hasActivity ? (
            <div className="col-12">
              <div className="alert alert-secondary mb-0" role="status">
                No walkthrough events yet. Launch a demo from{" "}
                <Link href="/demo/industrial/">/demo/industrial/</Link> to populate these metrics.
              </div>
            </div>
          ) : null}

          <div className="col-12 col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Most viewed modules</h6>
              </div>
              <div className="card-body p-0">
                {analytics.mostViewedModules.length === 0 ? (
                  <p className="text-muted small p-3 mb-0">No chapter interest recorded yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Chapter</th>
                          <th className="text-end">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.mostViewedModules.map((row) => (
                          <tr key={row.chapterKey}>
                            <td>
                              <code>{row.chapterKey}</code>
                            </td>
                            <td className="text-end">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Chapter exits</h6>
              </div>
              <div className="card-body p-0">
                {chapterExits.length === 0 ? (
                  <p className="text-muted small p-3 mb-0">No chapter exits recorded yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Chapter</th>
                          <th className="text-end">Exits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapterExits.map(([chapterKey, count]) => (
                          <tr key={chapterKey}>
                            <td>
                              <code>{chapterKey}</code>
                            </td>
                            <td className="text-end">{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
