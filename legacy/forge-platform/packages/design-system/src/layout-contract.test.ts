import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles.css"), "utf8");

describe("CREATOR-UX-REPAIR layout CSS contract", () => {
  it("does not style checkboxes as full-width text fields", () => {
    // Labels may carry a :not(...) exclusion (e.g. topbar controls); the checkbox/radio guard must stay.
    expect(css).toMatch(
      /label(?::not\([^)]*\))?\s*>\s*input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/,
    );
    expect(css).not.toMatch(/label\s*>\s*input\s*,/);
    expect(css).toContain(".forge-checkbox-row");
    expect(css).toContain(".forge-page");
    expect(css).toContain(".forge-page__panel");
  });

  it("keeps shell content parent-relative (no 100vw content width)", () => {
    expect(css).toMatch(/\.forge-content\s*\{[^}]*width:\s*100%;/s);
    expect(css).not.toMatch(/\.forge-content\s*\{[^}]*100vw/s);
    expect(css).not.toMatch(/\.forge-shell\s*\{[^}]*100vw/s);
  });

  it("gives danger buttons higher specificity than button.forge-btn", () => {
    expect(css).toContain("button.forge-btn.forge-btn--danger");
  });
});
