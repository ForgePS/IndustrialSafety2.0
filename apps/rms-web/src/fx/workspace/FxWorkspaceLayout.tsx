"use client";

import type { ReactNode } from "react";
import { FxBreadcrumb } from "@forge/fx-layouts";
import { FxWorkspaceHeader } from "./FxWorkspaceHeader";
import { FxWorkspaceIdentity } from "./FxWorkspaceIdentity";
import { FxWorkspaceTabs } from "./FxWorkspaceTabs";
import { FxWorkspaceSidebar } from "./FxWorkspaceSidebar";
import { FxWorkspaceSummary } from "./FxWorkspaceSummary";
import { FxWorkspaceTimeline } from "./FxWorkspaceTimeline";
import { FxWorkspaceRelated } from "./FxWorkspaceRelated";
import { FxWorkspaceNotes } from "./FxWorkspaceNotes";
import { FxWorkspaceAttachments } from "./FxWorkspaceAttachments";
import { FxWorkspaceAudit } from "./FxWorkspaceAudit";
import { WorkspaceSectionBoundary } from "./WorkspaceSectionBoundary";
import type { WorkspaceLayoutProps } from "./types";
import "./workspace.css";

export type FxWorkspaceLayoutExtendedProps = WorkspaceLayoutProps & {
  recordTypeLabel?: string;
  ownerLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Hide empty presentation panels that are not backed by data */
  showNotes?: boolean;
  showAttachments?: boolean;
  showAudit?: boolean;
  showTimeline?: boolean;
  showRelated?: boolean;
  statusBadge?: ReactNode;
};

/**
 * Shared FX workspace chrome. Products pass existing record data via props/adapters.
 * Tab changes are controlled by the product so deep links stay authoritative.
 */
export function FxWorkspaceLayout(props: FxWorkspaceLayoutExtendedProps) {
  const {
    title,
    status,
    actions,
    tabs,
    activeTab,
    onTabChange,
    breadcrumbItems,
    summary = [],
    timeline = [],
    related = [],
    notes = [],
    attachments = [],
    audit = [],
    sidebarExtras,
    children,
    recordTypeLabel = "Record",
    ownerLabel,
    createdAt,
    updatedAt,
    showNotes = false,
    showAttachments = false,
    showAudit = false,
    showTimeline = true,
    showRelated = true,
    statusBadge,
  } = props;

  return (
    <section className="rms-fx-workspace" data-testid="rms-fx-workspace">
      {breadcrumbItems?.length ? <FxBreadcrumb items={breadcrumbItems} /> : null}

      <FxWorkspaceHeader
        title={title}
        identity={
          <FxWorkspaceIdentity
            recordType={recordTypeLabel}
            {...(ownerLabel !== undefined ? { owner: ownerLabel } : {})}
            timestamps={{
              ...(createdAt ? { createdAt } : {}),
              ...(updatedAt ? { updatedAt } : {}),
            }}
          />
        }
        status={statusBadge ?? <span className="rms-fx-workspace__status">{status}</span>}
        actions={actions}
      />

      <div className="rms-fx-workspace__body">
        <div className="rms-fx-workspace__main">
          <FxWorkspaceTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
          <div
            role="tabpanel"
            aria-labelledby={`fx-ws-tab-${activeTab}`}
            className="rms-fx-workspace__panel"
          >
            <WorkspaceSectionBoundary title="Workspace content">
              {children}
            </WorkspaceSectionBoundary>
          </div>
        </div>

        <FxWorkspaceSidebar>
          <WorkspaceSectionBoundary title="Summary">
            <FxWorkspaceSummary items={summary} />
          </WorkspaceSectionBoundary>
          {showTimeline ? (
            <WorkspaceSectionBoundary title="Timeline">
              <FxWorkspaceTimeline items={timeline} />
            </WorkspaceSectionBoundary>
          ) : null}
          {showRelated ? (
            <WorkspaceSectionBoundary title="Related">
              <FxWorkspaceRelated items={related} />
            </WorkspaceSectionBoundary>
          ) : null}
          {showAttachments ? (
            <WorkspaceSectionBoundary title="Attachments">
              <FxWorkspaceAttachments items={attachments} />
            </WorkspaceSectionBoundary>
          ) : null}
          {showNotes ? (
            <WorkspaceSectionBoundary title="Notes">
              <FxWorkspaceNotes items={notes} />
            </WorkspaceSectionBoundary>
          ) : null}
          {showAudit ? (
            <WorkspaceSectionBoundary title="Audit">
              <FxWorkspaceAudit items={audit} />
            </WorkspaceSectionBoundary>
          ) : null}
          {sidebarExtras}
        </FxWorkspaceSidebar>
      </div>
    </section>
  );
}
