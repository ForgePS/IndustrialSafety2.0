"use client";

import { useEffect, useState } from "react";
import { useOptionalWalkthroughController } from "./WalkthroughController";
import { WalkthroughControls } from "./WalkthroughControls";
import { WalkthroughCaption } from "./WalkthroughCaption";
import { WalkthroughHighlight } from "./WalkthroughHighlight";
import { WalkthroughProgress } from "./WalkthroughProgress";
import { WalkthroughExportDialog } from "./WalkthroughExportDialog";
import { WalkthroughCursor } from "./WalkthroughCursor";
import { useTenantBranding } from "@/hooks/use-tenant-branding";

function WalkthroughBrandMark({ logoUrl }: { logoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);
  const show = Boolean(logoUrl?.trim()) && !failed;
  return (
    <>
      {show ? (
        <div className="exec-walkthrough-card-logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="exec-walkthrough-card-logo"
            src={logoUrl}
            alt="Forge Industrial Safety"
            onError={() => setFailed(true)}
          />
        </div>
      ) : null}
      <p className="exec-walkthrough-brand mb-2">Forge Industrial Safety</p>
    </>
  );
}

export function WalkthroughOverlayHost() {
  const ctrl = useOptionalWalkthroughController();
  const { logoLightUrl } = useTenantBranding();
  const [exportOpen, setExportOpen] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!ctrl?.session?.active || ctrl.isRenderMode) return;
    let timer = window.setTimeout(() => setIdle(true), 2800);
    const bump = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2800);
    };
    window.addEventListener("mousemove", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [ctrl?.session?.active, ctrl?.isRenderMode]);

  // Hide Sneat chrome while opening/closing cards fill the viewport.
  useEffect(() => {
    const card = ctrl?.session?.active ? ctrl.session.card : null;
    if (!card) {
      document.documentElement.removeAttribute("data-walkthrough-card");
      return;
    }
    document.documentElement.setAttribute("data-walkthrough-card", card);
    return () => {
      document.documentElement.removeAttribute("data-walkthrough-card");
    };
  }, [ctrl?.session?.active, ctrl?.session?.card]);

  if (!ctrl?.session?.active) return null;
  const { session, step } = ctrl;
  const total = Math.max(1, ctrl.stepCount);

  return (
    <>
      {session.card ? (
        <div className="exec-walkthrough-card" data-variant={session.card} aria-live="polite">
          <div className="exec-walkthrough-card-inner">
            {session.card === "opening" ? (
              <>
                <WalkthroughBrandMark
                  {...(logoLightUrl.trim() ? { logoUrl: logoLightUrl } : {})}
                />
                <p className="exec-walkthrough-tagline fw-semibold mb-3">
                  One Platform. Total Safety Visibility.
                </p>
                <p className="exec-walkthrough-support">
                  Personnel, training, incidents, compliance, inspections, equipment, communication,
                  and day-to-day safety operations in one connected platform.
                </p>
                <span className="badge bg-warning text-dark mt-3">DEMO ENVIRONMENT</span>
              </>
            ) : (
              <>
                <WalkthroughBrandMark
                  {...(logoLightUrl.trim() ? { logoUrl: logoLightUrl } : {})}
                />
                <p className="exec-walkthrough-tagline fw-semibold mb-3">
                  Connected Safety. One Platform.
                </p>
                <p className="exec-walkthrough-support">
                  From employee training and incident management to inspections, equipment,
                  compliance, communication, and reporting.
                </p>
                <span className="badge bg-warning text-dark mt-3">DEMO ENVIRONMENT</span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <WalkthroughHighlight target={session.card ? null : session.highlightTarget} />
      <WalkthroughCursor
        target={session.card ? null : session.highlightTarget}
        visible={!ctrl.isRenderMode && Boolean(session.highlightTarget) && !session.card}
      />
      <div className="forge-demo-env-badge" aria-live="polite">
        DEMO ENVIRONMENT
      </div>

      {session.captions && step ? <WalkthroughCaption text={step.narrationText} /> : null}

      {!ctrl.isRenderMode ? (
        <div
          className={`exec-walkthrough-chrome${idle ? " is-idle" : ""}`}
          data-walkthrough-controls="true"
        >
          <WalkthroughProgress
            stepIndex={session.stepIndex}
            total={total}
            title={step?.title ?? "Walkthrough"}
          />
          <WalkthroughControls
            playing={session.playing}
            muted={session.muted}
            captions={session.captions}
            onPlay={ctrl.play}
            onPause={ctrl.pause}
            onNext={ctrl.next}
            onPrevious={ctrl.previous}
            onRestart={ctrl.restart}
            onToggleMute={ctrl.toggleMute}
            onToggleCaptions={ctrl.toggleCaptions}
            onDownloadMp4={() => setExportOpen(true)}
            onExit={ctrl.exit}
            onFullscreen={() => {
              const root = document.documentElement;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void root.requestFullscreen?.();
            }}
          />
        </div>
      ) : null}

      {exportOpen ? (
        <WalkthroughExportDialog
          contentVersion={session.contentVersion}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </>
  );
}
