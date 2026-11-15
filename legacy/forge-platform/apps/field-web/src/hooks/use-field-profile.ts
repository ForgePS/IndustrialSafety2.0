"use client";

import { useEffect, useState } from "react";
import { apiGet, useAuth } from "@forge/web-kit";

export type FieldProfile = {
  displayName: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  personnelId: string | null;
  roles: Array<{ roleCode: string; roleName: string }>;
};

export function useFieldProfile() {
  const { me } = useAuth();
  const [profile, setProfile] = useState<FieldProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!me?.userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await apiGet<FieldProfile>("/api/v1/auth/profile");
        if (!cancelled) setProfile(result);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.userId, me?.tenantId]);

  return { profile, loading };
}
