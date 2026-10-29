"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { createImportApi, ImportCenterApp, type ImportWorkflowView } from "@forge/import-center";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

function ImportsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const api = useMemo(
    () =>
      createImportApi({
        get: (path, options) => apiGet(path, options),
        send: (path, method, payload, options) => apiSend(path, method, payload, options),
      }),
    [],
  );

  if (!tenantId) return <TenantRequired />;

  const jobId = searchParams.get("jobId");
  const view = searchParams.get("view") as ImportWorkflowView | null;

  return (
    <div className={styles.page}>
      <ImportCenterApp
        api={api}
        tenantId={tenantId}
        hasPermission={hasPermission}
        basePath="/imports"
        initialJobId={jobId}
        initialView={view}
        appEnv={process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local"}
        LinkComponent={({ href, children }) => <Link href={href}>{children}</Link>}
        onNavigate={(href) => {
          const url = new URL(href, "http://local");
          const next = new URLSearchParams(url.search);
          if (tenantId && !next.get("tenantId")) next.set("tenantId", tenantId);
          router.push(`${url.pathname}?${next.toString()}`);
        }}
      />
    </div>
  );
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<p>Loading Import Center…</p>}>
      <ImportsInner />
    </Suspense>
  );
}
