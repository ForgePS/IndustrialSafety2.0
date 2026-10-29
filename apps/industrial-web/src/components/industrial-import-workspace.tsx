"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import {
  createImportApi,
  createLookupViaTransport,
  ImportCenterApp,
  type ImportWorkflowView,
} from "@forge/import-center";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import "./industrial-import.css";

/**
 * Host the shared Universal Import Center inside Industrial.
 * Execute selects Industrial org/personnel/fleet/training adapters
 * from the job product/module/record.
 */
function IndustrialImportInner({ moduleName }: { moduleName: string }) {
  const { me, hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenantId = me?.tenantId ?? null;
  const canView = hasPermission("import.view") || Boolean(me?.isPlatformAdmin);

  const api = useMemo(
    () =>
      createImportApi({
        get: (path, options) => apiGet(path, options),
        send: (path, method, payload, options) => apiSend(path, method, payload, options),
      }),
    [],
  );

  const createLookup = useMemo(() => {
    if (!tenantId) return undefined;
    return createLookupViaTransport(
      {
        get: (path, options) => apiGet(path, options),
        send: (path, method, payload, options) => apiSend(path, method, payload, options),
      },
      tenantId,
    );
  }, [tenantId]);

  if (!canView) {
    return (
      <section aria-labelledby="import-denied-title">
        <h1 id="import-denied-title">{moduleName}</h1>
        <p className="text-muted">You need the import.view permission to open Import Center.</p>
      </section>
    );
  }

  if (!tenantId) {
    return (
      <div className="alert alert-warning" role="status">
        Select a company before starting an import.
      </div>
    );
  }

  const jobId = searchParams.get("jobId");
  const view = searchParams.get("view") as ImportWorkflowView | null;

  return (
    <section aria-labelledby="import-title">
      <ModuleWorkspaceHeader
        id="import-title"
        eyebrow="System Tools"
        title={moduleName}
        description="Upload, map, validate, and run bulk imports for Industrial. Org (sites, departments, positions, employment types), personnel, fleet, and training history write to live records after you preview and confirm."
      />
      <div className="forge-import-center-host card border shadow-none">
        <div className="card-body">
          <ImportCenterApp
            api={api}
            tenantId={tenantId}
            hasPermission={hasPermission}
            basePath="/modules/import"
            initialJobId={jobId}
            initialView={view}
            defaultProductKey="FORGE_INDUSTRIAL"
            hideChrome
            {...(createLookup ? { createLookup } : {})}
            appEnv={process.env.NEXT_PUBLIC_APP_ENV ?? "local"}
            malwareProviderKey={
              process.env.NEXT_PUBLIC_IMPORT_MALWARE_PROVIDER_KEY ?? "reference-malware"
            }
            LinkComponent={({ href, children, className }) => (
              <Link href={href} className={className}>
                {children}
              </Link>
            )}
            onNavigate={(href) => {
              try {
                const url = new URL(href, "http://local");
                const qs = url.searchParams.toString();
                router.push(qs ? `${url.pathname}?${qs}` : url.pathname);
              } catch (err) {
                const message = err instanceof ApiError ? err.message : "Unable to navigate";
                console.error(message);
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}

export function IndustrialImportWorkspace({ moduleName }: { moduleName: string }) {
  return (
    <Suspense fallback={<p className="text-muted mb-0">Loading Import Center…</p>}>
      <IndustrialImportInner moduleName={moduleName} />
    </Suspense>
  );
}
