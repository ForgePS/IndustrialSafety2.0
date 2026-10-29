import { Suspense } from "react";
import DemoIndustrialPage from "./DemoIndustrialClient";

export default function DemoIndustrialRoute() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Loading demo walkthrough…</p>}>
      <DemoIndustrialPage />
    </Suspense>
  );
}
