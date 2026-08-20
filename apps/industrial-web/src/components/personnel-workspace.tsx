"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, useAuth } from "@forge/web-kit";
import { PersonnelDirectory } from "@/components/personnel-directory";
import { CompanyDriversDirectory } from "@/components/company-drivers-directory";
import { PersonnelPpeDirectory } from "@/components/personnel-ppe-directory";
import { PersonnelQuickNav } from "@/components/personnel-quick-nav";
import { SeasonalWorkforceWorkspace } from "@/components/seasonal-workforce-workspace";
import { parsePersonnelQuickView, type PersonnelQuickView } from "@/lib/personnel-quick-nav";
import { isSeasonalLifecycleEnabled } from "@/lib/personnel-seasonal";

type Bootstrap = {
  industrialEnabled: boolean;
  flags?: Record<string, boolean>;
  modules: Array<{ code: string; awsEnabled: boolean }>;
};

type PersonnelMode = "roster" | "seasonal";

function PersonnelWorkspaceInner({ moduleName }: { moduleName: string }) {
  const searchParams = useSearchParams();
  const quickView: PersonnelQuickView = parsePersonnelQuickView(searchParams.get("view"));

  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.personnel.view") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [mode, setMode] = useState<PersonnelMode>("roster");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch {
        if (!cancelled) setBootstrap({ industrialEnabled: false, flags: {}, modules: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered roster URLs should land on the directory, not the seasonal tab.
  useEffect(() => {
    if (quickView !== "dashboard") setMode("roster");
  }, [quickView]);

  const flagsKnown = bootstrap !== null;
  const seasonalOn = isSeasonalLifecycleEnabled(bootstrap?.flags);
  const showSwitcher = Boolean(canView && flagsKnown);

  return (
    <div className="ind-personnel">
      {canView ? <PersonnelQuickNav current={quickView} /> : null}

      {showSwitcher ? (
        <div className="nav-align-top">
          <ul className="nav nav-tabs flex-wrap" role="tablist" aria-label="Personnel views">
            <li className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "roster"}
                className={`nav-link${mode === "roster" ? " active" : ""}`}
                onClick={() => setMode("roster")}
              >
                Roster
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "seasonal"}
                className={`nav-link${mode === "seasonal" ? " active" : ""}`}
                onClick={() => setMode("seasonal")}
                title={
                  seasonalOn ? undefined : "Seasonal lifecycle flag is off for this tenant"
                }
              >
                Seasonal Workforce
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {mode === "seasonal" ? (
        <SeasonalWorkforceWorkspace onGoToRoster={() => setMode("roster")} />
      ) : quickView === "company-drivers" ? (
        <CompanyDriversDirectory />
      ) : quickView === "ppe-allowance" ? (
        <PersonnelPpeDirectory />
      ) : (
        <PersonnelDirectory moduleName={moduleName} view={quickView} />
      )}
    </div>
  );
}

export function PersonnelWorkspace({ moduleName }: { moduleName: string }) {
  return (
    <Suspense
      fallback={
        <div className="ind-personnel">
          <p className="text-muted" role="status">
            Loading personnel…
          </p>
        </div>
      }
    >
      <PersonnelWorkspaceInner moduleName={moduleName} />
    </Suspense>
  );
}
