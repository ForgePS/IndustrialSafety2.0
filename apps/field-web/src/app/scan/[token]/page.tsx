import { ScanTokenClient } from "./scan-token-client";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function ScanTokenPage() {
  return <ScanTokenClient />;
}
