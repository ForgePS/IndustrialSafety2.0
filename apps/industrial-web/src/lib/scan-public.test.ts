import { describe, expect, it } from "vitest";
import {
  extractTokenFromQrText,
  filterClientScanActions,
  resolveScanPublicToken,
} from "./scan-public";

describe("scan-public", () => {
  it("resolves tokens from route, query, and path", () => {
    expect(
      resolveScanPublicToken({
        pathname: "/scan/abc123tokenvalue",
        routeToken: "placeholder",
      }),
    ).toBe("abc123tokenvalue");
    expect(
      resolveScanPublicToken({
        pathname: "/scan/placeholder",
        queryToken: "query-token-1234567890",
      }),
    ).toBe("query-token-1234567890");
  });

  it("extracts tokens from scan URLs and raw strings", () => {
    expect(extractTokenFromQrText("https://example.com/scan/my-scan-token-abcdef")).toBe(
      "my-scan-token-abcdef",
    );
    expect(extractTokenFromQrText("raw-token-1234567890abcd")).toBe("raw-token-1234567890abcd");
    expect(extractTokenFromQrText("short")).toBeNull();
  });

  it("filters actions for verified employees and permissions", () => {
    const actions = [
      {
        id: "report_issue",
        label: "Report",
        href: "/modules/corrective-actions",
        requiresVerification: true,
        fieldWorkerAllowed: true,
      },
      {
        id: "admin_only",
        label: "Admin",
        href: "/modules/forms",
        requiresVerification: true,
        permission: "industrial.forms.manage",
      },
    ];
    const field = filterClientScanActions(actions, {
      verifiedEmployee: true,
      permissions: new Set(),
    });
    expect(field.map((a) => a.id)).toEqual(["report_issue"]);

    const manager = filterClientScanActions(actions, {
      verifiedEmployee: false,
      permissions: new Set(["industrial.forms.manage"]),
    });
    expect(manager.map((a) => a.id)).toEqual(["admin_only"]);
  });
});
