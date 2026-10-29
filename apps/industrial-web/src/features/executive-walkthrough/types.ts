import { EXECUTIVE_WALKTHROUGH_SESSION_KEY } from "@forge/contracts";

export type WalkthroughPlaybackMode = "interactive" | "render";

export type WalkthroughSessionState = {
  active: boolean;
  mode: WalkthroughPlaybackMode;
  stepIndex: number;
  playing: boolean;
  muted: boolean;
  captions: boolean;
  narrationEnabled: boolean;
  voiceId: string;
  startedAt: string | null;
  contentVersion: string;
  highlightTarget: string | null;
  card: "opening" | "closing" | null;
};

export type WalkthroughExportStatus =
  "queued" | "preparing" | "rendering" | "encoding" | "uploading" | "completed" | "failed";

export type WalkthroughExport = {
  id: string;
  status: WalkthroughExportStatus;
  progress: number;
  videoTitle: string;
  resolution: "1080p" | "720p";
  includeNarration: boolean;
  burnCaptions: boolean;
  durationSeconds?: number;
  downloadUrl?: string;
  fileName?: string;
  errorMessage?: string;
  contentVersion: string;
  requestedAt: string;
  completedAt?: string;
};

export type WalkthroughValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  sceneId?: string;
};

export type WalkthroughValidationResult = {
  ready: boolean;
  projectedRuntimeMs: number;
  issues: WalkthroughValidationIssue[];
};

export type WalkthroughSettings = {
  enabled: boolean;
  voiceId: string;
  narrationSpeed: number;
  captionsDefault: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  exportResolution: "1080p" | "720p";
  retentionDays: number | null;
  closingText: string | null;
};

export type WalkthroughNarrationAsset = {
  sceneId: string;
  durationMs: number;
  downloadUrl: string;
  contentType: string;
};

export type WalkthroughResolvedConfig = {
  presentationId: string;
  contentVersion: string;
  tenantDisplayName: string;
  settings: WalkthroughSettings;
  steps: Array<{
    id: string;
    title: string;
    route: string;
    durationMs: number;
    narrationText: string;
    targetSelector?: string;
    secondarySelectors?: string[];
    requiredModule?: string;
    skipIfUnavailable?: boolean;
    narration?: WalkthroughNarrationAsset | null;
  }>;
  latestExport: WalkthroughExport | null;
  validation: WalkthroughValidationResult;
};

export const WALKTHROUGH_SESSION_KEY = EXECUTIVE_WALKTHROUGH_SESSION_KEY;
