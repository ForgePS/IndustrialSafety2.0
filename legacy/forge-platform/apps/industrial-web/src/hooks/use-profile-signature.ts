"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@forge/web-kit";

type AuthProfileSignature = {
  personnelId: string | null;
  signatureUrl: string | null;
};

/**
 * Loads the signed-in user's linked personnel signature from /auth/profile
 * so form signature pads can offer "Use my signature".
 */
export function useProfileSignature(enabled = true): {
  signatureUrl: string | null;
  personnelId: string | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [personnelId, setPersonnelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setSignatureUrl(null);
      setPersonnelId(null);
      return;
    }
    setLoading(true);
    try {
      const profile = await apiGet<AuthProfileSignature>("/api/v1/auth/profile");
      const url =
        typeof profile.signatureUrl === "string" && profile.signatureUrl.trim() !== ""
          ? profile.signatureUrl.trim()
          : null;
      setSignatureUrl(url);
      setPersonnelId(
        typeof profile.personnelId === "string" && profile.personnelId.trim() !== ""
          ? profile.personnelId
          : null,
      );
    } catch {
      setSignatureUrl(null);
      setPersonnelId(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { signatureUrl, personnelId, loading, reload };
}
