import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./reporting-exporters.js";

describe("reporting-exporters", () => {
  it("rowsToCsv roundtrips two rows with headers", () => {
    const columns = [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ];
    const rows = [
      { name: "Alpha", status: "OPEN" },
      { name: "Beta, Inc", status: 'Said "ok"' },
    ];
    const csv = rowsToCsv(columns, rows);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Status");
    expect(lines[1]).toBe("Alpha,OPEN");
    expect(lines[2]).toBe('"Beta, Inc","Said ""ok"""');
  });
});
