import { apiGet, apiSend } from "@forge/web-kit";

export type FieldTaskRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  dueDate?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  assigneePersonnelId?: string | null;
  completedAt?: string | null;
  sourcePayload?: Record<string, unknown> | null;
};

export type FieldTaskDetailExtras = {
  taskId: string;
  subtasks?: Array<{ id: string; title?: string | null; status?: string | null }>;
  checklist?: Array<{ id: string; label?: string | null; completed?: boolean }>;
  activity?: Array<{ id: string; eventType?: string | null; createdAt?: string | null }>;
};

export const fieldTaskApi = {
  get: (id: string) =>
    apiGet<FieldTaskRecord>(`/api/v1/industrial/tasks/${encodeURIComponent(id)}`),

  detail: (id: string) =>
    apiGet<FieldTaskDetailExtras>(
      `/api/v1/industrial/tasks/${encodeURIComponent(id)}/detail`,
    ),

  complete: (id: string) =>
    apiSend<FieldTaskRecord>(
      `/api/v1/industrial/tasks/${encodeURIComponent(id)}/complete`,
      "POST",
      {},
    ),

  start: (id: string) =>
    apiSend<FieldTaskRecord>(
      `/api/v1/industrial/tasks/${encodeURIComponent(id)}/start`,
      "POST",
      {},
    ),
};
