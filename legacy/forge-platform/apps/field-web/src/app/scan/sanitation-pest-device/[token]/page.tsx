import { SanitationPestDeviceScanClient } from "./sanitation-pest-device-scan-client";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function SanitationPestDeviceScanPage() {
  return <SanitationPestDeviceScanClient />;
}
