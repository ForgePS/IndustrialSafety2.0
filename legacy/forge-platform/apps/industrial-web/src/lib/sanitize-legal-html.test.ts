import { describe, expect, it } from "vitest";
import { sanitizeLegalHtml } from "./sanitize-legal-html";

describe("sanitizeLegalHtml", () => {
  it("strips script tags and event handlers", () => {
    const dirty =
      '<p onclick="alert(1)">Hello</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
    const clean = sanitizeLegalHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toMatch(/Hello/);
  });
});
