import { describe, expect, it } from "vitest";
import { canInlinePreview } from "./training-api";

describe("training helpers", () => {
  it("detects inline previewable media", () => {
    expect(canInlinePreview("application/pdf")).toBe(true);
    expect(canInlinePreview("image/png")).toBe(true);
    expect(canInlinePreview("video/mp4")).toBe(true);
    expect(canInlinePreview("application/vnd.ms-powerpoint")).toBe(false);
  });
});
