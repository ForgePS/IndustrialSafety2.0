import { describe, expect, it } from "vitest";
import {
  describeScanFailure,
  extractTokenFromQrText,
  pickPrimaryScanAction,
  resolveScanPublicToken,
} from "./scan-public";
import {
  fieldHrefForScanAction,
  fieldHrefFromIndustrialPath,
  hubPathForTarget,
  isOrgContextTarget,
  targetTypeLabel,
} from "./scan-routes";

describe("extractTokenFromQrText", () => {
  it("pulls token from industrial scan URL", () => {
    expect(
      extractTokenFromQrText("https://industrial.forgepublicsafety.com/scan/AbCdEfGhIjKlMnOpQrStUvWx"),
    ).toBe("AbCdEfGhIjKlMnOpQrStUvWx");
  });

  it("pulls token from Field equipment deep link", () => {
    expect(
      extractTokenFromQrText("https://field.forgepublicsafety.com/scan/equipment/AbCdEfGhIjKlMnOpQrStUvWx"),
    ).toBe("AbCdEfGhIjKlMnOpQrStUvWx");
  });

  it("pulls token from /q/ short link", () => {
    expect(extractTokenFromQrText("https://field.forgepublicsafety.com/q/FGE-9K7MXP")).toBe(
      "FGE-9K7MXP",
    );
  });

  it("accepts FGE-style and raw opaque tokens", () => {
    expect(extractTokenFromQrText("FGE-9K7MXP")).toBe("FGE-9K7MXP");
    expect(extractTokenFromQrText("AbCdEfGhIjKlMnOpQrStUvWx")).toBe("AbCdEfGhIjKlMnOpQrStUvWx");
  });

  it("rejects short junk", () => {
    expect(extractTokenFromQrText("short")).toBeNull();
  });
});

describe("resolveScanPublicToken", () => {
  it("reads path token", () => {
    expect(resolveScanPublicToken({ pathname: "/scan/AbCdEfGhIjKlMnOpQrStUvWx/" })).toBe(
      "AbCdEfGhIjKlMnOpQrStUvWx",
    );
  });

  it("ignores CloudFront placeholder shell path", () => {
    expect(
      resolveScanPublicToken({
        pathname: "/scan/placeholder/",
        routeToken: "placeholder",
      }),
    ).toBe("");
  });

  it("reads equipment deep-link token from path", () => {
    expect(
      resolveScanPublicToken({
        pathname: "/scan/equipment/AbCdEfGhIjKlMnOpQrStUvWx/",
        routeToken: "placeholder",
      }),
    ).toBe("AbCdEfGhIjKlMnOpQrStUvWx");
  });
});

describe("describeScanFailure", () => {
  it("maps common status codes", () => {
    expect(describeScanFailure({ status: 404, code: "NOT_FOUND", message: "x" })).toMatch(
      /not recognized|expired/i,
    );
    expect(describeScanFailure({ status: 403, code: "FORBIDDEN", message: "x" })).toMatch(
      /do not have access/i,
    );
  });
});

describe("field route mapping", () => {
  it("maps equipment target", () => {
    expect(hubPathForTarget("EQUIPMENT", "eq-1")).toBe("/equipment/eq-1/");
  });

  it("maps location, division, form, and safety supply targets", () => {
    expect(hubPathForTarget("LOCATION", "loc-1")).toBe("/location/loc-1/");
    expect(hubPathForTarget("DIVISION", "div-1")).toBe("/location/div-1/?kind=division");
    expect(hubPathForTarget("FORM", "form-1")).toBe("/forms/form-1/");
    expect(hubPathForTarget("SAFETY_SUPPLY", "ss-1")).toContain("/more/safety-supplies/");
    expect(hubPathForTarget("SAFETY_SUPPLY", "ss-1")).toContain("targetId=ss-1");
    expect(isOrgContextTarget("LOCATION")).toBe(true);
    expect(targetTypeLabel("FORKLIFT")).toBe("Forklift");
  });

  it("maps LOTO industrial href", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/loto/procedure?procedureId=p1", {
        targetType: "LOTO_PROCEDURE",
        targetId: "p1",
        qrLinkId: "q1",
      }),
    ).toBe("/loto/p1/");
  });

  it("maps LOTO industrial href using id query", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/lockout-tagout/procedure/?id=p2", {
        targetType: "LOTO_PROCEDURE",
        targetId: "p2",
        qrLinkId: "q1",
      }),
    ).toBe("/loto/p2/");
  });

  it("maps forms and training industrial hrefs", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/dot?vehicleId=v1&tripType=PRE_TRIP", {
        targetType: "VEHICLE",
        targetId: "v1",
        qrLinkId: "q1",
      }),
    ).toBe("/dvir/v1/?trip=PRE_TRIP");
    expect(
      fieldHrefFromIndustrialPath("/modules/forms?formId=f1", {
        targetType: "FORM",
        targetId: "f1",
        qrLinkId: "q1",
      }),
    ).toBe("/forms/f1/");
    expect(
      fieldHrefFromIndustrialPath("/training?assignmentId=a1", {
        targetType: "TRAINING",
        targetId: "a1",
        qrLinkId: "q1",
      }),
    ).toBe("/training/a1/");
  });

  it("includes scanToken on inspection deep links", () => {
    const href = fieldHrefForScanAction(
      {
        id: "i",
        label: "Inspect",
        href: "/modules/inspections",
        kind: "start_inspection",
        frequency: "DAILY",
      },
      {
        targetType: "EQUIPMENT",
        targetId: "eq-1",
        qrLinkId: "qr-1",
        scanToken: "AbCdEfGhIjKlMnOpQrStUvWx",
      },
    );
    expect(href).toContain("scanToken=AbCdEfGhIjKlMnOpQrStUvWx");
    expect(href).toContain("frequency=DAILY");
  });

  it("prefers DVIR pre-trip over generic inspection as primary action", () => {
    const primary = pickPrimaryScanAction([
      { id: "daily_inspection", label: "Daily", href: "/modules/inspections", kind: "start_inspection" },
      {
        id: "dvir_pre_trip",
        label: "Pre-trip",
        href: "/modules/dot?vehicleId=v1&tripType=PRE_TRIP",
        kind: "navigate",
      },
    ]);
    expect(primary?.id).toBe("dvir_pre_trip");
  });

  it("prefers inspection as primary action", () => {
    const primary = pickPrimaryScanAction([
      { id: "a", label: "View", href: "/modules/equipment", kind: "navigate" },
      { id: "b", label: "Inspect", href: "/modules/inspections", kind: "start_inspection" },
    ]);
    expect(primary?.id).toBe("b");
  });

  it("prefers LOTO over generic navigate when no inspection", () => {
    const primary = pickPrimaryScanAction([
      { id: "report", label: "Report", href: "/modules/incidents", kind: "report_issue" },
      { id: "open_loto", label: "View LOTO procedure", href: "/modules/loto/procedure?id=p1" },
    ]);
    expect(primary?.id).toBe("open_loto");
  });
});
