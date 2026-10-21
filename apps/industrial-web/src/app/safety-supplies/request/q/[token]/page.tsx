import { SafetySupplyRequestPublicWorkspace } from "@/components/safety-supply-request-public-workspace";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function SafetySupplyRequestQrPage() {
  return <SafetySupplyRequestPublicWorkspace />;
}
