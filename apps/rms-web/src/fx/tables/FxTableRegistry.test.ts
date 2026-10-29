import { beforeEach, describe, expect, it } from "vitest";
import { clearTableRegistryForTests, getTable, listTables, registerTable } from "./FxTableRegistry";
import { loadColumnPreferences, saveColumnPreferences } from "./FxColumnManager";
import { RMS_FX_TABLES_FLAG } from "./tables-flags";

describe("FxTableRegistry", () => {
  beforeEach(() => clearTableRegistryForTests());

  it("registers tables", () => {
    registerTable({
      id: "demo",
      title: "Demo",
      featureFlag: RMS_FX_TABLES_FLAG,
    });
    expect(listTables()).toHaveLength(1);
    expect(getTable("demo")?.title).toBe("Demo");
  });
});

describe("column preferences", () => {
  it("round-trips local preferences", () => {
    const defaults = [
      { id: "a", visible: true, order: 0 },
      { id: "b", visible: true, order: 1 },
    ];
    saveColumnPreferences("test-table", [
      { id: "a", visible: false, order: 0 },
      { id: "b", visible: true, order: 1 },
    ]);
    const loaded = loadColumnPreferences("test-table", defaults);
    expect(loaded.find((c) => c.id === "a")?.visible).toBe(false);
  });
});
