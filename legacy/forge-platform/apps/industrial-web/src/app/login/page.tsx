"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@forge/web-kit";

/**
 * Static export target for `/login/` — Cognito/logout fallbacks and bookmarks.
 * Unauthenticated users see IndustrialShell GateCard on this route; authenticated
 * users are sent home.
 */
export default function LoginPage() {
  const router = useRouter();
  const { me, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (me) router.replace("/");
  }, [loading, me, router]);

  return null;
}
