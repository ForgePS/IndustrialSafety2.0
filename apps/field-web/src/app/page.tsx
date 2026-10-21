"use client";

import { HomeScreen } from "@/components/home-screen";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { useAuth } from "@forge/web-kit";

export default function HomePage() {
  const { profile } = useFieldProfile();
  const { me } = useAuth();
  const tenantName =
    me?.tenants?.find((t) => t.tenantId === me.tenantId)?.displayName ?? "";

  return <HomeScreen profile={profile} tenantName={tenantName} />;
}
