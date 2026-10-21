"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWalkthroughController } from "@/features/executive-walkthrough/WalkthroughController";

function RenderAutostart() {
  const ctrl = useWalkthroughController();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const mode = params.get("mode");

  useEffect(() => {
    if (mode !== "render" && !token) return;
    ctrl.start({
      mode: "render",
      narrationEnabled: true,
      captions: true,
      contentVersion: "render",
      voiceId: "Danielle",
    });
  }, [token, mode, ctrl]);

  return (
    <div className="exec-walkthrough-render-root" data-walkthrough="render-root">
      <p className="visually-hidden">Executive walkthrough render mode</p>
    </div>
  );
}

export default function ExecutiveWalkthroughRenderPage() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Preparing render mode…</p>}>
      <RenderAutostart />
    </Suspense>
  );
}
