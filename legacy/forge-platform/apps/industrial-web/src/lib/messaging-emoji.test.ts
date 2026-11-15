import { describe, expect, it } from "vitest";
import { insertTextAtSelection, MESSAGING_EMOJI_GROUPS } from "./messaging-emoji";

describe("messaging emoji helpers", () => {
  it("exposes emoji groups", () => {
    expect(MESSAGING_EMOJI_GROUPS.length).toBeGreaterThan(0);
    expect(MESSAGING_EMOJI_GROUPS[0]?.emojis.length).toBeGreaterThan(0);
  });

  it("inserts emoji at the caret", () => {
    expect(insertTextAtSelection("hello", "😀", 5, 5)).toEqual({
      next: "hello😀",
      caret: 7,
    });
    expect(insertTextAtSelection("ab", "👍", 1, 1)).toEqual({
      next: "a👍b",
      caret: 3,
    });
  });
});
