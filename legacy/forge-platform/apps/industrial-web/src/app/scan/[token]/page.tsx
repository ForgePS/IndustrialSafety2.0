import { ScanPublicWorkspace } from "@/components/scan-public-workspace";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function ScanTokenPage() {
  return <ScanPublicWorkspace />;
}
