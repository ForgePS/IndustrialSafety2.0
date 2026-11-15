"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ScanResultHub } from "@/components/scan-result-hub";
import { useFieldPathname } from "@/hooks/use-field-pathname";
import { resolveScanPublicToken } from "@/lib/scan-public";

function ScanTokenInner() {
  const params = useParams<{ token: string }>();
  const pathname = useFieldPathname();
  const search = useSearchParams();
  const token = resolveScanPublicToken({
    pathname,
    queryToken: search.get("token"),
    routeToken: params?.token,
  });

  if (!token || token === "placeholder") {
    return (
      <>
        <h1 className="ff-page-title">Missing QR token</h1>
        <p className="ff-page-body">Scan a sticker or open a valid Field deep link.</p>
      </>
    );
  }

  return <ScanResultHub token={token} />;
}

export function ScanTokenClient() {
  return (
    <Suspense fallback={<p className="ff-page-body">Loading scan…</p>}>
      <ScanTokenInner />
    </Suspense>
  );
}
