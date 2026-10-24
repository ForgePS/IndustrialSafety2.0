"use client";

import type { WorkspaceTabDefinition } from "./types";

export function FxWorkspaceTabs({
  tabs,
  activeTab,
  onTabChange,
  label = "Workspace sections",
}: {
  tabs: WorkspaceTabDefinition[];
  activeTab: string;
  onTabChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="fx-workspace__tabs rms-fx-workspace__tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="fx-workspace__tab"
            aria-selected={selected}
            id={`fx-ws-tab-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowRight" &&
                event.key !== "ArrowLeft" &&
                event.key !== "Home" &&
                event.key !== "End"
              ) {
                return;
              }
              event.preventDefault();
              const index = tabs.findIndex((t) => t.id === tab.id);
              if (index < 0) return;
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = tabs.length - 1;
              const nextTab = tabs[next];
              if (nextTab) {
                onTabChange(nextTab.id);
                document.getElementById(`fx-ws-tab-${nextTab.id}`)?.focus();
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
