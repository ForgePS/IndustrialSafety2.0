import { describe, expect, it } from "vitest";
import {
  buildRemotionCompositionProps,
  estimateCompositionDurationFrames,
  msToFrames,
  WALKTHROUGH_VIDEO_FPS,
} from "./composition";

describe("walkthrough remotion composition contract", () => {
  it("converts milliseconds to frames", () => {
    expect(msToFrames(1000)).toBe(WALKTHROUGH_VIDEO_FPS);
    expect(msToFrames(0)).toBe(1);
  });

  it("builds composition props from the industrial walkthrough", () => {
    const props = buildRemotionCompositionProps({
      voiceProfileId: "forge-female-warm",
      captionsMode: "off",
    });
    expect(props.scenes.length).toBeGreaterThan(10);
    expect(props.title).toContain("Forge Industrial Safety");
    expect(estimateCompositionDurationFrames(props)).toBeGreaterThan(1000);
  });
});
