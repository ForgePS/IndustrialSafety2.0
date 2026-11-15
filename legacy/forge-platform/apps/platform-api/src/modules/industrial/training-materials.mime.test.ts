import { describe, expect, it } from "vitest";
import {
  isTrainingVideoFile,
  resolveTrainingVideoPlaybackMime,
} from "./training-materials.mime.js";

describe("isTrainingVideoFile", () => {
  it("detects by MIME", () => {
    expect(isTrainingVideoFile({ mimeType: "video/mp4" })).toBe(true);
    expect(isTrainingVideoFile({ mimeType: "video/webm" })).toBe(true);
    expect(isTrainingVideoFile({ mimeType: "application/pdf" })).toBe(false);
  });

  it("falls back to filename when MIME is missing or generic", () => {
    expect(
      isTrainingVideoFile({ mimeType: "application/octet-stream", filename: "safety.mp4" }),
    ).toBe(true);
    expect(isTrainingVideoFile({ mimeType: "", originalFilename: "clip.MOV" })).toBe(true);
    expect(isTrainingVideoFile({ mimeType: null, fileName: "deck.pptx" })).toBe(false);
  });

  it("resolves playback MIME for mobile browsers", () => {
    expect(
      resolveTrainingVideoPlaybackMime({
        mimeType: "application/octet-stream",
        filename: "lesson.mp4",
      }),
    ).toBe("video/mp4");
    expect(
      resolveTrainingVideoPlaybackMime({ mimeType: "video/quicktime", filename: "clip.mov" }),
    ).toBe("video/mp4");
    expect(resolveTrainingVideoPlaybackMime({ mimeType: "video/webm", filename: "x.webm" })).toBe(
      "video/webm",
    );
  });
});
