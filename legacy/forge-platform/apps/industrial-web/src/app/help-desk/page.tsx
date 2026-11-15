"use client";

import { Suspense } from "react";
import { HelpCenterWorkspace } from "@/components/helpdesk/help-center-workspace";

export default function HelpDeskPage() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Loading Help Desk…</p>}>
      <HelpCenterWorkspace />
    </Suspense>
  );
}
