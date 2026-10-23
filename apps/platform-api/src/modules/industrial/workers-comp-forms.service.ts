import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialPersonnel,
  industrialWorkersCompCases,
  industrialWorkersCompForms,
  tenants,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { canManageWorkersCompMedical, canViewWorkersCompMedical } from "./workers-comp-helpers.js";
import {
  HIPAA_INITIAL_KEYS,
  WC_FORM_KEYS,
  WC_FORM_META,
  buildBlankWcFormPdf,
  buildFilledWcFormPdf,
  formatFormDate,
  wcFormPdfFilename,
  type HipaaAuthorizationData,
  type InjuryGuidelinesAckData,
  type WcFormKey,
} from "./workers-comp-forms-pdf.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNATURE_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_CHARS = 200_000;
export const MAX_WC_FORM_PERSONNEL_RECIPIENTS = 25;
export const MAX_WC_FORM_EXTERNAL_RECIPIENTS = 10;
const MAX_WC_FORM_PDF_BYTES = 8 * 1024 * 1024;

/** These forms carry Producers Rice Mill branding and staff contacts, so only that tenant gets them. */
export function isProducersRiceMillTenant(slug?: string | null, displayName?: string | null): boolean {
  const hay = [slug, displayName].filter(Boolean).join(" ").trim().toLowerCase();
  return hay ? /producers[-_\s]?rice/.test(hay) : false;
}

type Perms = { isPlatformAdmin?: boolean; permissions: ReadonlySet<string> };

function has(principal: Perms, ...codes: string[]): boolean {
  if (principal.isPlatformAdmin) return true;
  return codes.some(code => principal.permissions.has(code)) || principal.permissions.has("industrial.admin");
}

export function wcFormPermissions(principal: Perms) {
  return {
    canView: has(principal, "industrial.workers_comp.view", "industrial.workers_comp.manage", "industrial.access"),
    canManage: has(principal, "industrial.workers_comp.manage"),
    canViewMedical: canViewWorkersCompMedical({ isPlatformAdmin: principal.isPlatformAdmin === true, permissions: principal.permissions }),
    canManageMedical: canManageWorkersCompMedical({ isPlatformAdmin: principal.isPlatformAdmin === true, permissions: principal.permissions }),
  };
}

/** Who may read (view/print) and act on (sign/void/email) a given form. */
export function wcFormAccess(principal: Perms, formKey: WcFormKey) {
  const p = wcFormPermissions(principal);
  return WC_FORM_META[formKey].medical
    ? { read: p.canViewMedical, act: p.canManageMedical }
    : { read: p.canView || p.canManage, act: p.canManage };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseWcFormKey(value: unknown): WcFormKey {
  const key = String(value ?? "").trim().toUpperCase();
  if (!(WC_FORM_KEYS as readonly string[]).includes(key)) {
    throw new ForgeError("VALIDATION_FAILED", "Unknown form");
  }
  return key as WcFormKey;
}

export function parseSignatureDataUrl(value: unknown): string {
  const signature = typeof value === "string" ? value.trim() : "";
  if (!signature) throw new ForgeError("VALIDATION_FAILED", "A signature is required");
  if (signature.length > MAX_SIGNATURE_CHARS || !SIGNATURE_RE.test(signature)) {
    throw new ForgeError("VALIDATION_FAILED", "The signature image is not valid. Clear it and sign again.");
  }
  return signature;
}

/** Validate a submitted form body. Returns the stored data plus the signer shown on the form. */
export function parseWcFormData(
  formKey: WcFormKey,
  body: Record<string, unknown>,
  today: string,
): { data: InjuryGuidelinesAckData | HipaaAuthorizationData; signerName: string; signerRelationship: string | null } {
  const signedDate = text(body.signedDate, 10) || today;
  if (!isRealDate(signedDate)) throw new ForgeError("VALIDATION_FAILED", "Enter the date signed");
  if (signedDate > today) throw new ForgeError("VALIDATION_FAILED", "The date signed cannot be in the future");

  if (formKey === "INJURY_GUIDELINES_ACK") {
    const employeeName = text(body.employeeName, 200);
    if (!employeeName) throw new ForgeError("VALIDATION_FAILED", "Enter the employee's name");
    return { data: { employeeName, signedDate }, signerName: employeeName, signerRelationship: "Self" };
  }

  const patientName = text(body.patientName, 200);
  const dateOfBirth = text(body.dateOfBirth, 10);
  const providerName = text(body.providerName, 200);
  const signerName = text(body.signerName, 200) || patientName;
  const signerRelationship = text(body.signerRelationship, 120) || "Self";
  const rawInitials = (body.initials && typeof body.initials === "object" ? body.initials : {}) as Record<string, unknown>;
  const initials = Object.fromEntries(
    HIPAA_INITIAL_KEYS.map(key => [key, text(rawInitials[key], 6).toUpperCase()]),
  ) as HipaaAuthorizationData["initials"];

  if (!patientName) throw new ForgeError("VALIDATION_FAILED", "Enter the patient's name");
  if (!isRealDate(dateOfBirth) || dateOfBirth >= today) {
    throw new ForgeError("VALIDATION_FAILED", "Enter a valid date of birth");
  }
  if (!providerName) {
    throw new ForgeError("VALIDATION_FAILED", "Enter the provider being authorized to disclose records");
  }
  if (!HIPAA_INITIAL_KEYS.some(key => initials[key])) {
    throw new ForgeError("VALIDATION_FAILED", "Initial at least one authorization line");
  }
  if (HIPAA_INITIAL_KEYS.some(key => initials[key] && !/^[A-Z][A-Z.\- ]{0,5}$/.test(initials[key]))) {
    throw new ForgeError("VALIDATION_FAILED", "Initials should be letters only, like JM");
  }
  return {
    data: { patientName, dateOfBirth, providerName, initials, signerName, signerRelationship, signedDate },
    signerName,
    signerRelationship,
  };
}

/** Parse email recipients: Producers staff (personnel ids) and typed outside addresses. */
export function parseWcFormRecipients(body: Record<string, unknown>) {
  const personnelIds = [
    ...new Set(
      (Array.isArray(body.personnelIds) ? body.personnelIds : [])
        .map(v => String(v ?? "").trim())
        .filter(v => UUID_RE.test(v)),
    ),
  ];
  const rawEmails = Array.isArray(body.emails)
    ? body.emails
    : typeof body.emails === "string"
      ? body.emails.split(/[\s,;]+/)
      : [];
  const emails = [...new Set(rawEmails.map(v => String(v ?? "").trim().toLowerCase()).filter(Boolean))];
  const invalid = emails.filter(email => email.length > 320 || !EMAIL_RE.test(email));
  if (invalid.length) {
    throw new ForgeError("VALIDATION_FAILED", `Check these email addresses: ${invalid.slice(0, 3).join(", ")}`);
  }
  if (!personnelIds.length && !emails.length) {
    throw new ForgeError("VALIDATION_FAILED", "Choose at least one recipient");
  }
  if (personnelIds.length > MAX_WC_FORM_PERSONNEL_RECIPIENTS) {
    throw new ForgeError("VALIDATION_FAILED", `Choose no more than ${MAX_WC_FORM_PERSONNEL_RECIPIENTS} people`);
  }
  if (emails.length > MAX_WC_FORM_EXTERNAL_RECIPIENTS) {
    throw new ForgeError("VALIDATION_FAILED", `Enter no more than ${MAX_WC_FORM_EXTERNAL_RECIPIENTS} outside addresses`);
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  return { personnelIds, emails, message };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormRow = typeof industrialWorkersCompForms.$inferSelect;

/**
 * Producers paper forms on workers' compensation cases: Employee Injury Guidelines acknowledgment
 * and HIPAA Authorization. Signed forms are immutable; HIPAA forms need the WC medical permissions
 * and are hidden by RLS unless the medical-access flag is set for the transaction.
 */
@Injectable()
export class WorkersCompFormsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return id;
  }

  private async enableMedical(tx: DatabaseTransaction) {
    await tx.execute(sql`select set_config('app.industrial_wc_medical_access', 'on', true)`);
  }

  private async formsAvailable(tx: DatabaseTransaction, tenantId: string): Promise<boolean> {
    const [tenant] = await tx
      .select({ slug: tenants.slug, displayName: tenants.displayName })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return isProducersRiceMillTenant(tenant?.slug, tenant?.displayName);
  }

  private async assertAvailable(tx: DatabaseTransaction, tenantId: string) {
    if (!(await this.formsAvailable(tx, tenantId))) {
      throw new ForgeError("NOT_FOUND", "These forms are not available for this company");
    }
  }

  private async loadCase(tx: DatabaseTransaction, tenantId: string, caseId: string) {
    if (!UUID_RE.test(caseId)) throw new ForgeError("VALIDATION_FAILED", "Invalid case id");
    const [row] = await tx
      .select({
        id: industrialWorkersCompCases.id,
        caseNumber: industrialWorkersCompCases.caseNumber,
        archivedAt: industrialWorkersCompCases.archivedAt,
        personnelName: industrialPersonnel.displayName,
        personnelFirstName: industrialPersonnel.firstName,
        personnelLastName: industrialPersonnel.lastName,
        dateOfBirth: industrialPersonnel.dateOfBirth,
      })
      .from(industrialWorkersCompCases)
      .leftJoin(industrialPersonnel, eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId))
      .where(and(eq(industrialWorkersCompCases.id, caseId), eq(industrialWorkersCompCases.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");
    return row;
  }

  /** Load one form the principal may read. HIPAA rows are only visible with the medical flag. */
  private async loadForm(tx: DatabaseTransaction, principal: ForgePrincipal, tenantId: string, formId: string) {
    if (!UUID_RE.test(formId)) throw new ForgeError("VALIDATION_FAILED", "Invalid form id");
    if (wcFormPermissions(principal).canViewMedical) await this.enableMedical(tx);
    const [row] = await tx
      .select()
      .from(industrialWorkersCompForms)
      .where(and(eq(industrialWorkersCompForms.id, formId), eq(industrialWorkersCompForms.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "Form not found");
    return row;
  }

  private mapForm(row: FormRow, includeData: boolean) {
    const key = row.formKey as WcFormKey;
    const log = Array.isArray(row.emailLog) ? (row.emailLog as Array<Record<string, unknown>>) : [];
    return {
      id: row.id,
      caseId: row.caseId,
      formKey: key,
      title: WC_FORM_META[key]?.title ?? key,
      status: row.status,
      signerName: row.signerName,
      signerRelationship: row.signerRelationship,
      signedAt: row.signedAt.toISOString(),
      createdByUserId: row.createdByUserId,
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidReason: row.voidReason,
      emailCount: log.length,
      lastEmailedAt: log.length ? String(log[log.length - 1]?.at ?? "") || null : null,
      ...(includeData ? { data: row.formData } : {}),
    };
  }

  private auditEvent(tx: DatabaseTransaction, principal: ForgePrincipal, action: string, row: Pick<FormRow, "id" | "caseId" | "formKey">, metadata: Record<string, unknown> = {}) {
    return this.audit.writeInTransaction(tx, {
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      actorPersonId: principal.personId,
      actorType: "USER",
      action,
      resourceType: "industrial_workers_comp_form",
      resourceId: row.id,
      result: "SUCCESS",
      riskLevel: WC_FORM_META[row.formKey as WcFormKey]?.medical ? "HIGH" : "LOW",
      correlationId: "",
      requestId: "",
      metadata: { caseId: row.caseId, formKey: row.formKey, ...metadata },
    });
  }

  async list(principal: ForgePrincipal, caseId: string) {
    const tenantId = this.tenant(principal);
    const perms = wcFormPermissions(principal);
    return withTenantTransaction(this.db, tenantId, async tx => {
      const available = await this.formsAvailable(tx, tenantId);
      const wcCase = await this.loadCase(tx, tenantId, caseId);
      const base = {
        available,
        permissions: {
          guidelines: wcFormAccess(principal, "INJURY_GUIDELINES_ACK"),
          hipaa: wcFormAccess(principal, "HIPAA_AUTHORIZATION"),
        },
        prefill: {
          employeeName:
            [wcCase.personnelFirstName, wcCase.personnelLastName].filter(Boolean).join(" ").trim() ||
            wcCase.personnelName ||
            "",
          // Date of birth is medical-adjacent; only send it to people who may fill the HIPAA form.
          dateOfBirth: perms.canManageMedical ? (wcCase.dateOfBirth ?? "") : "",
        },
        caseArchived: Boolean(wcCase.archivedAt),
      };
      if (!available) return { ...base, forms: [] };
      if (perms.canViewMedical) await this.enableMedical(tx);
      const rows = await tx
        .select()
        .from(industrialWorkersCompForms)
        .where(and(eq(industrialWorkersCompForms.tenantId, tenantId), eq(industrialWorkersCompForms.caseId, caseId)))
        .orderBy(asc(industrialWorkersCompForms.signedAt));
      const forms = rows
        .filter(row => wcFormAccess(principal, row.formKey as WcFormKey).read)
        .map(row => this.mapForm(row, true));
      return { ...base, forms };
    });
  }

  async create(principal: ForgePrincipal, caseId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const formKey = parseWcFormKey(body.formKey);
    if (!wcFormAccess(principal, formKey).act) {
      throw new ForgeError("FORBIDDEN", WC_FORM_META[formKey].medical
        ? "You need the workers' comp medical permission to complete the HIPAA form"
        : "You need permission to manage workers' comp cases to complete this form");
    }
    const signatureDataUrl = parseSignatureDataUrl(body.signatureDataUrl);
    const parsed = parseWcFormData(formKey, body, todayUtc());

    return withTenantTransaction(this.db, tenantId, async tx => {
      await this.assertAvailable(tx, tenantId);
      const wcCase = await this.loadCase(tx, tenantId, caseId);
      if (wcCase.archivedAt) throw new ForgeError("VALIDATION_FAILED", "This case is archived");
      if (WC_FORM_META[formKey].medical) await this.enableMedical(tx);
      const id = createId();
      const [row] = await tx
        .insert(industrialWorkersCompForms)
        .values({
          id,
          tenantId,
          caseId,
          formKey,
          formData: parsed.data,
          signatureDataUrl,
          signerName: parsed.signerName,
          signerRelationship: parsed.signerRelationship,
          createdByUserId: principal.userId ?? null,
        })
        .returning();
      await this.auditEvent(tx, principal, "workers_comp.form.signed", row!);
      return this.mapForm(row!, true);
    });
  }

  async void(principal: ForgePrincipal, formId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const reason = text(body.reason, 1000);
    if (!reason) throw new ForgeError("VALIDATION_FAILED", "Enter a reason for voiding this form");
    return withTenantTransaction(this.db, tenantId, async tx => {
      const row = await this.loadForm(tx, principal, tenantId, formId);
      if (!wcFormAccess(principal, row.formKey as WcFormKey).act) {
        throw new ForgeError("FORBIDDEN", "You do not have permission to void this form");
      }
      if (row.status === "VOIDED") throw new ForgeError("VALIDATION_FAILED", "This form is already voided");
      const [updated] = await tx
        .update(industrialWorkersCompForms)
        .set({ status: "VOIDED", voidedAt: new Date(), voidedByUserId: principal.userId ?? null, voidReason: reason })
        .where(and(eq(industrialWorkersCompForms.id, row.id), eq(industrialWorkersCompForms.tenantId, tenantId)))
        .returning();
      await this.auditEvent(tx, principal, "workers_comp.form.voided", row, { reason });
      return this.mapForm(updated!, true);
    });
  }

  /** The original paper form, unchanged, for printing by hand. */
  async blankPdf(principal: ForgePrincipal, formKeyRaw: string) {
    const tenantId = this.tenant(principal);
    const formKey = parseWcFormKey(formKeyRaw);
    if (!wcFormAccess(principal, formKey).read) {
      throw new ForgeError("FORBIDDEN", "You do not have permission to open this form");
    }
    await withTenantTransaction(this.db, tenantId, tx => this.assertAvailable(tx, tenantId));
    return { filename: wcFormPdfFilename(formKey, null, false), pdf: buildBlankWcFormPdf(formKey) };
  }

  private async renderFilled(row: FormRow, caseNumber: string | null) {
    const formKey = row.formKey as WcFormKey;
    const common = { formId: row.id, signedAt: row.signedAt, signatureDataUrl: row.signatureDataUrl };
    const pdf =
      formKey === "HIPAA_AUTHORIZATION"
        ? await buildFilledWcFormPdf({ ...common, formKey, data: row.formData as HipaaAuthorizationData })
        : await buildFilledWcFormPdf({ ...common, formKey, data: row.formData as InjuryGuidelinesAckData });
    return { filename: wcFormPdfFilename(formKey, caseNumber, true), pdf };
  }

  /** The signed form drawn onto the original page. */
  async filledPdf(principal: ForgePrincipal, formId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async tx => {
      await this.assertAvailable(tx, tenantId);
      const row = await this.loadForm(tx, principal, tenantId, formId);
      if (!wcFormAccess(principal, row.formKey as WcFormKey).read) {
        throw new ForgeError("FORBIDDEN", "You do not have permission to open this form");
      }
      const wcCase = await this.loadCase(tx, tenantId, row.caseId);
      const rendered = await this.renderFilled(row, wcCase.caseNumber);
      await this.auditEvent(tx, principal, "workers_comp.form.printed", row);
      return { ...rendered, voided: row.status === "VOIDED" };
    });
  }

  async email(principal: ForgePrincipal, formId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const { personnelIds, emails, message } = parseWcFormRecipients(body);

    const loaded = await withTenantTransaction(this.db, tenantId, async tx => {
      await this.assertAvailable(tx, tenantId);
      const row = await this.loadForm(tx, principal, tenantId, formId);
      if (!wcFormAccess(principal, row.formKey as WcFormKey).act) {
        throw new ForgeError("FORBIDDEN", "You do not have permission to email this form");
      }
      if (row.status === "VOIDED") throw new ForgeError("VALIDATION_FAILED", "Voided forms cannot be emailed");
      const wcCase = await this.loadCase(tx, tenantId, row.caseId);
      const people = personnelIds.length
        ? await tx
            .select({
              id: industrialPersonnel.id,
              displayName: industrialPersonnel.displayName,
              email: industrialPersonnel.email,
              companyEmail: industrialPersonnel.companyEmail,
            })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.tenantId, tenantId),
                inArray(industrialPersonnel.id, personnelIds),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
        : [];
      return { row, caseNumber: wcCase.caseNumber, people };
    });

    const recipients: Array<{ email: string; name: string | null; personnelId: string | null }> = [];
    const skipped: Array<{ personnelId: string; name: string | null; reason: string }> = [];
    const seen = new Set<string>();
    for (const id of personnelIds) {
      const person = loaded.people.find(p => p.id === id);
      if (!person) {
        skipped.push({ personnelId: id, name: null, reason: "Person not found" });
        continue;
      }
      const email = [person.companyEmail, person.email].map(v => v?.trim() ?? "").find(v => EMAIL_RE.test(v));
      if (!email) {
        skipped.push({ personnelId: id, name: person.displayName, reason: "No email address on file" });
        continue;
      }
      if (seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      recipients.push({ email, name: person.displayName, personnelId: id });
    }
    for (const email of emails) {
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email, name: null, personnelId: null });
    }
    if (!recipients.length) throw new ForgeError("VALIDATION_FAILED", "None of the selected people have an email address");

    const formKey = loaded.row.formKey as WcFormKey;
    const { filename, pdf } = await this.renderFilled(loaded.row, loaded.caseNumber);
    if (pdf.length > MAX_WC_FORM_PDF_BYTES) {
      throw new ForgeError("VALIDATION_FAILED", "The PDF is too large to email. Print it instead.");
    }
    const title = WC_FORM_META[formKey].title;
    const caseLabel = loaded.caseNumber ? `case ${loaded.caseNumber}` : "a workers' compensation case";
    const subject = `${title} (signed) - ${loaded.row.signerName}`;
    const confidential = WC_FORM_META[formKey].medical
      ? "This form contains protected health information. Do not forward it to anyone who is not authorized to receive it."
      : "";
    const signedOn = formatFormDate(loaded.row.signedAt.toISOString().slice(0, 10));
    const htmlBody = [
      `<p>The signed <strong>${escapeHtml(title)}</strong> for ${escapeHtml(loaded.row.signerName)} (${escapeHtml(caseLabel)}) is attached as a PDF.</p>`,
      `<p>Signed ${escapeHtml(signedOn)}.</p>`,
      message ? `<p style="white-space:pre-wrap;border-left:3px solid #d1d5db;padding-left:10px">${escapeHtml(message)}</p>` : "",
      confidential ? `<p style="color:#b91c1c"><strong>Confidential:</strong> ${escapeHtml(confidential)}</p>` : "",
      `<p style="color:#6b7280;font-size:12px">Attachment: ${escapeHtml(filename)}</p>`,
    ].join("");
    const textBody = [
      `The signed ${title} for ${loaded.row.signerName} (${caseLabel}) is attached as a PDF.`,
      `Signed ${signedOn}.`,
      message,
      confidential ? `Confidential: ${confidential}` : "",
      `Attachment: ${filename}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const attachment = { filename, contentType: "application/pdf", contentBase64: pdf.toString("base64") };

    const results: Array<{ email: string; name: string | null; accepted: boolean; detail?: string }> = [];
    for (const recipient of recipients) {
      try {
        const result = await this.notifications.sendTemplatedEmail({
          to: recipient.email,
          templateKey: "workers_comp_form",
          tenantId,
          vars: { subject, htmlBody, textBody },
          attachments: [attachment],
        });
        results.push({
          email: recipient.email,
          name: recipient.name,
          accepted: result.accepted,
          ...(result.accepted || !result.detail ? {} : { detail: result.detail }),
        });
      } catch (err) {
        results.push({ email: recipient.email, name: recipient.name, accepted: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    const entry = {
      at: new Date().toISOString(),
      byUserId: principal.userId ?? null,
      to: results.map(r => ({ email: r.email, name: r.name, accepted: r.accepted })),
      message: message || null,
    };
    await withTenantTransaction(this.db, tenantId, async tx => {
      if (wcFormPermissions(principal).canViewMedical) await this.enableMedical(tx);
      await tx
        .update(industrialWorkersCompForms)
        .set({ emailLog: sql`${industrialWorkersCompForms.emailLog} || ${JSON.stringify([entry])}::jsonb` })
        .where(and(eq(industrialWorkersCompForms.id, loaded.row.id), eq(industrialWorkersCompForms.tenantId, tenantId)));
      await this.auditEvent(tx, principal, "workers_comp.form.emailed", loaded.row, {
        recipients: results.map(r => r.email),
        accepted: results.filter(r => r.accepted).length,
      });
    });

    return {
      sent: results.filter(r => r.accepted).length,
      failed: results.filter(r => !r.accepted),
      skipped,
      results,
    };
  }
}
