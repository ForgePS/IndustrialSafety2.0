"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { resolvePublicRenderSession } from "./api";
import { useWalkthroughController } from "./WalkthroughController";

export function PublicWalkthroughRenderClient() {
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? "");
  const ctrl = useWalkthroughController();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || token === "placeholder") return;
    let cancelled = false;
    void resolvePublicRenderSession(token)
      .then((session) => {
        if (cancelled) return;
        ctrl.start({
          mode: "render",
          narrationEnabled: true,
          captions: false,
          contentVersion: session.contentVersion,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Render session is invalid or expired");
      });
    return () => {
      cancelled = true;
    };
  }, [token, ctrl]);

  if (error) {
    return <div className="alert alert-danger m-4">{error}</div>;
  }

  return (
    <div className="exec-walkthrough-render-root" data-walkthrough="render-root">
      <p className="visually-hidden">Authorized render session</p>
    </div>
  );
}
