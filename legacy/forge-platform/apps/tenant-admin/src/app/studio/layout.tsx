import { Suspense } from "react";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p>Loading configuration studio…</p>}>{children}</Suspense>;
}
