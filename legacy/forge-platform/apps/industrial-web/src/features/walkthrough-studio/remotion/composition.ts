/**
 * Remotion composition contract for Walkthrough Studio MP4 exports.
 *
 * Runtime note:
 * - Interactive + current MP4 path still use Playwright + FFmpeg.
 * - Set WALKTHROUGH_RENDER_ENGINE=remotion once the Fargate Remotion worker is deployed.
 * - This file defines the shared composition props so both engines consume one timeline.
 *
 * Recommended Remotion package (future):
 *   @remotion/cli, remotion, @remotion/renderer, @remotion/bundler
 * Output: 1920x1080, 30fps, H.264 + AAC, fast-start MP4.
 */

import {
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  flattenWalkthroughScenes,
  type WalkthroughScene,
  type WalkthroughDefinition,
} from "@forge/contracts";

export const WALKTHROUGH_VIDEO_WIDTH = 1920;
export const WALKTHROUGH_VIDEO_HEIGHT = 1080;
export const WALKTHROUGH_VIDEO_FPS = 30;

export type WalkthroughRemotionScene = {
  id: string;
  name: string;
  route: string;
  narrationText: string;
  durationInFrames: number;
  audioUrl?: string | null;
  targetSelector?: string;
  captionText?: string;
};

export type WalkthroughRemotionCompositionProps = {
  walkthroughId: string;
  title: string;
  tagline?: string;
  closingTagline?: string;
  voiceProfileId: string;
  captionsMode: "off" | "burned_in" | "subtitle_track";
  scenes: WalkthroughRemotionScene[];
  /** Absolute or signed URLs for branding assets. */
  logoUrl?: string | null;
};

export function msToFrames(ms: number, fps = WALKTHROUGH_VIDEO_FPS): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

export function buildRemotionCompositionProps(input: {
  definition?: WalkthroughDefinition;
  voiceProfileId: string;
  captionsMode?: "off" | "burned_in" | "subtitle_track";
  audioBySceneId?: Record<string, string>;
  logoUrl?: string | null;
}): WalkthroughRemotionCompositionProps {
  const definition = input.definition ?? INDUSTRIAL_PLATFORM_WALKTHROUGH;
  const scenes = flattenWalkthroughScenes(definition).map((scene: WalkthroughScene) => {
    const mapped: WalkthroughRemotionScene = {
      id: scene.id,
      name: scene.name,
      route: scene.route,
      narrationText: scene.narrationText,
      durationInFrames: msToFrames(scene.durationMs),
      audioUrl: input.audioBySceneId?.[scene.id] ?? null,
      captionText: scene.captionText ?? scene.narrationText,
    };
    if (scene.targetSelector) mapped.targetSelector = scene.targetSelector;
    return mapped;
  });

  return {
    walkthroughId: definition.id,
    title: definition.name,
    voiceProfileId: input.voiceProfileId,
    captionsMode: input.captionsMode ?? "off",
    scenes,
    logoUrl: input.logoUrl ?? null,
    ...(definition.tagline ? { tagline: definition.tagline } : {}),
    ...(definition.closingTagline ? { closingTagline: definition.closingTagline } : {}),
  };
}

export function estimateCompositionDurationFrames(
  props: WalkthroughRemotionCompositionProps,
): number {
  return props.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
}

/**
 * Pseudocode Remotion Root (install remotion packages before enabling):
 *
 * export const RemotionRoot = () => (
 *   <Composition
 *     id="ForgeIndustrialWalkthrough"
 *     component={WalkthroughComposition}
 *     durationInFrames={estimateCompositionDurationFrames(defaultProps)}
 *     fps={WALKTHROUGH_VIDEO_FPS}
 *     width={WALKTHROUGH_VIDEO_WIDTH}
 *     height={WALKTHROUGH_VIDEO_HEIGHT}
 *     defaultProps={defaultProps}
 *   />
 * );
 */
export const REMOTION_COMPOSITION_ID = "ForgeIndustrialWalkthrough" as const;
