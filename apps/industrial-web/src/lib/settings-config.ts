/**
 * Configuration Studio client helpers for Industrial Settings
 * (tenant_profile draft/publish). Tenant branding uses /branding APIs instead.
 */

import { apiGet, apiSend } from "@forge/web-kit";

export type SettingsConfigVersion = {
  id: string;
  version: number;
  state: string;
  payloadJson: unknown;
  changeSummary: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type SettingsConfigObject = {
  id: string;
  namespace: string;
  objectKey: string;
  displayName: string;
  currentPublishedVersionId: string | null;
};

export type TenantProfilePayload = {
  displayName?: string;
  legalName?: string;
  timezone?: string;
  locale?: string;
  contactEmail?: string;
  notes?: string;
};

const DEFAULT_OBJECT_KEY = "default";

export async function ensureConfigDefaults(tenantId: string): Promise<void> {
  await apiSend(`/api/v1/tenants/${tenantId}/config/ensure-defaults`, "POST");
}

export async function loadConfigNamespace(
  tenantId: string,
  namespace: string,
): Promise<{ object: SettingsConfigObject | null; versions: SettingsConfigVersion[]; draft: SettingsConfigVersion | null }> {
  await ensureConfigDefaults(tenantId);
  const listed = await apiGet<{ items: SettingsConfigObject[] }>(
    `/api/v1/tenants/${tenantId}/config/${namespace}`,
  );
  const target =
    listed.items.find((item) => item.objectKey === DEFAULT_OBJECT_KEY) ?? listed.items[0] ?? null;
  if (!target) {
    return { object: null, versions: [], draft: null };
  }
  const history = await apiGet<{ object: SettingsConfigObject; versions: SettingsConfigVersion[] }>(
    `/api/v1/tenants/${tenantId}/config/${namespace}/${target.objectKey}/versions`,
  );
  const draft =
    history.versions.find((v) => v.state === "DRAFT") ?? null;
  return { object: history.object, versions: history.versions, draft };
}

export async function getEffectivePayload<T extends object>(
  tenantId: string,
  namespace: string,
  objectKey = DEFAULT_OBJECT_KEY,
): Promise<T> {
  const result = await apiGet<{ payload: T | null }>(
    `/api/v1/tenants/${tenantId}/config/${namespace}/${objectKey}/effective`,
  );
  return (result.payload ?? {}) as T;
}

export async function createConfigDraft(
  tenantId: string,
  namespace: string,
  payload: unknown,
  displayName: string,
  changeSummary?: string,
): Promise<void> {
  await apiSend(`/api/v1/tenants/${tenantId}/config/${namespace}`, "POST", {
    objectKey: DEFAULT_OBJECT_KEY,
    displayName,
    payload,
    changeSummary: changeSummary || "New draft from Industrial Settings",
  });
}

export async function patchConfigDraft(
  tenantId: string,
  namespace: string,
  objectKey: string,
  versionId: string,
  payload: unknown,
  changeSummary?: string,
): Promise<void> {
  const body: { payload: unknown; changeSummary?: string } = { payload };
  if (changeSummary) body.changeSummary = changeSummary;
  await apiSend(
    `/api/v1/tenants/${tenantId}/config/${namespace}/${objectKey}/versions/${versionId}`,
    "PATCH",
    body,
  );
}

export async function publishConfigVersion(
  tenantId: string,
  namespace: string,
  objectKey: string,
  versionId: string,
): Promise<void> {
  await apiSend(
    `/api/v1/tenants/${tenantId}/config/${namespace}/${objectKey}/versions/${versionId}/publish`,
    "POST",
  );
}

/** Ensure a DRAFT exists (clone from effective if needed), then PATCH it. */
export async function saveNamespaceDraft(
  tenantId: string,
  namespace: string,
  displayName: string,
  payload: unknown,
  changeSummary?: string,
): Promise<void> {
  const { object, draft } = await loadConfigNamespace(tenantId, namespace);
  if (draft && object) {
    await patchConfigDraft(
      tenantId,
      namespace,
      object.objectKey,
      draft.id,
      payload,
      changeSummary,
    );
    return;
  }
  await createConfigDraft(tenantId, namespace, payload, displayName, changeSummary);
}

/** Save draft if needed, then publish the current DRAFT. */
export async function saveAndPublishNamespace(
  tenantId: string,
  namespace: string,
  displayName: string,
  payload: unknown,
  changeSummary?: string,
): Promise<void> {
  await saveNamespaceDraft(tenantId, namespace, displayName, payload, changeSummary);
  const { object, draft } = await loadConfigNamespace(tenantId, namespace);
  if (!object || !draft) {
    throw new Error("No draft available to publish");
  }
  await publishConfigVersion(tenantId, namespace, object.objectKey, draft.id);
}
