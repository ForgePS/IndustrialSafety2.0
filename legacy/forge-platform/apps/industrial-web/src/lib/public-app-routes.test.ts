import { describe, expect, it } from "vitest";
import { isPublicAppRoute } from "./public-app-routes";

describe("isPublicAppRoute", () => {
  it("allows training portal and assignment links without Forge login", () => {
    expect(isPublicAppRoute("/training/portal")).toBe(true);
    expect(isPublicAppRoute("/training/portal/")).toBe(true);
    expect(isPublicAppRoute("/training/access/abc-token")).toBe(true);
    expect(isPublicAppRoute("/training/single-assignment-token")).toBe(true);
  });

  it("allows public scan routes", () => {
    expect(isPublicAppRoute("/scan")).toBe(true);
    expect(isPublicAppRoute("/scan/qr-token-value")).toBe(true);
  });

  it("keeps authenticated app routes gated", () => {
    expect(isPublicAppRoute("/")).toBe(false);
    expect(isPublicAppRoute("/modules/training")).toBe(false);
    expect(isPublicAppRoute("/modules/scan")).toBe(false);
  });
});
