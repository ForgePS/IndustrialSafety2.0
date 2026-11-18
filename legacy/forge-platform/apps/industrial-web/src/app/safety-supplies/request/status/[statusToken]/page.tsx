import { SafetySupplyRequestStatusClient } from "@/components/safety-supply-request-status-client";

export function generateStaticParams() {
  return [{ statusToken: "placeholder" }];
}

export default function SafetySupplyRequestStatusPage() {
  return <SafetySupplyRequestStatusClient />;
}
