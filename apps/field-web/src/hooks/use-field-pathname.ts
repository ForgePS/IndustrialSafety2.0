"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Pathname with a client fallback for static export / CloudFront rewrite. */
export function useFieldPathname(): string {
  const pathname = usePathname();
  const [clientPath, setClientPath] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.location.pathname : null,
  );

  useEffect(() => {
    setClientPath(window.location.pathname);
  }, [pathname]);

  const fromWindow = clientPath && clientPath.length > 0 ? clientPath : null;
  // CloudFront viewer-request rewrites serve /…/placeholder/index.html while the
  // address bar keeps the real id. Prefer the browser path in that case.
  if (fromWindow && (!pathname || pathname.includes("/placeholder"))) {
    return fromWindow;
  }
  if (pathname && pathname.length > 0) return pathname;
  if (fromWindow) return fromWindow;
  return "/";
}
