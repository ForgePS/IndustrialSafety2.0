import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertCanComplete,
  defaultInspectionTitle,
  FALLBACK_INSPECTION_TEMPLATE,
  itemsFromTemplate,
  normalizeInspectionTemplateItems,
  parseRunItems,
} from "./inspection-helpers.js";

describe("inspection-helpers", () => {
  it("defaults title to yy-mm-dd Department (UTC)", () => {
    const d = new Date(Date.UTC(2026, 7, 19, 18, 0, 0));
    expect(defaultInspectionTitle("Mill", d)).toBe("26-08-19 Mill");
  });

  it("normalizes legacy checklist payloads", () => {
    const items = normalizeInspectionTemplateItems({
      sections: [{ title: "A", questions: [{ text: "Clear floors?" }] }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Clear floors?");
  });

  it("maps NO items for CA creation payload", () => {
    const items = parseRunItems(
      itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE).map((item, index) => ({
        ...item,
        answer: index === 0 ? "NO" : "YES",
        notes: index === 0 ? "Trip hazard" : "",
      })),
    );
    expect(() => assertCanComplete(items)).not.toThrow();
    const nos = items.filter((i) => i.answer === "NO");
    expect(nos).toHaveLength(1);
    expect(nos[0]?.notes).toBe("Trip hazard");
  });

  it("hashes close-out tokens for storage lookup", () => {
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    expect(hash).toHaveLength(64);
    expect(createHash("sha256").update(token).digest("hex")).toBe(hash);
    expect(createHash("sha256").update(`${token}x`).digest("hex")).not.toBe(hash);
  });
});
