import { describe, expect, it } from "vitest";
import { parseQrActionConfig, qrActionConfigEnabled } from "./qr-action-config.js";

describe("qr-action-config", () => {
  it("parses boolean flags and template map", () => {
    const config = parseQrActionConfig({
      dailyInspection: true,
      monthlyInspection: false,
      viewLoto: true,
      lotoProcedureId: "loto-1",
      inspectionTemplates: { DAILY: "tpl-daily" },
    });
    expect(qrActionConfigEnabled(config, "dailyInspection")).toBe(true);
    expect(qrActionConfigEnabled(config, "monthlyInspection")).toBe(false);
    expect(config.inspectionTemplates?.DAILY).toBe("tpl-daily");
    expect(config.lotoProcedureId).toBe("loto-1");
    expect(qrActionConfigEnabled(config, "viewLoto")).toBe(true);
  });
});
