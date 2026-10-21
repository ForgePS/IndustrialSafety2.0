import { apiSend } from "@forge/web-kit";
import {
  buildEquipmentIssuePayload,
  buildIncidentPayload,
  buildObservationPayload,
  type FieldReportDraft,
} from "@/lib/field-reports";
import { acceptsQueuedMutations, offlineSend } from "@/lib/offline";

export type FieldReportSubmitResult = {
  id: string;
  kind: "incident" | "observation" | "corrective";
  title?: string | null;
  status?: string | null;
  queued?: boolean;
};

export const fieldReportApi = {
  createIncident: (body: Record<string, unknown>) =>
    apiSend<{ id: string; title?: string; status?: string }>(
      "/api/v1/industrial/incidents",
      "POST",
      body,
    ),

  createObservation: (body: Record<string, unknown>) =>
    apiSend<{ id: string; title?: string; status?: string }>(
      "/api/v1/industrial/observations",
      "POST",
      body,
    ),

  createCorrectiveAction: (body: Record<string, unknown>) =>
    apiSend<{ id: string; title?: string; status?: string }>(
      "/api/v1/industrial/corrective-actions",
      "POST",
      body,
    ),

  async submit(draft: FieldReportDraft, reporterName: string): Promise<FieldReportSubmitResult> {
    const metaApi =
      draft.type === "equipment"
        ? "corrective"
        : draft.type === "observation" || draft.type === "hazard"
          ? "observation"
          : "incident";

    if (metaApi === "incident") {
      if (!acceptsQueuedMutations("industrial.incidents") && typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Incident reports require a network connection.");
      }
      const created = await fieldReportApi.createIncident(
        buildIncidentPayload(draft, reporterName),
      );
      return {
        id: String(created.id),
        kind: "incident",
        title: created.title ?? null,
        status: created.status ?? null,
      };
    }

    if (metaApi === "observation") {
      const body = buildObservationPayload(draft, reporterName);
      const result = await offlineSend<{ id: string; title?: string; status?: string }>(
        "industrial.observations",
        "/api/v1/industrial/observations",
        "POST",
        body,
        { operation: "create" },
      );
      if (result.queued) {
        return { id: `queued-${Date.now()}`, kind: "observation", queued: true };
      }
      return {
        id: String(result.data?.id ?? ""),
        kind: "observation",
        title: result.data?.title ?? null,
        status: result.data?.status ?? null,
      };
    }

    const body = buildEquipmentIssuePayload(draft, reporterName);
    const result = await offlineSend<{ id: string; title?: string; status?: string }>(
      "industrial.corrective_actions",
      "/api/v1/industrial/corrective-actions",
      "POST",
      body,
      { operation: "create" },
    );
    if (result.queued) {
      return { id: `queued-${Date.now()}`, kind: "corrective", queued: true };
    }
    return {
      id: String(result.data?.id ?? ""),
      kind: "corrective",
      title: result.data?.title ?? null,
      status: result.data?.status ?? null,
    };
  },
};
