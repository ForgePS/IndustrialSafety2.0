"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy More hub — redirects to Me (primary profile / tools tab). */
export default function MorePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/me/");
  }, [router]);
  return (
    <p className="ff-page-body" role="status">
      Opening Me…
    </p>
  );
}
