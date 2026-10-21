import { describe, expect, it } from "vitest";
import {
  clipboardLooksLikeImage,
  imagesFromClipboardEvent,
  isDisplayableLotoImageUrl,
  isLotoImageFile,
  looksLikeImageUrl,
} from "./loto-clipboard-images";

describe("loto-clipboard-images", () => {
  it("accepts common image files", () => {
    expect(isLotoImageFile(new File([""], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isLotoImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
    expect(isLotoImageFile(new File([""], "a.pdf", { type: "application/pdf" }))).toBe(false);
  });

  it("detects displayable image URLs", () => {
    expect(isDisplayableLotoImageUrl("data:image/jpeg;base64,abc")).toBe(true);
    expect(isDisplayableLotoImageUrl("https://cdn.example/x.jpg")).toBe(true);
    expect(isDisplayableLotoImageUrl("blob:https://app/1")).toBe(true);
    expect(isDisplayableLotoImageUrl("s3://bucket/key")).toBe(false);
    expect(isDisplayableLotoImageUrl("tenant/loto/step.png")).toBe(false);
  });

  it("extracts image files from a paste event", () => {
    const file = new File(["x"], "clip.png", { type: "image/png" });
    const event = {
      clipboardData: {
        files: [file],
        items: [],
        types: ["Files"],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;
    expect(imagesFromClipboardEvent(event)).toEqual([file]);
    expect(clipboardLooksLikeImage(event)).toBe(true);
  });

  it("detects image URLs in clipboard text", () => {
    expect(looksLikeImageUrl("https://cdn.example.com/photo.jpg")).toBe(true);
    expect(looksLikeImageUrl("https://example.com/page")).toBe(false);
    const event = {
      clipboardData: {
        files: [],
        items: [],
        types: ["text/plain"],
        getData: (type: string) => (type === "text/plain" ? "https://cdn.example.com/a.png" : ""),
      },
    } as unknown as ClipboardEvent;
    expect(clipboardLooksLikeImage(event)).toBe(true);
  });
});
