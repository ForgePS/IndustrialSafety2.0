"use client";

import { useParams } from "next/navigation";
import { ScanResultHub } from "@/components/scan-result-hub";
import { useFieldPathname } from "@/hooks/use-field-pathname";
import { resolveScanPublicToken } from "@/lib/scan-public";

export function ScanEquipmentClient() {
  const params = useParams<{ token: string }>();
  const pathname = useFieldPathname();
  const token = resolveScanPublicToken({
    pathname,
    routeToken: params?.token,
  });

  if (!token || token === "placeholder") {
    return (
      <>
        <h1 className="ff-page-title">Missing equipment token</h1>
        <p className="ff-page-body">Use a valid equipment QR deep link.</p>
      </>
    );
  }
  return <ScanResultHub token={token} />;
}
