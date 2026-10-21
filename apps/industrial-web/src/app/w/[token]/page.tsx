import { Suspense } from "react";
import PublicShareWalkthroughClient from "./PublicShareWalkthroughClient";

export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function PublicSharePage() {
  return (
    <Suspense fallback={<p className="text-muted m-4">Loading shared walkthrough…</p>}>
      <PublicShareWalkthroughClient />
    </Suspense>
  );
}
