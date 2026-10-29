import type { IncidentDetail } from "@/lib/rms-api";
import type { WorkspaceRelatedItem, WorkspaceSummaryItem, WorkspaceTimelineItem } from "../types";

function display(value: string | null | undefined, fallback = "—"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** Summary cards from existing incident fields only — no calculated metrics. */
export function adaptIncidentSummary(incident: IncidentDetail): WorkspaceSummaryItem[] {
  return [
    { id: "number", label: "Incident number", value: incident.incidentNumber },
    { id: "status", label: "Status", value: incident.status },
    {
      id: "type",
      label: "Incident type",
      value: display(incident.primaryIncidentTypeCode),
    },
    {
      id: "date",
      label: "Incident date",
      value: display(incident.incidentDate),
    },
    {
      id: "alarm",
      label: "Alarm time",
      value: incident.alarmAt ? new Date(incident.alarmAt).toLocaleString() : "—",
    },
    {
      id: "district",
      label: "Response district",
      value: display(incident.responseDistrict),
    },
    {
      id: "updated",
      label: "Last modified",
      value: new Date(incident.updatedAt).toLocaleString(),
    },
  ];
}

/** Timeline from existing timestamps on the loaded record (no new audit engine). */
export function adaptIncidentTimeline(incident: IncidentDetail): WorkspaceTimelineItem[] {
  const items: WorkspaceTimelineItem[] = [
    {
      id: "created",
      at: incident.createdAt,
      label: "Incident created",
      detail: incident.incidentNumber,
    },
    {
      id: "updated",
      at: incident.updatedAt,
      label: "Record updated",
      detail: `Status ${incident.status}`,
    },
  ];
  if (incident.alarmAt) {
    items.push({
      id: "alarm",
      at: incident.alarmAt,
      label: "Alarm time",
    });
  }
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Related shortcuts that already exist as workspace sections — no fabricated records. */
export function adaptIncidentRelated(
  incidentId: string,
  sectionKeys: string[],
): WorkspaceRelatedItem[] {
  const items: WorkspaceRelatedItem[] = [];
  if (sectionKeys.includes("ATTACHMENTS")) {
    items.push({
      id: "attachments",
      label: "Attachments",
      href: `/incidents/${incidentId}/?section=ATTACHMENTS`,
      meta: "Open attachments section",
    });
  }
  if (sectionKeys.includes("REVIEW")) {
    items.push({
      id: "review",
      label: "Review & history",
      href: `/incidents/${incidentId}/?section=REVIEW`,
      meta: "Comments, status history, and audit",
    });
  }
  if (sectionKeys.includes("NARRATIVE")) {
    items.push({
      id: "narrative",
      label: "Narrative",
      href: `/incidents/${incidentId}/?section=NARRATIVE`,
    });
  }
  return items;
}
