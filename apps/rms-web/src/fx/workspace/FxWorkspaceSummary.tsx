"use client";

import type { WorkspaceSummaryItem } from "./types";
import { FxWorkspaceEmpty } from "./FxWorkspaceEmpty";

export function FxWorkspaceSummary({ items }: { items: WorkspaceSummaryItem[] }) {
  if (items.length === 0) {
    return (
      <FxWorkspaceEmpty
        title="No summary"
        description="Summary fields are not available for this record."
      />
    );
  }

  return (
    <section className="rms-fx-workspace-panel" aria-label="Record summary">
      <h2 className="rms-fx-workspace-panel__title">Summary</h2>
      <dl className="rms-fx-workspace-summary">
        {items.map((item) => (
          <div key={item.id} className="rms-fx-workspace-summary__row">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
