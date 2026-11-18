import { apiGet } from "@forge/web-kit";
import type { FieldFormDefinition, FieldFormSubmission } from "@/lib/field-forms";
import { getOfflineCache, offlineSend } from "@/lib/offline";

export const FORMS_API = "/api/v1/industrial/forms";
export const FORM_SUBMISSIONS_API = "/api/v1/industrial/form-submissions";

type ListResponse<T> = { items?: T[] };

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as ListResponse<T>).items)) {
    return (payload as ListResponse<T>).items ?? [];
  }
  return [];
}

export const fieldFormApi = {
  listDefinitions: async (query?: Record<string, string>) => {
    try {
      const result = await apiGet<ListResponse<FieldFormDefinition>>(FORMS_API, {
        query: { page: "1", pageSize: "100", ...query },
      });
      const items = asItems<FieldFormDefinition>(result);
      const cache = getOfflineCache();
      cache?.set("industrial.forms.definitions", query?.siteId || "all", items);
      return items;
    } catch (err) {
      const cache = getOfflineCache();
      const cached = cache?.get<FieldFormDefinition[]>(
        "industrial.forms.definitions",
        query?.siteId || "all",
      );
      if (cached) return cached;
      throw err;
    }
  },

  getDefinition: async (id: string) => {
    try {
      const row = await apiGet<FieldFormDefinition>(`${FORMS_API}/${encodeURIComponent(id)}`);
      getOfflineCache()?.set("industrial.forms.definitions", id, row);
      return row;
    } catch (err) {
      const cached = getOfflineCache()?.get<FieldFormDefinition>(
        "industrial.forms.definitions",
        id,
      );
      if (cached) return cached;
      throw err;
    }
  },

  listSubmissions: async (query?: Record<string, string>) => {
    const result = await apiGet<ListResponse<FieldFormSubmission>>(FORM_SUBMISSIONS_API, {
      query: { page: "1", pageSize: "50", ...query },
    });
    return asItems<FieldFormSubmission>(result);
  },

  getSubmission: (id: string) =>
    apiGet<FieldFormSubmission>(`${FORM_SUBMISSIONS_API}/${encodeURIComponent(id)}`),

  createSubmission: async (body: {
    formDefinitionId: string;
    title?: string;
    answers: Record<string, unknown>;
    status?: string;
    personnelId?: string | null;
  }) => {
    const result = await offlineSend<FieldFormSubmission>(
      "industrial.forms.submissions",
      FORM_SUBMISSIONS_API,
      "POST",
      body,
      { operation: "create" },
    );
    if (result.queued) {
      return {
        id: `offline-${body.formDefinitionId}`,
        formDefinitionId: body.formDefinitionId,
        title: body.title,
        answers: body.answers,
        status: body.status ?? "DRAFT",
      } as FieldFormSubmission;
    }
    return result.data as FieldFormSubmission;
  },

  patchSubmission: async (
    id: string,
    body: {
      title?: string;
      answers?: Record<string, unknown>;
      status?: string;
      personnelId?: string | null;
    },
  ) => {
    const result = await offlineSend<FieldFormSubmission>(
      "industrial.forms.submissions",
      `${FORM_SUBMISSIONS_API}/${encodeURIComponent(id)}`,
      "PATCH",
      body,
      { operation: "update", targetId: id },
    );
    if (result.queued) {
      return {
        id,
        ...body,
        status: body.status ?? "DRAFT",
      } as FieldFormSubmission;
    }
    return result.data as FieldFormSubmission;
  },
};
