import { DvirClient } from "./dvir-client";

export function generateStaticParams() {
  return [{ vehicleId: "placeholder" }];
}

export default function DvirPage() {
  return <DvirClient />;
}
