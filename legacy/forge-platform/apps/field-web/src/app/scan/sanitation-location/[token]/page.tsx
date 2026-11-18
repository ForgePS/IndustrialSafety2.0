import { SanitationLocationScanClient } from "./sanitation-location-scan-client";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function SanitationLocationScanPage() {
  return <SanitationLocationScanClient />;
}
