/**
 * Remotion Walkthrough Composition (scaffold).
 * Enable by installing remotion packages and setting WALKTHROUGH_RENDER_ENGINE=remotion.
 * Until then, Playwright + FFmpeg remains the production renderer.
 */
export {
  WALKTHROUGH_VIDEO_WIDTH,
  WALKTHROUGH_VIDEO_HEIGHT,
  WALKTHROUGH_VIDEO_FPS,
  REMOTION_COMPOSITION_ID,
  buildRemotionCompositionProps,
  estimateCompositionDurationFrames,
  msToFrames,
  type WalkthroughRemotionCompositionProps,
  type WalkthroughRemotionScene,
} from "./composition";
