import { apiGet, apiSend } from "@forge/web-kit";

const BASE = "/api/v1/industrial/walkthrough-studio";

export const walkthroughStudioApi = {
  list: () => apiGet<{ items: WalkthroughCardDto[]; runtime: RuntimeDto }>(BASE),
  get: (id: string) => apiGet<WalkthroughDetailDto>(`${BASE}/${encodeURIComponent(id)}`),
  validate: (id: string) =>
    apiSend<ValidationDto>(`${BASE}/${encodeURIComponent(id)}/validate`, "POST", {}),
  patchScene: (id: string, body: Record<string, unknown>) =>
    apiSend<WalkthroughDetailDto>(`${BASE}/${encodeURIComponent(id)}/scenes`, "PATCH", body),
  voices: () =>
    apiGet<{ items: VoiceDto[]; defaultVoiceProfileId: string; styleInstructions: string }>(
      `${BASE}/voices`,
    ),
  previewVoice: (body: { voiceProfileId: string; sampleText?: string }) =>
    apiSend<{
      voice: VoiceDto;
      sampleText: string;
      durationMs: number;
      downloadUrl: string | null;
      note?: string;
    }>(`${BASE}/voices/preview`, "POST", body),
  demo: () => apiGet<DemoEnvironmentDto>(`${BASE}/demo`),
  enableDemo: (enabled = true) =>
    apiSend<DemoEnvironmentDto>(`${BASE}/demo/enable`, "POST", { enabled }),
  resetDemo: () =>
    apiSend<{ ok: boolean; message: string; resetAt: string }>(`${BASE}/demo/reset`, "POST", {}),
  listExports: () =>
    apiGet<{ items: unknown; studioExports: ExportRowDto[]; filenamePattern: string }>(
      `${BASE}/exports`,
    ),
  createExport: (body: Record<string, unknown>) =>
    apiSend<Record<string, unknown>>(`${BASE}/exports`, "POST", body),
  downloadExport: (exportId: string) =>
    apiGet<{ downloadUrl: string; fileName: string; expiresAt: string }>(
      `${BASE}/exports/${encodeURIComponent(exportId)}/download`,
    ),
  seedStatus: () =>
    apiGet<NonNullable<DemoEnvironmentDto["seedStatus"]>>(`${BASE}/demo/seed-status`),
  listShares: (id: string) =>
    apiGet<{ items: ShareLinkDto[] }>(`${BASE}/${encodeURIComponent(id)}/share-links`),
  createShare: (id: string, body: Record<string, unknown>) =>
    apiSend<ShareLinkDto & { secret?: string; shareUrl: string }>(
      `${BASE}/${encodeURIComponent(id)}/share-links`,
      "POST",
      body,
    ),
  revokeShare: (id: string, shareLinkId: string) =>
    apiSend<{ id: string; publicToken: string; path: string; isRevoked: boolean }>(
      `${BASE}/${encodeURIComponent(id)}/share-links/${encodeURIComponent(shareLinkId)}/revoke`,
      "POST",
      {},
    ),
  analytics: () => apiGet<AnalyticsDto>(`${BASE}/analytics`),
  trackEvent: (body: Record<string, unknown>) =>
    apiSend<{ ok: boolean }>(`${BASE}/events`, "POST", body),
};

export type RuntimeDto = {
  narrationMs: number;
  totalMs: number;
  status: "green" | "yellow" | "orange" | "red";
  formatted: string;
  underLimit: boolean;
  chapterCount: number;
  sceneCount: number;
};

export type WalkthroughCardDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  version: string;
  runtimeMs: number;
  runtimeFormatted: string;
  runtimeStatus: string;
  chapterCount: number;
  voice: { id: string; displayName: string; provider: string };
  lastModifiedAt: string;
  lastGeneratedAt: string | null;
  interactiveStatus: string;
  mp4Status: string;
};

export type VoiceDto = {
  id: string;
  displayName: string;
  gender: string;
  accent: string;
  tone: string;
  provider: string;
  providerVoiceId: string;
  style: string;
  category: string;
  recommended?: boolean;
};

export type SceneDto = {
  id: string;
  name: string;
  module: string;
  route: string;
  durationMs: number;
  narrationText: string;
  narrationEstimateMs: number;
  availablePauseMs: number;
  tightness: "green" | "yellow" | "red";
};

export type WalkthroughDetailDto = {
  walkthrough: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
    version: string;
    defaultVoiceProfileId: string;
    tagline?: string;
    closingTagline?: string;
  };
  chapters: Array<{ id: string; title: string; order: number; targetDurationMs: number }>;
  scenes: SceneDto[];
  voices: VoiceDto[];
  runtime: RuntimeDto;
};

export type ValidationDto = {
  ok: boolean;
  canPublish: boolean;
  runtime: RuntimeDto;
  issues: Array<{ severity: string; code: string; message: string }>;
};

export type DemoEnvironmentDto = {
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    isDemoTenant: boolean;
    suggestedSlug: string;
    suggestedCompany: string;
  } | null;
  seedTargets: Record<string, number>;
  seedVersions: unknown[];
  seedStatus?: {
    activeSeed: unknown;
    liveCounts: {
      personnel: number;
      sites: number;
      departments?: number;
      incidents?: number;
      inspections?: number;
      vehicles?: number;
      equipmentAssets?: number;
      tasks?: number;
      trainingAssignments?: number;
      safetySupplyItems?: number;
    };
    targets: Record<string, number>;
  };
  safety: Record<string, boolean>;
};

export type ExportRowDto = {
  id: string;
  exportJobId?: string | null;
  voiceProfileId: string | null;
  resolution: string;
  durationMs: number | null;
  status: string;
  fileSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
  downloadReady?: boolean;
};

export type ShareLinkDto = {
  id: string;
  publicToken: string;
  path: string;
  expiresAt: string | null;
  requirePin: boolean;
  allowInteractive: boolean;
  allowVideoDownload: boolean;
  allowChapterNavigation: boolean;
  isRevoked?: boolean;
  createdAt?: string;
};

export type AnalyticsDto = {
  starts: number;
  completions: number;
  replays: number;
  exploreSelections: number;
  mp4Downloads: number;
  chapterExits: Record<string, number>;
  mostViewedModules: Array<{ chapterKey: string; count: number }>;
};
