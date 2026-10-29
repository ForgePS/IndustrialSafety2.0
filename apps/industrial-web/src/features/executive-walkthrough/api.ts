import { apiGet, apiSend } from "@forge/web-kit";
import type {
  WalkthroughExport,
  WalkthroughResolvedConfig,
  WalkthroughSettings,
  WalkthroughValidationResult,
} from "./types";

const BASE = "/api/v1/industrial/executive-walkthrough";

export type CreateExportInput = {
  resolution?: "1080p" | "720p";
  includeNarration?: boolean;
  burnCaptions?: boolean;
  includeIntro?: boolean;
  includeOutro?: boolean;
  videoTitle?: string;
};

export const executiveWalkthroughApi = {
  getConfig(): Promise<WalkthroughResolvedConfig> {
    return apiGet(BASE);
  },

  validate(): Promise<WalkthroughValidationResult> {
    return apiSend(`${BASE}/validate`, "POST", {});
  },

  getSettings(): Promise<WalkthroughSettings> {
    return apiGet(`${BASE}/settings`);
  },

  updateSettings(body: Partial<WalkthroughSettings>): Promise<WalkthroughSettings> {
    return apiSend(`${BASE}/settings`, "PATCH", body);
  },

  ensureNarration(body: { voiceId?: string } = {}): Promise<{
    assets: Array<{ sceneId: string; durationMs: number; downloadUrl: string }>;
  }> {
    return apiSend(`${BASE}/narration/ensure`, "POST", body);
  },

  createExport(body: CreateExportInput = {}): Promise<WalkthroughExport> {
    return apiSend(`${BASE}/exports`, "POST", body);
  },

  getExport(exportId: string): Promise<WalkthroughExport> {
    return apiGet(`${BASE}/exports/${exportId}`);
  },

  listExports(): Promise<{ items: WalkthroughExport[] }> {
    return apiGet(`${BASE}/exports`);
  },

  downloadExport(
    exportId: string,
  ): Promise<{ downloadUrl: string; fileName: string; expiresAt: string }> {
    return apiGet(`${BASE}/exports/${exportId}/download`);
  },

  deleteExport(exportId: string): Promise<{ deleted: boolean }> {
    return apiSend(`${BASE}/exports/${exportId}`, "DELETE", {});
  },

  trackEvent(event: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean }> {
    return apiSend(`${BASE}/events`, "POST", { event, ...payload });
  },
};

export async function resolvePublicRenderSession(token: string): Promise<{
  tenantId: string;
  exportId: string;
  contentVersion: string;
  presentationId: string;
}> {
  return apiGet(`/api/v1/public/executive-walkthrough/render/${encodeURIComponent(token)}`);
}
