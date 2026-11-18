"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { InspectionRunner } from "@/components/inspection-runner";

function InspectionInner() {
  const params = useParams<{ inspectionId: string }>();
  const search = useSearchParams();
  const id = String(params?.inspectionId ?? "").trim();
  const isNew = !id || id === "new" || id === "placeholder";

  return (
    <InspectionRunner
      inspectionId={isNew ? null : id}
      {...(isNew
        ? {
            startContext: {
              targetType: search.get("targetType"),
              targetId: search.get("targetId"),
              qrLinkId: search.get("qrLinkId"),
              frequency: search.get("frequency"),
              templateId: search.get("templateId"),
              scanToken: search.get("scanToken"),
            },
          }
        : {})}
    />
  );
}

export function InspectionClient() {
  return (
    <Suspense fallback={<p className="ff-page-body">Loading inspection…</p>}>
      <InspectionInner />
    </Suspense>
  );
}
