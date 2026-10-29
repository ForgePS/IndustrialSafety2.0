"use client";

import { Suspense } from "react";
import { SupportConsoleWorkspace } from "@/components/helpdesk/support-console-workspace";

export default function SupportConsolePage() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Loading support console…</p>}>
      <SupportConsoleWorkspace />
    </Suspense>
  );
}
