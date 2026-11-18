import { describe, expect, it } from "vitest";
import {
  CONFIG_NAMESPACES,
  TENANT_ADMIN_NAMESPACES,
  isConfigNamespace,
} from "@forge/configuration";

/**
 * Permission / scope matrix smoke (acceptance Step 6 — package level).
 * Live role matrix against Aurora is recorded in the acceptance report.
 */
describe("configuration permission scope matrix", () => {
  it("tenant admin namespaces are a strict subset of all namespaces", () => {
    for (const ns of TENANT_ADMIN_NAMESPACES) {
      expect(isConfigNamespace(ns)).toBe(true);
      expect(CONFIG_NAMESPACES).toContain(ns);
    }
    expect(TENANT_ADMIN_NAMESPACES.length).toBe(13);
    expect(CONFIG_NAMESPACES.length).toBe(27);
  });

  it("creator-only namespaces are not in tenant admin allowlist", () => {
    const creatorOnly = [
      "modules",
      "features",
      "custom_fields",
      "forms",
      "workflows",
      "permissions",
      "document_templates",
      "certificate_templates",
      "dashboards",
      "reporting",
      "import_config",
      "export_config",
      "security",
      "retention",
    ];
    for (const ns of creatorOnly) {
      expect(TENANT_ADMIN_NAMESPACES).not.toContain(ns);
    }
  });
});
