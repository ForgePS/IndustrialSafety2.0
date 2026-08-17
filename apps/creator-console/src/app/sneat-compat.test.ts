import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, "sneat-compat.css"), "utf8");

describe("sneat-compat contract", () => {
  it("keeps forge page and panel layout selectors", () => {
    expect(css).toContain(".forge-page");
    expect(css).toContain(".forge-page__panel");
    expect(css).toContain(".forge-checkbox-row");
    expect(css).toMatch(/label\s*>\s*input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  });

  it("does not use 100vw on content containers", () => {
    expect(css).not.toMatch(/\.forge-content\s*\{[^}]*100vw/);
    expect(css).not.toMatch(/\.forge-shell\s*\{[^}]*100vw/);
  });

  it("keeps danger button specificity used by @forge/ui", () => {
    expect(css).toContain("button.forge-btn.forge-btn--danger");
  });

  it("aliases forge tokens to Sneat/Bootstrap variables", () => {
    expect(css).toContain("--forge-color-primary: var(--bs-primary");
    expect(css).toContain("--forge-color-bg: var(--bs-body-bg");
  });
});
