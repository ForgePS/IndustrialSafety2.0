"use client";

/**
 * Legacy module route — redirects into the Reporting Center.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportingWorkspace(_props: { moduleName: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reporting/");
  }, [router]);

  return <p className="text-muted mb-0">Opening Reporting Center…</p>;
}
