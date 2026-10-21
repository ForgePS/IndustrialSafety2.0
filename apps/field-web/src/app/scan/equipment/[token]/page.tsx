import { ScanEquipmentClient } from "./scan-equipment-client";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function ScanEquipmentPage() {
  return <ScanEquipmentClient />;
}
