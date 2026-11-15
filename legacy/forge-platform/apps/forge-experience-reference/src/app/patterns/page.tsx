"use client";

import { FxBreadcrumb } from "@forge/fx-layouts";
import { CreateRecordPattern, DeleteRecordPattern, PatternFrame } from "@forge/fx-patterns";
import { FxCard } from "@forge/fx-ui";

export default function PatternsPage() {
  return (
    <>
      <FxBreadcrumb items={[{ label: "Patterns" }]} />
      <h1 style={{ fontFamily: "var(--fx-font-display)", fontSize: 28 }}>Pattern validation</h1>
      <div style={{ display: "grid", gap: "var(--fx-space-24)" }}>
        <FxCard>
          <PatternFrame title="Create Record">
            <CreateRecordPattern onSubmit={() => undefined} />
          </PatternFrame>
        </FxCard>
        <FxCard>
          <PatternFrame title="Delete Record">
            <DeleteRecordPattern recordTitle="Alex Rivera (demo)" />
          </PatternFrame>
        </FxCard>
      </div>
    </>
  );
}
