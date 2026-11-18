import { describe, expect, it } from "vitest";
import { isPublicAppRoute } from "./public-app-routes";

describe("isPublicAppRoute", () => {
  it("allows public scan sticker routes", () => {
    expect(isPublicAppRoute("/scan")).toBe(true);
    expect(isPublicAppRoute("/scan/")).toBe(true);
    expect(isPublicAppRoute("/scan/AbCdEfGhIjKlMnOpQrStUvWx")).toBe(true);
    expect(isPublicAppRoute("/scan/equipment/AbCdEfGhIjKlMnOpQrStUvWx/")).toBe(true);
  });

  it("allows auth recovery routes", () => {
    expect(isPublicAppRoute("/auth/callback")).toBe(true);
    expect(isPublicAppRoute("/auth/forgot-password")).toBe(true);
    expect(isPublicAppRoute("/auth/reset-password")).toBe(true);
  });

  it("keeps authenticated Field modules gated", () => {
    expect(isPublicAppRoute("/")).toBe(false);
    expect(isPublicAppRoute("/more/loto")).toBe(false);
    expect(isPublicAppRoute("/loto/abc")).toBe(false);
    expect(isPublicAppRoute("/modules/loto")).toBe(false);
  });
});
