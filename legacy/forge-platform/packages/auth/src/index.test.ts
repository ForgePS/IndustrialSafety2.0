import { describe, expect, it } from "vitest";
import { assertCognitoAccessTokenClaims } from "./index.js";

describe("assertCognitoAccessTokenClaims", () => {
  it("accepts a valid access token audience", () => {
    const claims = assertCognitoAccessTokenClaims(
      {
        sub: "user-sub-1",
        token_use: "access",
        client_id: "client-a",
      },
      { clientId: "client-a,client-b" },
    );
    expect(claims.sub).toBe("user-sub-1");
  });

  it("rejects missing subject", () => {
    expect(() =>
      assertCognitoAccessTokenClaims(
        { sub: "", token_use: "access", client_id: "client-a" },
        { clientId: "client-a" },
      ),
    ).toThrow(/missing subject/i);
  });

  it("rejects unexpected token_use", () => {
    expect(() =>
      assertCognitoAccessTokenClaims(
        { sub: "user-sub-1", token_use: "refresh", client_id: "client-a" },
        { clientId: "client-a" },
      ),
    ).toThrow(/token_use/i);
  });

  it("rejects audience mismatch", () => {
    expect(() =>
      assertCognitoAccessTokenClaims(
        { sub: "user-sub-1", token_use: "access", client_id: "other-client" },
        { clientId: "client-a,client-b" },
      ),
    ).toThrow(/audience\/client mismatch/i);
  });
});
