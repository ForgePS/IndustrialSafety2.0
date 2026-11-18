import { apiGet, apiSend } from "@forge/web-kit";

export type FieldCorrectiveRecord = {
  id: string;
  title?: string | null;
  description?: string | null;
  finding?: string | null;
  requiredAction?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  siteId?: string | null;
  ownerName?: string | null;
  parentEntityType?: string | null;
  evidenceNotes?: string | null;
  completedAt?: string | null;
};

export const fieldCorrectiveApi = {
  get: (id: string) =>
    apiGet<FieldCorrectiveRecord>(
      `/api/v1/industrial/corrective-actions/${encodeURIComponent(id)}`,
    ),

  complete: (id: string, body: { notes?: string; completedByName?: string }) =>
    apiSend<FieldCorrectiveRecord>(
      `/api/v1/industrial/corrective-actions/${encodeURIComponent(id)}/complete`,
      "POST",
      body,
    ),
};
