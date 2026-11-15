/**
 * Executive / platform walkthrough — thin compatibility layer over Walkthrough Studio.
 * Interactive playback, captions, narration, and MP4 timing share one scene source.
 */

export {
  INDUSTRIAL_PLATFORM_WALKTHROUGH_ID as EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
  INDUSTRIAL_DEMO_TENANT_SLUG as EXECUTIVE_WALKTHROUGH_TENANT_KEY,
  WALKTHROUGH_STUDIO_SESSION_KEY as EXECUTIVE_WALKTHROUGH_SESSION_KEY,
  WALKTHROUGH_STUDIO_SESSION_EVENT as EXECUTIVE_WALKTHROUGH_SESSION_EVENT,
  WALKTHROUGH_RUNTIME_MAX_MS as EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS,
  WALKTHROUGH_RUNTIME_ORANGE_MS as EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS,
  WALKTHROUGH_DEFAULT_VOICE_STYLE as EXECUTIVE_WALKTHROUGH_VOICE_DIRECTION,
  flattenWalkthroughScenes,
  estimateWalkthroughStudioRuntimeMs as estimateWalkthroughRuntimeMs,
  type WalkthroughEngineAction as WalkthroughAction,
  type WalkthroughScene as WalkthroughStep,
} from "./walkthrough-studio.js";

import {
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  flattenWalkthroughScenes,
  buildWalkthroughMp4Filename,
} from "./walkthrough-studio.js";

export const EXECUTIVE_WALKTHROUGH_STEPS = flattenWalkthroughScenes(
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
).map((scene) => ({
  ...scene,
  title: scene.name,
}));

export const EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE = INDUSTRIAL_PLATFORM_WALKTHROUGH.name;

export const EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME = buildWalkthroughMp4Filename();
