import { InspectionClient } from "./inspection-client";

export function generateStaticParams() {
  return [{ inspectionId: "placeholder" }, { inspectionId: "new" }];
}

export default function InspectionPage() {
  return <InspectionClient />;
}
