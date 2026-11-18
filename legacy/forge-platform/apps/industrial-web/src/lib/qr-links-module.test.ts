import { describe, expect, it } from "vitest";
import {
  canManageQrLinks,
  canViewQrLinks,
  qrStatusBadgeClass,
  targetTypeLabel,
} from "./qr-links-module";

describe("qr-links-module", () => {
  it("grants view with legacy and sprint permissions", () => {
    expect(canViewQrLinks(new Set(["industrial.qr.view"]))).toBe(true);
    expect(canViewQrLinks(new Set(["industrial.scan.view"]))).toBe(true);
    expect(canViewQrLinks(new Set(["industrial.qr_links.view"]))).toBe(true);
    expect(canViewQrLinks(new Set())).toBe(false);
  });

  it("grants manage with sprint and legacy manage permissions", () => {
    expect(canManageQrLinks(new Set(["industrial.qr.manage"]))).toBe(true);
    expect(canManageQrLinks(new Set(["industrial.qr_links.manage"]))).toBe(true);
    expect(canViewQrLinks(new Set(["industrial.qr.view"]))).toBe(true);
    expect(canManageQrLinks(new Set(["industrial.qr.view"]))).toBe(false);
  });

  it("maps status badges and target labels", () => {
    expect(qrStatusBadgeClass("ACTIVE")).toBe("bg-label-success");
    expect(qrStatusBadgeClass("REPLACED")).toBe("bg-label-warning");
    expect(targetTypeLabel("EQUIPMENT")).toBe("Equipment / asset");
    expect(targetTypeLabel("custom.type")).toBe("custom.type");
  });
});
