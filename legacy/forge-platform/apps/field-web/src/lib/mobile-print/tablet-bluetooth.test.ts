import { describe, expect, it } from "vitest";
import { isAndroidTablet, isIosLikeDevice } from "./tablet-bluetooth";

describe("tablet bluetooth device detection", () => {
  it("treats iPadOS desktop UA as iOS", () => {
    expect(isIosLikeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(
      true,
    );
  });

  it("does not treat a Mac as iOS", () => {
    expect(isIosLikeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(
      false,
    );
  });

  it("detects Android tablets but not phones", () => {
    expect(isAndroidTablet("Mozilla/5.0 (Linux; Android 14; Pixel Tablet)")).toBe(true);
    expect(isAndroidTablet("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")).toBe(false);
  });
});
