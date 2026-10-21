import { EquipmentDetailClient } from "./equipment-client";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function EquipmentPage() {
  return <EquipmentDetailClient />;
}
