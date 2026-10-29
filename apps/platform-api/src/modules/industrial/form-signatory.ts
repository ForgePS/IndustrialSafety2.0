/**
 * EHS Director / Safety Director / Supervisor form signature helpers.
 *
 * Form fields labeled for the EHS Director (or Safety Director) may only be
 * signed by users who hold a Safety Director role (Safety Manager aliases
 * included for starter-template tenants).
 *
 * Supervisor signature fields support remote "send link to sign" requests.
 */

export type SignatoryRoleRef = {
  roleCode?: string | null;
  code?: string | null;
  roleName?: string | null;
  name?: string | null;
};

export type SignatoryFieldRef = {
  id: string;
  label: string;
  type?: string | null;
};

export type FormSignatoryKind = "ehs_director" | "supervisor";

function normalizeBlob(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

/** Labels that mean a drawable signature pad (not "signature date"). */
export function isSignatureFieldLabel(label: string): boolean {
  const text = label.trim();
  if (text === "") return false;
  if (/\bsignature\s*date\b/i.test(text)) return false;
  if (/\bdate\s*(of\s+)?signature\b/i.test(text)) return false;
  return /\bsignature\b/i.test(text) || /^sign(\s+here)?$/i.test(text);
}

function isSignatureTyped(field: SignatoryFieldRef): boolean {
  const type = String(field.type ?? "")
    .trim()
    .toLowerCase();
  if (
    type === "signature" ||
    type === "signaturepad" ||
    type === "sign" ||
    type === "draw" ||
    type === "ink"
  ) {
    return true;
  }
  return isSignatureFieldLabel(field.label);
}

/**
 * Signature fields reserved for the Safety Director (forms often label them
 * "EHS Director Signature").
 */
export function isEhsDirectorSignatureField(field: SignatoryFieldRef): boolean {
  if (!isSignatureTyped(field)) return false;
  const label = normalizeBlob(field.label);
  const id = normalizeBlob(field.id);
  const blob = `${label} ${id}`;
  if (/\behs\s+director\b/.test(blob)) return true;
  if (/\bsafety\s+director\b/.test(blob)) return true;
  if (/\behs\b/.test(blob) && /\bsignature\b/.test(blob)) return true;
  return false;
}

/** Signature fields that a supervisor is expected to sign. */
export function isSupervisorSignatureField(field: SignatoryFieldRef): boolean {
  if (!isSignatureTyped(field)) return false;
  if (isEhsDirectorSignatureField(field)) return false;
  const label = normalizeBlob(field.label);
  const id = normalizeBlob(field.id);
  const blob = `${label} ${id}`;
  return /\bsupervisor\b/.test(blob);
}

export function formSignatoryKindForField(field: SignatoryFieldRef): FormSignatoryKind | null {
  if (isEhsDirectorSignatureField(field)) return "ehs_director";
  if (isSupervisorSignatureField(field)) return "supervisor";
  return null;
}

/** Role codes/names that may sign EHS Director signature fields. */
export function isSafetyDirectorRole(role: SignatoryRoleRef): boolean {
  const code = normalizeBlob(String(role.roleCode ?? role.code ?? ""));
  const name = normalizeBlob(String(role.roleName ?? role.name ?? ""));
  const blob = `${code} ${name}`;
  if (/\behs\s+director\b/.test(blob)) return true;
  if (/\bsafety\s+director\b/.test(blob)) return true;
  if (code === "safety director" || code === "industrial safety director") return true;
  if (code === "ehs director") return true;
  // Starter template + common aliases until tenants rename the role.
  if (/\bsafety\s+manager\b/.test(blob)) return true;
  if (code === "industrial safety manager") return true;
  return false;
}

export function isSupervisorRole(role: SignatoryRoleRef): boolean {
  const code = normalizeBlob(String(role.roleCode ?? role.code ?? ""));
  const name = normalizeBlob(String(role.roleName ?? role.name ?? ""));
  const blob = `${code} ${name}`;
  if (/\bsupervisor\b/.test(blob)) return true;
  if (code === "industrial supervisor") return true;
  return false;
}

export function principalCanSignEhsDirector(roles: SignatoryRoleRef[]): boolean {
  return roles.some((role) => isSafetyDirectorRole(role));
}

/**
 * Incident delete (soft-archive) is limited to EHS / Safety Director roles and
 * Forge Creator (platform admin or FORGE_CREATOR product).
 */
export function canDeleteIncidents(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  roles?: readonly SignatoryRoleRef[] | null | undefined;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const products = input.activeProducts;
  if (products) {
    const codes = Array.from(products as Iterable<string>);
    if (codes.includes("FORGE_CREATOR")) return true;
  }
  return (input.roles ?? []).some((role) => isSafetyDirectorRole(role));
}

/**
 * Form template delete (soft-archive) is limited to Tenant Admin
 * (`industrial.admin`) and Forge Creator (platform admin or FORGE_CREATOR).
 */
export function canDeleteForms(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  permissions?: ReadonlySet<string> | readonly string[] | null | undefined;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const products = input.activeProducts;
  if (products) {
    const codes = Array.from(products as Iterable<string>);
    if (codes.includes("FORGE_CREATOR")) return true;
  }
  const permissions = input.permissions;
  if (permissions) {
    const codes = Array.from(permissions as Iterable<string>);
    if (codes.includes("industrial.admin")) return true;
  }
  return false;
}

/**
 * Inspection delete (soft-archive) is limited to Tenant Admin and Forge Creator.
 */
export function canDeleteInspections(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  permissions?: ReadonlySet<string> | readonly string[] | null | undefined;
}): boolean {
  return canDeleteForms(input);
}

/**
 * Safety Supplies item delete (soft-archive) is limited to Tenant Admin
 * (`industrial.admin`) and Forge Creator (platform admin or FORGE_CREATOR).
 */
export function canDeleteSupplyItems(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  permissions?: ReadonlySet<string> | readonly string[] | null | undefined;
}): boolean {
  return canDeleteForms(input);
}

/**
 * Safety Supplies location edit/delete is limited to Tenant Admin and Forge Creator.
 */
export function canManageSupplyLocations(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  permissions?: ReadonlySet<string> | readonly string[] | null | undefined;
}): boolean {
  return canDeleteForms(input);
}

/**
 * Task delete (soft-archive) is allowed for Tenant Admin, Forge Creator,
 * or the user who created the task.
 */
export function canDeleteTask(input: {
  isPlatformAdmin?: boolean | undefined;
  activeProducts?: ReadonlySet<string> | readonly string[] | null | undefined;
  permissions?: ReadonlySet<string> | readonly string[] | null | undefined;
  actorUserId?: string | null | undefined;
  createdByUserId?: string | null | undefined;
}): boolean {
  if (canDeleteForms(input)) return true;
  const actor = String(input.actorUserId ?? "").trim();
  const creator = String(input.createdByUserId ?? "").trim();
  return Boolean(actor && creator && actor === creator);
}

export function taskCreatedByUserId(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;
  for (const key of ["createdByUserId", "createdById", "createdBy"]) {
    const value = String(payload[key] ?? "").trim();
    if (value) return value;
  }
  return null;
}

export function listEhsDirectorSignatureFields(fields: SignatoryFieldRef[]): SignatoryFieldRef[] {
  return fields.filter((field) => isEhsDirectorSignatureField(field));
}

export function listSupervisorSignatureFields(fields: SignatoryFieldRef[]): SignatoryFieldRef[] {
  return fields.filter((field) => isSupervisorSignatureField(field));
}

export function isSignatureAnswerPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.image === "string" && rec.image.trim()) return true;
    if (typeof rec.dataUrl === "string" && rec.dataUrl.trim()) return true;
    if (typeof rec.url === "string" && rec.url.trim()) return true;
    const signedAt = String(rec.signedAt ?? rec.signed_at ?? "").trim();
    if (signedAt) return true;
    const signedBy = String(rec.signedByName ?? rec.signedBy ?? rec.signed_by ?? "").trim();
    if (signedBy) return true;
  }
  return false;
}

export function missingEhsDirectorSignatureFields(
  fields: SignatoryFieldRef[],
  answers: Record<string, unknown>,
): SignatoryFieldRef[] {
  return listEhsDirectorSignatureFields(fields).filter(
    (field) => !isSignatureAnswerPresent(answers[field.id]),
  );
}

export function missingSupervisorSignatureFields(
  fields: SignatoryFieldRef[],
  answers: Record<string, unknown>,
): SignatoryFieldRef[] {
  return listSupervisorSignatureFields(fields).filter(
    (field) => !isSignatureAnswerPresent(answers[field.id]),
  );
}

/** Signature or signature-date fields that a supervisor or EHS Director may fill later. */
export function isDeferredSignatoryField(field: SignatoryFieldRef): boolean {
  if (isEhsDirectorSignatureField(field) || isSupervisorSignatureField(field)) return true;
  const type = String(field.type ?? "")
    .trim()
    .toLowerCase();
  if (type !== "date" && type !== "datetime") return false;
  const label = normalizeBlob(field.label);
  const id = normalizeBlob(field.id);
  const blob = `${label} ${id}`;
  if (!/\bsignature\b/.test(blob) && !/\bdate\b/.test(blob)) return false;
  if (/\bsupervisor\b/.test(blob)) return true;
  if (/\behs\s+director\b/.test(blob) || /\bsafety\s+director\b/.test(blob)) return true;
  if (/\behs\b/.test(blob) && /\bdate\b/.test(blob)) return true;
  return false;
}

export function hasDeferredSignatoryFields(fields: SignatoryFieldRef[]): boolean {
  return fields.some((field) => isDeferredSignatoryField(field));
}

/** Supervisor and EHS Director signatures still outstanding on a saved submission. */
export function missingDeferredSignatureFields(
  fields: SignatoryFieldRef[],
  answers: Record<string, unknown>,
): SignatoryFieldRef[] {
  return [
    ...missingEhsDirectorSignatureFields(fields, answers),
    ...missingSupervisorSignatureFields(fields, answers),
  ];
}

/** Align stored status with whether supervisor / EHS signatures are still missing. */
export function resolveFormSubmissionStatus(
  fields: SignatoryFieldRef[],
  answers: Record<string, unknown>,
  currentStatus: string,
): string {
  if (!hasDeferredSignatoryFields(fields)) return currentStatus;
  const missing = missingDeferredSignatureFields(fields, answers);
  if (missing.length > 0) return FORM_STATUS_PENDING_SIGNATURE;
  if (currentStatus.trim().toUpperCase() === FORM_STATUS_PENDING_SIGNATURE) return "SUBMITTED";
  return currentStatus;
}

export function ehsDirectorSignatureValueChanged(
  fieldId: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const before = previous[fieldId];
  const after = next[fieldId];
  const beforePresent = isSignatureAnswerPresent(before);
  const afterPresent = isSignatureAnswerPresent(after);
  if (!beforePresent && !afterPresent) return false;
  if (beforePresent !== afterPresent) return true;
  return String(before ?? "") !== String(after ?? "");
}

export const FORM_STATUS_PENDING_SIGNATURE = "PENDING_SIGNATURE";
