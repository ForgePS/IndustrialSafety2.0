import { apiGet, apiSend } from "@forge/web-kit";
import type {
  InspectionListRecord,
  InspectionPhoto,
  InspectionRunItem,
  InspectionTemplate,
} from "./inspections";
import { FALLBACK_INSPECTION_TEMPLATE, normalizeTemplateRow } from "./inspections";

export type InspectionRecord = InspectionListRecord & {
  items?: unknown;
  templateId?: string | null;
  assetOutOfService?: boolean;
  outOfServiceReason?: string | null;
  signature?: string | null;
  signatureName?: string | null;
};

export type InspectionCompleteResult = InspectionRecord & {
  id?: string;
  status?: string;
  items?: InspectionRunItem[];
  sourcePayload?: Record<string, unknown>;
  assetOutOfService?: boolean;
  outOfServiceReason?: string | null;
};

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return ((payload as { items: T[] }).items ?? []) as T[];
  }
  return [];
}

export const fieldInspectionApi = {
  async listTemplates(query?: Record<string, string>): Promise<InspectionTemplate[]> {
    const rows = await apiGet<
      Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> }
    >("/api/v1/industrial/inspection-templates", query ? { query } : undefined);
    const list = Array.isArray(rows) ? rows : Array.isArray(rows.items) ? rows.items : [];
    const templates = list
      .map((row) => normalizeTemplateRow(row))
      .filter((t): t is InspectionTemplate => Boolean(t));
    return templates.length > 0 ? templates : [FALLBACK_INSPECTION_TEMPLATE];
  },

  async list(query?: Record<string, string>): Promise<InspectionListRecord[]> {
    const result = await apiGet<{ items?: InspectionListRecord[] } | InspectionListRecord[]>(
      "/api/v1/industrial/inspections",
      {
        query: { page: "1", pageSize: "100", ...query },
      },
    );
    return asItems<InspectionListRecord>(result);
  },

  get: (id: string) =>
    apiGet<InspectionRecord>(`/api/v1/industrial/inspections/${encodeURIComponent(id)}`),

  create: (body: Record<string, unknown>) =>
    apiSend<InspectionRecord>("/api/v1/industrial/inspections", "POST", body),

  patch: (id: string, body: Record<string, unknown>) =>
    apiSend<InspectionRecord>(
      `/api/v1/industrial/inspections/${encodeURIComponent(id)}`,
      "PATCH",
      body,
    ),

  complete: (
    id: string,
    body: {
      items: InspectionRunItem[];
      appBaseUrl?: string;
      signature?: string;
      signatureName?: string;
    },
  ) =>
    apiSend<InspectionCompleteResult>(
      `/api/v1/industrial/inspections/${encodeURIComponent(id)}/complete`,
      "POST",
      body,
    ),

  uploadAttachment: (body: {
    entityType?: string;
    entityId?: string;
    fileName: string;
    contentType: string;
    dataUrl: string;
  }) =>
    apiSend<{ id: string; fileName: string; contentType: string; dataUrl: string }>(
      "/api/v1/industrial/inspection-attachments",
      "POST",
      body,
    ),

  async attachPhoto(inspectionId: string, itemId: string, photo: InspectionPhoto) {
    return fieldInspectionApi.uploadAttachment({
      entityType: "INSPECTION_ITEM",
      entityId: `${inspectionId}:${itemId}`,
      fileName: photo.fileName,
      contentType: photo.contentType,
      dataUrl: photo.dataUrl,
    });
  },
};
