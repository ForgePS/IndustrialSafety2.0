import { describe, expect, it } from "vitest";
import {
  decideTrainingVideoCompat,
  fitsMobileLevel31Frame,
  iosRemuxArgs,
  iosTranscodeArgs,
  isLikelyMp4Container,
  isTrainingVideoMime,
} from "./training-video-ios-compat.js";

const goodH264Aac = {
  streams: [
    {
      codec_type: "video" as const,
      codec_name: "h264",
      pix_fmt: "yuv420p",
      profile: "Main",
      width: 1920,
      height: 1080,
      level: 40,
    },
    { codec_type: "audio" as const, codec_name: "aac" },
  ],
};

describe("training-video-ios-compat", () => {
  it("recognizes training video MIME types", () => {
    expect(isTrainingVideoMime("video/mp4")).toBe(true);
    expect(isTrainingVideoMime("application/pdf")).toBe(false);
  });

  it("skips rewrite for already-playable MP4 uploads", () => {
    const decision = decideTrainingVideoCompat(goodH264Aac, {
      mimeType: "video/mp4",
      filename: "course-intro.mp4",
    });
    expect(decision.action).toBe("skip");
  });

  it("remuxes QuickTime MOV that already has H.264/AAC", () => {
    const decision = decideTrainingVideoCompat(goodH264Aac, {
      mimeType: "video/quicktime",
      filename: "phone-recording.mov",
    });
    expect(decision.action).toBe("remux");
  });

  it("detects MP4 vs QuickTime containers", () => {
    expect(isLikelyMp4Container({ filename: "a.mp4", mimeType: "video/mp4" })).toBe(true);
    expect(isLikelyMp4Container({ filename: "a.mov", mimeType: "video/quicktime" })).toBe(false);
  });

  it("transcodes non-conformant Level 3.1 at 1080p", () => {
    const decision = decideTrainingVideoCompat({
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          pix_fmt: "yuv420p",
          profile: "Constrained Baseline",
          width: 1920,
          height: 1080,
          level: 31,
        },
        { codec_type: "audio", codec_name: "aac" },
      ],
      format: { tags: { major_brand: "isom" } },
    });
    expect(decision.action).toBe("transcode");
    expect(decision.reason).toMatch(/non-conformant|Baseline/i);
  });

  it("transcodes HEVC / Opus", () => {
    expect(
      decideTrainingVideoCompat({
        streams: [{ codec_type: "video", codec_name: "hevc", pix_fmt: "yuv420p" }],
      }).action,
    ).toBe("transcode");
    expect(
      decideTrainingVideoCompat({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            pix_fmt: "yuv420p",
            width: 1280,
            height: 720,
            level: 31,
          },
          { codec_type: "audio", codec_name: "opus" },
        ],
      }).action,
    ).toBe("transcode");
  });

  it("builds ultrafast Main@4.0 transcode args", () => {
    expect(iosRemuxArgs("in.mp4", "out.mp4")).toContain("+faststart");
    const args = iosTranscodeArgs("in.mp4", "out.mp4");
    expect(args).toEqual(
      expect.arrayContaining([
        "libx264",
        "ultrafast",
        "28",
        "main",
        "4.0",
        "yuv420p",
        "aac",
        "+faststart",
      ]),
    );
    expect(args).toContain("scale='min(960,iw)':-2");
  });

  it("detects Level 3.1-safe frames", () => {
    expect(fitsMobileLevel31Frame(1280, 720)).toBe(true);
    expect(fitsMobileLevel31Frame(1920, 1080)).toBe(false);
  });
});
