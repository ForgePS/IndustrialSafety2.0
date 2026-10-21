"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DQF_FORM_LINK_FIELD_IDS,
  DQF_WORKSHEET_DOCUMENT_ORDER,
  deriveDqfDueDate,
  dotDqfField,
  driverDocumentCopyFieldId,
  driverDocumentDateFields,
  driverDqfFieldGroups,
  driverDqfGroupDescriptions,
  driverDqfGroupLabels,
  filterDriverDqfDocumentFields,
  formatDqfDisplayDate,
  type DotDqfFieldDef,
} from "@/lib/dot-dqf-fields";
import { dqfFormFillHref, dqfFormPrintHref, DQF_LINKED_FORM_TEMPLATES, findDqfFormDefinition } from "@/lib/dot-dqf-form-links";
import {
  isDriverCdlRequired,
  isDriverDiabeticEyeExamRequired,
  isDriverMecRequired,
} from "@/lib/dot-dqf-mec-rules";
import { producersMvrConsentFormFillHref } from "@/lib/producers-mvr-policy";
import { dqfWorksheetFocusKey } from "@/lib/dot-attention-links";
import {
  dqfWorksheetDocumentStatus,
  dqfWorksheetFieldToneClass,
  dqfWorksheetLicenseStatus,
  type DqfWorksheetItemTone,
} from "@/lib/dot-dqf-worksheet-status";
import { DotDqfUploadField } from "@/components/dot-dqf-upload-field";

const DotDqfRecordIdContext = createContext<string | undefined>(undefined);

type Props = {
  details: Record<string, string>;
  driverName: string;
  tenantSlug?: string | null;
  personnelId?: string | null;
  dotRecordId?: string | null;
  dqfFormIds?: Record<string, string>;
  /** Optional form catalog so Fill & sign can resolve when the id map is incomplete. */
  formDefinitions?: readonly Record<string, unknown>[];
  focusFieldId?: string | undefined;
  editing?: boolean;
  canUpload?: boolean;
  disabled?: boolean;
  onChange?: ((fieldId: string, value: string) => void) | undefined;
};

function WorksheetField({
  field,
  value,
  editing,
  canUpload,
  disabled,
  onChange,
  tone,
}: {
  field: DotDqfFieldDef;
  value: string;
  editing: boolean;
  canUpload: boolean;
  disabled: boolean;
  onChange?: ((fieldId: string, value: string) => void) | undefined;
  tone?: DqfWorksheetItemTone | undefined;
}) {
  const id = `dqf-${field.id}`;
  const recordId = useContext(DotDqfRecordIdContext);
  const toneClass = dqfWorksheetFieldToneClass(tone);

  if (field.type === "file") {
    return (
      <div className={toneClass}>
        <div className="text-muted small text-uppercase mb-1">{field.label}</div>
        <DotDqfUploadField
          field={field}
          value={value}
          {...(recordId ? { recordId } : {})}
          disabled={disabled || !canUpload}
          onChange={(next) => {
            onChange?.(field.id, next);
          }}
        />
      </div>
    );
  }

  if (!editing) {
    const display =
      field.type === "date" ? formatDqfDisplayDate(value) : value.trim() ? value : "—";
    return (
      <div className={toneClass}>
        <div className="text-muted small text-uppercase">{field.label}</div>
        <div className="fw-medium">{display}</div>
      </div>
    );
  }

  if (field.type === "select" || field.type === "yesno") {
    const options = field.options ?? (field.type === "yesno" ? ["Yes", "No"] : []);
    return (
      <div>
        <label className="form-label" htmlFor={id}>
          {field.label}
        </label>
        <select
          id={id}
          className="form-select"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange?.(field.id, event.target.value)}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="form-label" htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        className="form-control"
        type={field.type === "date" ? "date" : "text"}
        placeholder={field.placeholder}
        disabled={disabled}
        value={field.type === "date" ? value.slice(0, 10) : value}
        onChange={(event) => onChange?.(field.id, event.target.value)}
      />
      {field.description ? <div className="form-text">{field.description}</div> : null}
    </div>
  );
}

function DocumentCard({
  title,
  hint,
  status,
  statusClassName = "bg-label-secondary",
  itemClassName = "",
  sectionKey,
  children,
}: {
  title: string;
  hint?: string;
  status: string;
  statusClassName?: string;
  itemClassName?: string;
  sectionKey?: string;
  children: ReactNode;
}) {
  const collapseId = sectionKey
    ? `dqf-focus-${sectionKey}`
    : `dqf-doc-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const [open, setOpen] = useState(false);

  return (
    <div className={`accordion-item${itemClassName ? ` ${itemClassName}` : ""}`}>
      <h2 className="accordion-header">
        <button
          className={`accordion-button${open ? "" : " collapsed"}`}
          type="button"
          aria-expanded={open}
          aria-controls={collapseId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="me-2">{title}</span>
          <span className={`badge ${statusClassName} ms-auto me-2`}>{status}</span>
        </button>
      </h2>
      <div id={collapseId} className={`accordion-collapse collapse${open ? " show" : ""}`}>
        <div className="accordion-body">
          {/* Mount heavy upload/preview widgets only when expanded — otherwise every
              image field fires download-url + S3 fetches on driver open. */}
          {open ? (
            <>
              {hint ? <p className="text-muted small mb-3">{hint}</p> : null}
              {children}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveDqfLinkedFormId(
  fieldId: string,
  dqfFormIds?: Record<string, string>,
  formDefinitions?: readonly Record<string, unknown>[],
): string {
  const mapped = dqfFormIds?.[fieldId]?.trim() ?? "";
  if (mapped) return mapped;
  const templateName = DQF_LINKED_FORM_TEMPLATES[fieldId];
  if (!templateName || !formDefinitions?.length) return "";
  const match = findDqfFormDefinition(formDefinitions, templateName);
  return match?.id ? String(match.id).trim() : "";
}

function FormLinkActions({
  fieldId,
  personnelId,
  dotRecordId,
  dqfFormIds,
  formDefinitions,
}: {
  fieldId: string;
  personnelId?: string | null;
  dotRecordId?: string | null;
  dqfFormIds?: Record<string, string>;
  formDefinitions?: readonly Record<string, unknown>[];
}) {
  if (!DQF_FORM_LINK_FIELD_IDS.has(fieldId)) return null;
  const formId = resolveDqfLinkedFormId(fieldId, dqfFormIds, formDefinitions);
  const templateName = DQF_LINKED_FORM_TEMPLATES[fieldId] ?? "";
  const fillHref = formId
    ? fieldId === "mvrReleaseForm"
      ? producersMvrConsentFormFillHref(formId, personnelId)
      : dqfFormFillHref({
          formId,
          ...(personnelId !== undefined ? { personnelId } : {}),
          ...(dotRecordId !== undefined ? { dotRecordId } : {}),
        })
    : templateName
      ? `/modules/forms/?tab=library&q=${encodeURIComponent(templateName)}`
      : "/modules/forms/?tab=library";
  const printHref = formId
    ? dqfFormPrintHref(formId, personnelId)
    : fillHref;
  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      <Link href={fillHref} className="btn btn-sm btn-outline-primary">
        {formId ? "Fill & sign digital form" : "Open form in Forms"}
      </Link>
      {formId ? (
        <Link href={printHref} className="btn btn-sm btn-outline-secondary">
          Print for wet signature
        </Link>
      ) : null}
      <span className="text-muted small align-self-center">
        {formId
          ? "Sign digitally in-app, or print a blank copy for the DRIVER to sign by hand and upload."
          : "Open the form library, then fill & sign from Forms."}
      </span>
    </div>
  );
}

function DateAndUploadBlock({
  dateField,
  copyField,
  details,
  editing,
  canUpload,
  disabled,
  onChange,
  dateLabel = "Date in DQF",
}: {
  dateField: DotDqfFieldDef;
  copyField: DotDqfFieldDef;
  details: Record<string, string>;
  editing: boolean;
  canUpload: boolean;
  disabled: boolean;
  onChange?: ((fieldId: string, value: string) => void) | undefined;
  dateLabel?: string;
}) {
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <WorksheetField
          field={{ ...dateField, label: dateLabel }}
          value={details[dateField.id] ?? ""}
          editing={editing}
          canUpload={canUpload}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
      <div className="col-md-6">
        <WorksheetField
          field={copyField}
          value={details[copyField.id] ?? ""}
          editing={editing}
          canUpload={canUpload}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

export function DotDqfWorksheet({
  details,
  driverName,
  tenantSlug,
  personnelId: personnelIdInput,
  dotRecordId,
  dqfFormIds,
  formDefinitions,
  focusFieldId,
  editing = false,
  canUpload = false,
  disabled = false,
  onChange,
}: Props) {
  const personnelId = personnelIdInput ?? null;
  const linkedDotRecordId = dotRecordId ?? null;
  const linkedFormIds = dqfFormIds ?? {};
  const linkedFormDefinitions = formDefinitions ?? [];
  /** Form-linked sections stay fillable whenever the user can upload/manage. */
  const formSectionEditing = editing || canUpload;
  const nextDueDate = deriveDqfDueDate(details);
  const cdlRequired = isDriverCdlRequired(details);
  const mecRequired = isDriverMecRequired(details);
  const diabeticEyeExamRequired = isDriverDiabeticEyeExamRequired(details);
  const visibleDateFields = useMemo(
    () => filterDriverDqfDocumentFields(driverDocumentDateFields(), tenantSlug),
    [tenantSlug],
  );
  const visibleDateIds = new Set(visibleDateFields.map((field) => field.id));
  const licenseStatus = useMemo(() => dqfWorksheetLicenseStatus(details), [details]);

  useEffect(() => {
    const focusKey = dqfWorksheetFocusKey(focusFieldId ?? "");
    if (!focusKey) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`dqf-focus-${focusKey}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const collapsed = el.querySelector<HTMLButtonElement>(".accordion-button.collapsed");
      if (collapsed) collapsed.click();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusFieldId]);

  function worksheetDocStatus(key: (typeof DQF_WORKSHEET_DOCUMENT_ORDER)[number]) {
    return dqfWorksheetDocumentStatus(key, details, {
      ...(tenantSlug !== undefined ? { tenantSlug } : {}),
    });
  }

  function renderDocument(key: (typeof DQF_WORKSHEET_DOCUMENT_ORDER)[number]) {
    const docStatus = worksheetDocStatus(key);
    switch (key) {
      case "driversApplication":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="DOT Application for Employment"
            hint="PDF or picture"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <DateAndUploadBlock
              dateField={dotDqfField("driversApplicationForEmployment")}
              copyField={dotDqfField("driversApplicationCopy")}
              details={details}
              editing={editing}
          canUpload={canUpload}
              disabled={disabled}
              onChange={onChange}
              dateLabel="Date placed in DQF"
            />
          </DocumentCard>
        );
      case "mvrAnnual":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="MVR (Annual)"
            hint="Upload the annual MVR and set its expiration date"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <div className="row g-3">
              <div className="col-md-6">
                <WorksheetField
                  field={{ ...dotDqfField("mvrAnnual"), label: "MVR expiration date" }}
                  value={details.mvrAnnual ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("mvrCompleted")}
                  value={details.mvrCompleted ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-12">
                <WorksheetField
                  field={dotDqfField(driverDocumentCopyFieldId("mvrAnnual"))}
                  value={details[driverDocumentCopyFieldId("mvrAnnual")] ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
            <p className="text-muted small mb-0">
              Set the MVR expiration date after uploading so DQF compliance status stays current.
            </p>
          </DocumentCard>
        );
      case "medicalCert":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="Medical Examiner's Certificate (MEC)"
            hint="PDF or picture · expiration tracked inside"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <div className="row g-3">
              <div className="col-md-6">
                <WorksheetField
                  field={{ ...dotDqfField("medicalCertExpiry"), required: mecRequired }}
                  value={details.medicalCertExpiry ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("nationalRegistryNumber")}
                  value={details.nationalRegistryNumber ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-12">
                <WorksheetField
                  field={dotDqfField("medicalCertCopy")}
                  value={details.medicalCertCopy ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
          </DocumentCard>
        );
      case "diabeticEyeExam":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="Diabetic Eye Exam"
            hint={
              diabeticEyeExamRequired
                ? "Required · PDF or picture · expiration tracked inside"
                : "Optional · PDF or picture · expiration tracked inside"
            }
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <div className="row g-3">
              <div className="col-md-6">
                <WorksheetField
                  field={{
                    ...dotDqfField("diabeticEyeExamExpiry"),
                    required: diabeticEyeExamRequired,
                  }}
                  value={details.diabeticEyeExamExpiry ?? ""}
                  editing={editing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-12">
                <WorksheetField
                  field={dotDqfField("diabeticEyeExamCopy")}
                  value={details.diabeticEyeExamCopy ?? ""}
                  editing={editing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
          </DocumentCard>
        );
      case "medicalExaminerNationalRegistryVerification":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="Medical Examiner's National Registry Verification Form"
            hint="Fill the fields below or upload a copy — either path is enough"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <FormLinkActions
              fieldId="medicalExaminerNationalRegistryVerification"
              personnelId={personnelId}
              dotRecordId={linkedDotRecordId}
              dqfFormIds={linkedFormIds}
              formDefinitions={linkedFormDefinitions}
            />
            <div className="row g-3">
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("medicalExaminerNationalRegistryVerificationStatus")}
                  value={details.medicalExaminerNationalRegistryVerificationStatus ?? ""}
                  editing={formSectionEditing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("medicalExaminerRegistrationNumber")}
                  value={details.medicalExaminerRegistrationNumber ?? ""}
                  editing={formSectionEditing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("medicalExaminerNationalRegistryVerification")}
                  value={details.medicalExaminerNationalRegistryVerification ?? ""}
                  editing={formSectionEditing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-12">
                <WorksheetField
                  field={dotDqfField(driverDocumentCopyFieldId("medicalExaminerNationalRegistryVerification"))}
                  value={details[driverDocumentCopyFieldId("medicalExaminerNationalRegistryVerification")] ?? ""}
                  editing={formSectionEditing}
                  canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
          </DocumentCard>
        );
      case "certificationOfRoadTest":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="Certificate of Road Test"
            hint="PDF or picture"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <FormLinkActions
              fieldId="certificationOfRoadTest"
              personnelId={personnelId}
              dotRecordId={linkedDotRecordId}
              dqfFormIds={linkedFormIds}
              formDefinitions={linkedFormDefinitions}
            />
            <DateAndUploadBlock
              dateField={dotDqfField("certificationOfRoadTest")}
              copyField={dotDqfField(driverDocumentCopyFieldId("certificationOfRoadTest"))}
              details={details}
              editing={editing}
          canUpload={canUpload}
              disabled={disabled}
              onChange={onChange}
            />
            <div className="row g-3 mt-1">
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("certificationOfRoadTestDriverSignature")}
                  value={details.certificationOfRoadTestDriverSignature ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("certificationOfRoadTestPreceptorSignature")}
                  value={details.certificationOfRoadTestPreceptorSignature ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
          </DocumentCard>
        );
      case "dqfReview":
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title="DQF Review"
            hint="Annual reviews — fill the Annual DQF Form; each signed form stays on the EMPLOYEE record"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <FormLinkActions
              fieldId="certificationComplianceDriverLicense"
              personnelId={personnelId}
              dotRecordId={linkedDotRecordId}
              dqfFormIds={linkedFormIds}
              formDefinitions={linkedFormDefinitions}
            />
            <div className="row g-3">
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("certificationComplianceDriverLicense")}
                  value={details.certificationComplianceDriverLicense ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("certificationComplianceOnFile")}
                  value={details.certificationComplianceOnFile ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
              <div className="col-md-6">
                <WorksheetField
                  field={dotDqfField("certificationComplianceEvaluatorName")}
                  value={details.certificationComplianceEvaluatorName ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            </div>
            <p className="text-muted small mb-0">
              {details.dqfReviews?.trim()
                ? details.dqfReviews
                : "No annual DQF reviews recorded yet."}
            </p>
          </DocumentCard>
        );
      default: {
        if (!visibleDateIds.has(key)) return null;
        const dateField = dotDqfField(key);
        const copyField = dotDqfField(driverDocumentCopyFieldId(key));
        return (
          <DocumentCard
            key={key}
            sectionKey={key}
            title={dateField.label}
            hint="PDF or picture"
            status={docStatus.label}
            statusClassName={docStatus.badgeClassName}
            itemClassName={docStatus.itemClassName}
          >
            <FormLinkActions
              fieldId={key}
              personnelId={personnelId}
              dotRecordId={linkedDotRecordId}
              dqfFormIds={linkedFormIds}
              formDefinitions={linkedFormDefinitions}
            />
            <DateAndUploadBlock
              dateField={dateField}
              copyField={copyField}
              details={details}
              editing={editing}
          canUpload={canUpload}
              disabled={disabled}
              onChange={onChange}
            />
          </DocumentCard>
        );
      }
    }
  }

  return (
    <DotDqfRecordIdContext.Provider value={linkedDotRecordId ?? undefined}>
    <div className="vstack gap-4">
      <div className="row g-3 border-bottom pb-3">
        <div className="col-md-6">
          <div className="text-muted small text-uppercase">DRIVER</div>
          <div className="fs-5 fw-semibold">{driverName || "—"}</div>
        </div>
        <div className="col-md-6">
          <div className="text-muted small text-uppercase">Next Due Date</div>
          <div className="fs-5 fw-semibold">{formatDqfDisplayDate(nextDueDate)}</div>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h6 className="card-title mb-0">{driverDqfGroupLabels.profile}</h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {driverDqfFieldGroups.profile.map((fieldId) => (
              <div className="col-md-6" key={fieldId}>
                <WorksheetField
                  field={dotDqfField(fieldId)}
                  value={details[fieldId] ?? ""}
                  editing={editing}
          canUpload={canUpload}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className={`card${
          licenseStatus.itemClassName === "dqf-worksheet-item-critical"
            ? " dqf-worksheet-card-critical"
            : licenseStatus.itemClassName === "dqf-worksheet-item-pending"
              ? " dqf-worksheet-card-pending"
              : ""
        }`}
        id="dqf-focus-cdl-section"
      >
        <div className="card-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 className="card-title mb-0">{driverDqfGroupLabels.cdl}</h6>
            {driverDqfGroupDescriptions.cdl ? (
              <p className="text-muted small mb-0 mt-1">{driverDqfGroupDescriptions.cdl}</p>
            ) : null}
          </div>
          <span className={`badge ${licenseStatus.badgeClassName}`}>{licenseStatus.label}</span>
        </div>
        <div className="card-body vstack gap-3">
          {!cdlRequired ? (
            <div className="alert alert-info py-2 small mb-0">
              Non-CDL DRIVER: CDL number is optional. Upload a photo of the DRIVER&apos;S license and
              set the license expiration date so it can be tracked.
            </div>
          ) : null}
          <div className="row g-3">
            <div className="col-md-6">
              <WorksheetField
                field={{
                  ...dotDqfField("cdlNumber"),
                  label: cdlRequired ? "CDL / License Number *" : "DRIVER'S License Number",
                  required: cdlRequired,
                }}
                value={details.cdlNumber ?? ""}
                editing={editing}
          canUpload={canUpload}
                disabled={disabled}
                onChange={onChange}
              />
            </div>
            <div className="col-md-6">
              <WorksheetField
                field={{
                  ...dotDqfField("cdlExpiry"),
                  label: "License Expiration Date *",
                  required: cdlRequired,
                }}
                value={details.cdlExpiry ?? ""}
                editing={editing}
          canUpload={canUpload}
                disabled={disabled}
                onChange={onChange}
                tone={licenseStatus.tone}
              />
            </div>
          </div>
          <div
            className={`border rounded p-3${
              licenseStatus.tone === "critical"
                ? " dqf-worksheet-card-critical"
                : licenseStatus.tone === "pending"
                  ? " dqf-worksheet-card-pending"
                  : ""
            }`}
          >
            <div className="fw-medium mb-2">DRIVER&apos;S License Photo / Copy</div>
            <p className="text-muted small mb-3">
              Take a photo or upload a PDF of the DRIVER&apos;S license. Expiration is tracked above.
            </p>
            <WorksheetField
              field={{
                ...dotDqfField("driversLicenseCopy"),
                label: "License photo / PDF",
                description: "",
              }}
              value={details.driversLicenseCopy ?? ""}
              editing={editing}
              canUpload={canUpload}
              disabled={disabled}
              tone={licenseStatus.tone}
              onChange={(fieldId, value) => {
                onChange?.(fieldId, value);
                if (fieldId === "driversLicenseCopy" && value.trim() && !details.driversLicenseOnFile) {
                  onChange?.("driversLicenseOnFile", "Yes");
                }
              }}
            />
            <div className="mt-3">
              <WorksheetField
                field={dotDqfField("driversLicenseOnFile")}
                value={details.driversLicenseOnFile ?? ""}
                editing={editing}
                canUpload={canUpload}
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 className="card-title mb-0">{driverDqfGroupLabels.documents}</h6>
            {driverDqfGroupDescriptions.documents ? (
              <p className="text-muted small mb-0 mt-1">{driverDqfGroupDescriptions.documents}</p>
            ) : null}
            <p className="text-muted small mb-0 mt-1">
              Expand a document to upload a copy, set dates, or open Fill &amp; sign.
              {canUpload ? null : " Upload requires DOT manage permission."}
            </p>
          </div>
        </div>
        <div className="card-body p-0">
          <div className="accordion accordion-flush">
            {DQF_WORKSHEET_DOCUMENT_ORDER.map((key) => renderDocument(key))}
          </div>
        </div>
      </section>
    </div>
    </DotDqfRecordIdContext.Provider>
  );
}
