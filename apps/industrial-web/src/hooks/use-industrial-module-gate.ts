"use client";

import { useEffect, useState } from "react";
import { apiGet, useAuth } from "@forge/web-kit";

export type IndustrialBootstrapModule = {
  code: string;
  awsEnabled: boolean;
  available?: boolean;
  migrationStatus?: string;
};

export type IndustrialBootstrap = {
  industrialEnabled: boolean;
  modules: IndustrialBootstrapModule[];
  flags?: Record<string, boolean>;
};

/**
 * Permissions open the module immediately. Bootstrap is only an Advanced
 * kill-switch and must not add an RTT before list/data loads.
 */
export function useIndustrialModuleGate(opts: {
  moduleCode: string;
  canView: boolean;
}) {
  const { me } = useAuth();
  const [bootstrap, setBootstrap] = useState<IndustrialBootstrap | null>(null);

  useEffect(() => {
    if (!me?.tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<IndustrialBootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch {
        if (!cancelled) setBootstrap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId, me?.userId]);

  const modEntry = bootstrap?.modules.find((m) => m.code === opts.moduleCode);
  const explicitlyDisabled =
    bootstrap != null &&
    (bootstrap.industrialEnabled === false || modEntry?.awsEnabled === false);
  const awsReady = Boolean(opts.canView && !explicitlyDisabled);

  return { bootstrap, modEntry, explicitlyDisabled, awsReady };
}
