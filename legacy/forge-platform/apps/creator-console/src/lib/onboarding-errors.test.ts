import { describe, expect, it } from "vitest";
import { humanizeForgeError } from "./api";

describe("humanizeForgeError", () => {
  it("rewrites email validation language", () => {
    expect(humanizeForgeError("email ValidationError invalid_string")).toContain("valid email");
  });

  it("rewrites permission failures", () => {
    expect(humanizeForgeError("403 Forbidden")).toContain("permission");
  });

  it("rewrites Cognito invitation failures", () => {
    expect(humanizeForgeError("CognitoUserPoolException")).toContain("invitation");
  });
});
