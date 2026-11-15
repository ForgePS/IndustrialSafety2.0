"use client";

import { useState } from "react";
import { FxBreadcrumb, FxWorkspaceLayout } from "@forge/fx-layouts";
import { FxButton, FxCard, FxPriorityBadge, FxStatusBadge, FxTable } from "@forge/fx-ui";
import { useWorkspace } from "@forge/fx-hooks";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "timeline", label: "Timeline" },
  { id: "attachments", label: "Attachments" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
  { id: "audit", label: "Audit" },
  { id: "related", label: "Related" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
];

export default function WorkspacePage() {
  const { tab, setTab } = useWorkspace("overview");
  const [saved, setSaved] = useState(false);

  return (
    <>
      <FxBreadcrumb
        items={[{ label: "Personnel", href: "/" }, { label: "People" }, { label: "Alex Rivera" }]}
      />
      <FxWorkspaceLayout
        title="Alex Rivera"
        status={
          <div
            style={{ display: "flex", gap: "var(--fx-space-8)", marginTop: "var(--fx-space-8)" }}
          >
            <FxStatusBadge tone="success">Active</FxStatusBadge>
            <FxPriorityBadge priority="normal" />
            <span className="fx-field__hint">ID · PRS-10042</span>
          </div>
        }
        actions={
          <>
            <FxButton
              onClick={() => {
                setSaved(true);
              }}
            >
              Edit
            </FxButton>
            <FxButton tone="secondary">Assign</FxButton>
            <FxButton tone="secondary">Export</FxButton>
          </>
        }
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
      >
        {saved ? (
          <p className="fx-field__hint" role="status">
            Demo edit acknowledged (no API).
          </p>
        ) : null}
        {tab === "overview" && (
          <div style={{ display: "grid", gap: "var(--fx-space-16)" }}>
            <FxCard title="Record summary">
              Rank: Firefighter · Station 3 · Hire date: 2019-04-12. This workspace is the FX
              template for every product record.
            </FxCard>
            <FxCard title="Status panel">
              Workflow: <FxStatusBadge tone="info">In Progress</FxStatusBadge> · Record health:
              complete
            </FxCard>
          </div>
        )}
        {tab === "details" && (
          <FxCard title="Details">
            Field layout placeholder — products supply schema; FX supplies form controls.
          </FxCard>
        )}
        {tab === "timeline" && (
          <FxCard title="Timeline (immutable)">
            <FxTable
              caption="Timeline"
              columns={["When", "Who", "Event"]}
              rows={[
                ["2026-07-30 09:12", "System", "Created"],
                ["2026-07-30 10:01", "J. Lee", "Assigned"],
                ["2026-07-30 11:20", "A. Rivera", "Status Changed → In Progress"],
              ]}
            />
          </FxCard>
        )}
        {tab === "attachments" && (
          <FxCard title="Attachments">No files yet (empty-state ready).</FxCard>
        )}
        {tab === "tasks" && <FxCard title="Tasks">No open tasks on this record.</FxCard>}
        {tab === "notes" && <FxCard title="Notes">Notes / comments panel.</FxCard>}
        {tab === "audit" && (
          <FxCard title="Audit">Audit-oriented view with deep links (demo).</FxCard>
        )}
        {tab === "related" && (
          <FxCard title="Related records">Linked certifications, assignments.</FxCard>
        )}
        {tab === "documents" && <FxCard title="Documents">Document versions panel.</FxCard>}
        {tab === "history" && <FxCard title="History">Human-readable change history.</FxCard>}
      </FxWorkspaceLayout>
    </>
  );
}
