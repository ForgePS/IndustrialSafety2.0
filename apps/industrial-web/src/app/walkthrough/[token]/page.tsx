import { Suspense } from "react";
import { PublicWalkthroughRenderClient } from "@/features/executive-walkthrough/PublicWalkthroughRenderClient";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function PublicWalkthroughRenderPage() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Preparing render session…</p>}>
      <PublicWalkthroughRenderClient />
    </Suspense>
  );
}
