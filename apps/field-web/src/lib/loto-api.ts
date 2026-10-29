import { apiGet, apiSend } from "@forge/web-kit";

export type LotoListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};

export type LotoIssueBody = {
  authorizedEmployee: string;
  affectedEmployees?: string;
  lockTagId?: string;
  tryStartRequired?: boolean;
  zeroEnergyVerified?: boolean;
};

export const fieldLotoApi = {
  listProcedures(
    query: {
      q?: string;
      status?: string;
      equipmentId?: string;
      siteId?: string;
      siteName?: string;
      departmentId?: string;
      departmentName?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const params: Record<string, string | undefined> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 100),
    };
    if (query.q) params.q = query.q;
    if (query.status) params.status = query.status;
    if (query.equipmentId) params.equipmentId = query.equipmentId;
    if (query.siteId) params.siteId = query.siteId;
    if (query.siteName) params.siteName = query.siteName;
    if (query.departmentId) params.departmentId = query.departmentId;
    if (query.departmentName) params.departmentName = query.departmentName;
    return apiGet<LotoListResponse>("/api/v1/industrial/loto", {
      query: params,
    });
  },

  getProcedure(id: string) {
    return apiGet<Record<string, unknown>>(`/api/v1/industrial/loto/${encodeURIComponent(id)}`);
  },

  listLockouts(query: { status?: string; page?: number; pageSize?: number } = {}) {
    const params: Record<string, string | undefined> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 50),
    };
    if (query.status) params.status = query.status;
    return apiGet<LotoListResponse>("/api/v1/industrial/loto-records", {
      query: params,
    });
  },

  getLockout(id: string) {
    return apiGet<Record<string, unknown>>(
      `/api/v1/industrial/loto-records/${encodeURIComponent(id)}`,
    );
  },

  createProcedure(body: Record<string, unknown>) {
    return apiSend<Record<string, unknown>>("/api/v1/industrial/loto", "POST", body);
  },

  updateProcedure(id: string, body: Record<string, unknown>) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto/${encodeURIComponent(id)}`,
      "PATCH",
      body,
    );
  },

  archiveProcedure(id: string) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto/${encodeURIComponent(id)}/archive`,
      "POST",
      {},
    );
  },

  issue(procedureId: string, body: LotoIssueBody) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto/${encodeURIComponent(procedureId)}/issue`,
      "POST",
      body,
    );
  },

  verifyLockout(
    lockoutId: string,
    body: { zeroEnergyConfirmed: boolean; tryStartCompleted?: boolean },
  ) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto-records/${encodeURIComponent(lockoutId)}/verify`,
      "POST",
      body,
    );
  },

  closeLockout(lockoutId: string, body: { restorationComplete?: boolean } = {}) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto-records/${encodeURIComponent(lockoutId)}/close`,
      "POST",
      body,
    );
  },

  transition(
    procedureId: string,
    action: "submit-review" | "activate" | "approve" | "request-changes",
    body: Record<string, unknown> = {},
  ) {
    return apiSend<Record<string, unknown>>(
      `/api/v1/industrial/loto/${encodeURIComponent(procedureId)}/${action}`,
      "POST",
      body,
    );
  },

  printable(procedureId: string) {
    return apiGet<{ html: string }>(
      `/api/v1/industrial/loto/${encodeURIComponent(procedureId)}/printable`,
    );
  },
};
