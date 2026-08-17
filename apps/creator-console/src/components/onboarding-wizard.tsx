"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ForgeAssetUploader,
  ForgePageHeader,
  ForgeStepper,
  FormField,
  FormSection,
  StatusBadge,
  useToast,
} from "@forge/ui";
import { catalogModulesForSeed } from "@forge/contracts";
import {
  createImportApi,
  createLookupViaTransport,
  ImportCenterApp,
} from "@forge/import-center";
import {
  apiGet,
  apiSend,
  humanizeForgeError,
  onboardingActivate,
  onboardingCompleteStep,
  onboardingGetSession,
  onboardingStart,
  toIfMatch,
  type OnboardingSessionView,
  type OnboardingStepRow,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { productDisplayName } from "@/lib/presentation";
import styles from "../app/page.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

type LocationDraft = {
  name: string;
  facilityType: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  timezone: string;
};

type LookupDraft = {
  name: string;
  description?: string;
  departmentName?: string;
  active?: boolean;
};

type CompanyDocDraft = {
  id: string;
  title: string;
  filename: string;
  size: number;
};

type BusinessSettingsDraft = {
  timezone: string;
  dateFormat: string;
  employeeIdFormat: string;
  emailNotifications: boolean;
  mobileAccess: boolean;
  employeePortal: boolean;
  incidentNumbering: string;
  inspectionNumbering: string;
  fleetNumbering: string;
};

const COMPANY_TYPES = [
  { value: "INDUSTRIAL", label: "Industrial / Manufacturing", template: "INDUSTRIAL_STARTER" },
  { value: "FIRE_DEPARTMENT", label: "Fire Department", template: "RMS_STARTER" },
  { value: "FIRE_ACADEMY", label: "Fire Academy", template: "ACADEMY_STARTER" },
  { value: "OTHER", label: "Other", template: undefined },
] as const;

const BUSINESS_ROLES: Array<{ label: string; match: RegExp }> = [
  { label: "Company Administrator", match: /ADMIN|TENANT_ADMIN|DEPARTMENT_ADMIN/i },
  { label: "Safety Administrator", match: /SAFETY/i },
  { label: "HR Administrator", match: /HR|PERSONNEL/i },
  { label: "Training Administrator", match: /TRAINING/i },
  { label: "Read Only", match: /EMPLOYEE|MEMBER|READ/i },
];

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

const COMPANY_DOC_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif";

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function stepLabel(key: string): string {
  const map: Record<string, string> = {
    CREATE_TENANT: "Company",
    SELECT_CUSTOMER_TYPE: "Company type",
    CREATE_PRIMARY_ORGANIZATION: "Organization",
    SELECT_PRODUCTS: "Products",
    SELECT_MODULES: "Modules",
    CONFIGURE_SUBSCRIPTION: "Subscription",
    CONFIGURE_LOCATIONS: "Locations",
    CONFIGURE_ORG_LOOKUPS: "Organization",
    CONFIGURE_DATA_IMPORT: "Data import",
    CONFIGURE_DOCUMENTS: "Documents",
    CONFIGURE_BRANDING: "Branding",
    CONFIGURE_BUSINESS_SETTINGS: "Business settings",
    CREATE_PRIMARY_ADMINISTRATOR: "Administrators",
    SEND_INVITATION: "Invitations",
    REVIEW_CONFIGURATION: "Review",
    ACTIVATE_TENANT: "Activate",
  };
  return map[key] ?? key.replace(/_/g, " ").toLowerCase();
}

/** Steps shown in the activator wizard (exclude start/activate bookkeeping). Keep DATA_IMPORT. */
function pendingSteps(steps: OnboardingStepRow[]): OnboardingStepRow[] {
  return steps.filter(
    (s) =>
      s.stepKey !== "CREATE_TENANT" &&
      s.stepKey !== "SELECT_CUSTOMER_TYPE" &&
      s.stepKey !== "ACTIVATE_TENANT" &&
      s.status !== "SKIPPED",
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyLookup(name = ""): LookupDraft {
  return { name, description: "", active: true };
}

export function OnboardingWizard({
  initialSessionId,
}: {
  initialSessionId?: string | undefined;
}) {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [view, setView] = useState<OnboardingSessionView | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [phase, setPhase] = useState<"start" | "wizard" | "success">("start");
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start form
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [customerType, setCustomerType] = useState<(typeof COMPANY_TYPES)[number]["value"]>("INDUSTRIAL");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Step forms
  const [orgDisplayName, setOrgDisplayName] = useState("");
  const [orgLegalName, setOrgLegalName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [waiveSubscription, setWaiveSubscription] = useState(true);
  const [locations, setLocations] = useState<LocationDraft[]>([
    {
      name: "Primary location",
      facilityType: "SITE",
      addressLine1: "",
      city: "",
      stateProvince: "",
      postalCode: "",
      timezone: "America/Chicago",
    },
  ]);
  const [departments, setDepartments] = useState<LookupDraft[]>([emptyLookup("Operations")]);
  const [positions, setPositions] = useState<LookupDraft[]>([emptyLookup("Supervisor")]);
  const [employmentTypes, setEmploymentTypes] = useState<LookupDraft[]>([
    emptyLookup("Full time"),
    emptyLookup("Part time"),
  ]);
  const [deptDraft, setDeptDraft] = useState<LookupDraft>(emptyLookup());
  const [posDraft, setPosDraft] = useState<LookupDraft>(emptyLookup());
  const [empDraft, setEmpDraft] = useState<LookupDraft>(emptyLookup());
  const [companyDocs, setCompanyDocs] = useState<CompanyDocDraft[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettingsDraft>({
    timezone: "America/Chicago",
    dateFormat: "MM/DD/YYYY",
    employeeIdFormat: "EMP-####",
    emailNotifications: true,
    mobileAccess: true,
    employeePortal: true,
    incidentNumbering: "INC-",
    inspectionNumbering: "INSP-",
    fleetNumbering: "FLT-",
  });
  const [primaryColor, setPrimaryColor] = useState("#1a365d");
  const [secondaryColor, setSecondaryColor] = useState("#2d3748");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoDocumentId, setLogoDocumentId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [adminFirst, setAdminFirst] = useState("");
  const [adminLast, setAdminLast] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRoleCode, setAdminRoleCode] = useState("");
  const [sendInviteNow, setSendInviteNow] = useState(true);
  const [activatedTenantId, setActivatedTenantId] = useState<string | null>(null);

  const importApi = useMemo(
    () =>
      createImportApi({
        get: (path, options) => apiGet(path, options),
        send: (path, method, payload, options) => apiSend(path, method, payload, options),
      }),
    [],
  );

  const createLookup = useMemo(() => {
    const tenantId = view?.session.tenantId;
    if (!tenantId) return undefined;
    return createLookupViaTransport(
      {
        get: (path, options) => apiGet(path, options),
        send: (path, method, payload, options) => apiSend(path, method, payload, options),
      },
      tenantId,
    );
  }, [view?.session.tenantId]);

  const catalogProducts = useMemo(
    () => [
      {
        code: "FORGE_INDUSTRIAL",
        name: "Forge Industrial Safety",
        description: "Safety, compliance, and operations for industrial companies.",
      },
      {
        code: "FORGE_RMS",
        name: "Forge RMS",
        description: "Records management for fire and emergency services.",
      },
      {
        code: "FORGE_ACADEMY",
        name: "Forge Academy",
        description: "Training academy administration and coursework.",
      },
    ],
    [],
  );

  const industrialSelected = selectedProducts.includes("FORGE_INDUSTRIAL");

  useEffect(() => {
    if (!slugTouched && displayName) setSlug(normalizeSlug(displayName));
  }, [displayName, slugTouched]);

  const applyView = useCallback((next: OnboardingSessionView, nextEtag?: string) => {
    setView(next);
    if (nextEtag) setEtag(nextEtag);
    else setEtag(toIfMatch(next.session.recordVersion));
    const open = pendingSteps(next.steps).find((s) => s.status !== "COMPLETED");
    setActiveStepKey(open?.stepKey ?? "REVIEW_CONFIGURATION");
    setPhase(next.session.status === "COMPLETED" ? "success" : "wizard");
    setActivatedTenantId(next.session.tenantId);
    const data = next.session.sessionDataJson ?? {};
    if (Array.isArray(data.productCodes)) setSelectedProducts(data.productCodes as string[]);
    if (Array.isArray(data.moduleCodes)) setSelectedModules(data.moduleCodes as string[]);
    if (typeof data.adminEmail === "string") setAdminEmail(data.adminEmail);
    if (typeof data.adminFirstName === "string") setAdminFirst(data.adminFirstName);
    if (typeof data.adminLastName === "string") setAdminLast(data.adminLastName);
    if (typeof data.adminRoleCode === "string") setAdminRoleCode(data.adminRoleCode);
  }, []);

  useEffect(() => {
    if (!initialSessionId) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const result = await onboardingGetSession(initialSessionId);
        applyView(result.data, result.etag);
      } catch (err) {
        setError(humanizeForgeError(err instanceof Error ? err.message : "Could not load onboarding."));
      } finally {
        setBusy(false);
      }
    })();
  }, [initialSessionId, applyView]);

  const wizardSteps = useMemo(() => {
    if (!view) return [];
    return pendingSteps(view.steps).map((s) => ({
      id: s.stepKey,
      label: stepLabel(s.stepKey),
      done: s.status === "COMPLETED",
    }));
  }, [view]);

  const progressPct = useMemo(() => {
    if (!wizardSteps.length) return 0;
    const done = wizardSteps.filter((s) => s.done).length;
    return Math.round((done / wizardSteps.length) * 100);
  }, [wizardSteps]);

  const moduleOptions = useMemo(() => {
    const codes = selectedProducts.length ? selectedProducts : ["FORGE_INDUSTRIAL"];
    return codes.flatMap((code) => catalogModulesForSeed(code));
  }, [selectedProducts]);

  const roleOptions = useMemo(() => {
    const roles = view?.template?.roles ?? [];
    return roles.map((role) => {
      const friendly =
        BUSINESS_ROLES.find((item) => item.match.test(role.code) || item.match.test(role.name))?.label ??
        role.name;
      return { code: role.code, label: friendly };
    });
  }, [view]);

  async function startCompany() {
    setBusy(true);
    setError(null);
    setSaveState("saving");
    try {
      const typeMeta = COMPANY_TYPES.find((t) => t.value === customerType);
      const result = await onboardingStart({
        customerType,
        ...(typeMeta?.template ? { templateCode: typeMeta.template } : {}),
        tenantKey: normalizeKey(slug || displayName),
        slug: normalizeSlug(slug || displayName),
        legalName: legalName.trim() || displayName.trim(),
        displayName: displayName.trim(),
        timezone,
      });
      applyView(result.data, result.etag);
      setOrgDisplayName(displayName.trim());
      setOrgLegalName(legalName.trim() || displayName.trim());
      setOrgSlug(normalizeSlug(`${displayName}-org`));
      setBusinessSettings((prev) => ({ ...prev, timezone }));
      const product = result.data.template?.productCode;
      if (product) setSelectedProducts([product]);
      const modules = result.data.template?.modules?.map((m) => m.code) ?? [];
      if (modules.length) setSelectedModules(modules);
      const adminRole =
        result.data.template?.roles.find((r) => /ADMIN/i.test(r.code))?.code ??
        result.data.template?.roles[0]?.code ??
        "";
      setAdminRoleCode(adminRole);
      setSaveState("saved");
      toast.push("Company draft created", "success");
    } catch (err) {
      setSaveState("error");
      setError(humanizeForgeError(err instanceof Error ? err.message : "Could not create company."));
    } finally {
      setBusy(false);
    }
  }

  async function completeCurrent(payload: Record<string, unknown>) {
    if (!view || !etag || !activeStepKey) return;
    setBusy(true);
    setError(null);
    setSaveState("saving");
    try {
      const result = await onboardingCompleteStep(view.session.id, activeStepKey, payload, {
        ifMatch: etag,
        tenantId: view.session.tenantId,
      });
      applyView(result.data, result.etag);
      setSaveState("saved");
      toast.push("Progress saved", "success");
    } catch (err) {
      setSaveState("error");
      setError(humanizeForgeError(err instanceof Error ? err.message : "Could not save this step."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File | null) {
    if (!view || !file) return;
    setLogoUploading(true);
    setError(null);
    try {
      const upload = await apiSend<{ documentId: string; uploadUrl: string }>(
        `/api/v1/tenants/${view.session.tenantId}/branding/assets/upload-url`,
        "POST",
        {
          kind: "logo",
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentLength: file.size,
        },
      );
      const put = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Logo upload failed. Please try again.");
      setLogoDocumentId(upload.documentId);
      setLogoPreview(URL.createObjectURL(file));
      setLogoName(file.name);
      setLogoSize(file.size);
      toast.push("Logo uploaded", "success");
    } catch (err) {
      setError(humanizeForgeError(err instanceof Error ? err.message : "Logo upload failed."));
    } finally {
      setLogoUploading(false);
    }
  }

  async function uploadCompanyDocument(file: File | null) {
    if (!view || !file) return;
    setDocUploading(true);
    setError(null);
    try {
      const title = file.name.replace(/\.[^.]+$/, "") || file.name;
      const upload = await apiSend<{ id: string; documentId: string; uploadUrl: string }>(
        `/api/v1/tenants/${view.session.tenantId}/company-documents/upload-url`,
        "POST",
        {
          title,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentLength: file.size,
        },
      );
      const put = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Document upload failed. Please try again.");
      await apiSend(
        `/api/v1/tenants/${view.session.tenantId}/company-documents/${upload.id}/complete`,
        "POST",
        {},
      );
      setCompanyDocs((prev) => [
        ...prev,
        { id: upload.id, title, filename: file.name, size: file.size },
      ]);
      toast.push("Document uploaded", "success");
    } catch (err) {
      setError(humanizeForgeError(err instanceof Error ? err.message : "Document upload failed."));
    } finally {
      setDocUploading(false);
    }
  }

  async function activateCompany() {
    if (!view || !etag) return;
    setBusy(true);
    setError(null);
    setSaveState("saving");
    try {
      // Ensure review is completed first if needed.
      const review = view.steps.find((s) => s.stepKey === "REVIEW_CONFIGURATION");
      let currentEtag = etag;
      if (review && review.status !== "COMPLETED") {
        const reviewed = await onboardingCompleteStep(
          view.session.id,
          "REVIEW_CONFIGURATION",
          { acknowledged: true },
          { ifMatch: currentEtag, tenantId: view.session.tenantId },
        );
        currentEtag = reviewed.etag ?? toIfMatch(reviewed.data.session.recordVersion);
        applyView(reviewed.data, currentEtag);
      }
      const result = await onboardingActivate(view.session.id, {
        ifMatch: currentEtag,
        tenantId: view.session.tenantId,
      });
      applyView(result.data, result.etag);
      setActivatedTenantId(result.data.session.tenantId);
      setPhase("success");
      setSaveState("saved");
      toast.push("Company activated", "success");
    } catch (err) {
      setSaveState("error");
      setError(humanizeForgeError(err instanceof Error ? err.message : "Activation failed."));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "success" && activatedTenantId) {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Company activated"
          subtitle={`${displayName || "Company"} is ready to use Forge.`}
        />
        <div className="card mb-4">
          <div className="card-body">
            <Alert tone="success">
              Administrators can sign in with their invitation email. Continue setup anytime from the
              company page.
            </Alert>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Link className="btn btn-primary" href={tenantDetailHref(activatedTenantId)}>
                Open company
              </Link>
              <Link
                className="btn btn-outline-secondary"
                href={`/setup-center/?tenantId=${activatedTenantId}`}
              >
                Setup Center
              </Link>
              <Link
                className="btn btn-outline-secondary"
                href={`/imports/?tenantId=${activatedTenantId}`}
              >
                Import data
              </Link>
              <Link className="btn btn-outline-secondary" href="/onboarding/new/">
                Add another company
              </Link>
              <Link className="btn btn-outline-secondary" href="/">
                Return to dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "start") {
    return (
      <section className={styles.page}>
        <ForgePageHeader
          title="Add company"
          subtitle="Create a draft company and walk through setup. Your progress saves automatically after each step."
        />
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        <div className="card mb-4">
          <div className="card-body">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void startCompany();
              }}
            >
              <FormSection title="Company profile">
                <FormField label="Company name" htmlFor="displayName">
                  <input
                    id="displayName"
                    className="form-control"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormField>
                <FormField label="Legal name" htmlFor="legalName">
                  <input
                    id="legalName"
                    className="form-control"
                    required
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </FormField>
                <FormField label="Company type" htmlFor="customerType">
                  <select
                    id="customerType"
                    className="form-select"
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as typeof customerType)}
                  >
                    {COMPANY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </FormField>
            <FormField label="Time zone" htmlFor="timezone">
              <select
                id="timezone"
                className="form-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {US_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Web address" htmlFor="slug" hint="Used for the customer portal address. Forge fills this in for you.">
              <input
                id="slug"
                className="form-control"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(normalizeSlug(e.target.value));
                }}
              />
            </FormField>
          </FormSection>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-primary" type="submit" disabled={busy || !displayName.trim()}>
              {busy ? "Saving…" : "Start setup"}
            </button>
            <Link className="btn btn-outline-secondary" href="/onboarding/">
              Cancel
            </Link>
          </div>
            </form>
          </div>
        </div>
      </section>
    );
  }

  const stepIndex = Math.max(
    0,
    wizardSteps.findIndex((s) => s.id === activeStepKey),
  );

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title={displayName || "Company setup"}
        subtitle={`Step ${stepIndex + 1} of ${wizardSteps.length || 1} · ${progressPct}% complete`}
      />
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <StatusBadge tone={saveState === "error" ? "danger" : saveState === "saved" ? "success" : "neutral"}>
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Unable to save — Retry"
                : "Ready"}
        </StatusBadge>
        {view ? <StatusBadge tone="info">{view.session.status.replace(/_/g, " ")}</StatusBadge> : null}
      </div>
      <ForgeStepper
        steps={wizardSteps.map((s) => ({ id: s.id, label: s.label }))}
        activeIndex={stepIndex}
      />
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {activeStepKey === "CREATE_PRIMARY_ORGANIZATION" ? (
        <FormSection title="Organization">
          <p className="text-muted">This is the main organization under the company (usually the same name).</p>
          <FormField label="Organization name" htmlFor="orgDisplay">
            <input id="orgDisplay" className="form-control" value={orgDisplayName} onChange={(e) => setOrgDisplayName(e.target.value)} />
          </FormField>
          <FormField label="Legal name" htmlFor="orgLegal">
            <input id="orgLegal" className="form-control" value={orgLegalName} onChange={(e) => setOrgLegalName(e.target.value)} />
          </FormField>
          <FormField label="Short code" htmlFor="orgSlug">
            <input id="orgSlug" className="form-control" value={orgSlug} onChange={(e) => setOrgSlug(normalizeSlug(e.target.value))} />
          </FormField>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void completeCurrent({
                displayName: orgDisplayName,
                legalName: orgLegalName || orgDisplayName,
                slug: orgSlug || normalizeSlug(orgDisplayName),
                timezone,
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "SELECT_PRODUCTS" ? (
        <FormSection title="Products">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {catalogProducts.map((product) => {
              const checked = selectedProducts.includes(product.code);
              return (
                <label
                  key={product.code}
                  style={{
                    border: "1px solid var(--forge-color-border, #cbd5e0)",
                    borderRadius: "0.75rem",
                    padding: "1rem",
                    display: "block",
                    background: checked ? "rgba(49,130,206,0.08)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedProducts((prev) =>
                        prev.includes(product.code)
                          ? prev.filter((c) => c !== product.code)
                          : [...prev, product.code],
                      )
                    }
                  />{" "}
                  <strong>{product.name}</strong>
                  <p className="text-muted" style={{ margin: "0.35rem 0 0" }}>
                    {product.description}
                  </p>
                </label>
              );
            })}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || selectedProducts.length === 0}
            onClick={() => void completeCurrent({ productCodes: selectedProducts })}
            style={{ marginTop: "1rem" }}
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "SELECT_MODULES" ? (
        <FormSection title="Modules">
          <p className="text-muted">Turn modules on or off. Included package modules start enabled.</p>
          <div style={{ display: "grid", gap: "0.5rem", maxHeight: 360, overflow: "auto" }}>
            {moduleOptions.map((mod) => {
              const checked = selectedModules.includes(mod.code);
              const locked = mod.classification === "PLATFORM_CORE";
              return (
                <label key={`${mod.code}-${mod.name}`} style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={checked || locked}
                    disabled={locked}
                    onChange={() =>
                      setSelectedModules((prev) =>
                        prev.includes(mod.code)
                          ? prev.filter((c) => c !== mod.code)
                          : [...prev, mod.code],
                      )
                    }
                  />
                  <span>
                    {mod.name}
                    {locked ? " (required)" : ""}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || selectedModules.length === 0}
            onClick={() => void completeCurrent({ moduleCodes: selectedModules })}
            style={{ marginTop: "1rem" }}
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_SUBSCRIPTION" ? (
        <FormSection title="Subscription">
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={waiveSubscription}
              onChange={(e) => setWaiveSubscription(e.target.checked)}
            />
            Start without billing for now (trial / implementation)
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void completeCurrent({ waiveSubscription: true, status: "TRIAL", periodDays: 30 })}
            style={{ marginTop: "1rem" }}
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_LOCATIONS" ? (
        <FormSection title="Locations">
          {locations.map((loc, index) => (
            <div key={index} style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
              <FormField label="Location name" htmlFor={`loc-name-${index}`}>
                <input
                  id={`loc-name-${index}`}
                  className="form-control"
                  value={loc.name}
                  onChange={(e) =>
                    setLocations((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)),
                    )
                  }
                />
              </FormField>
              <FormField label="Street" htmlFor={`loc-street-${index}`}>
                <input
                  id={`loc-street-${index}`}
                  className="form-control"
                  value={loc.addressLine1}
                  onChange={(e) =>
                    setLocations((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, addressLine1: e.target.value } : row)),
                    )
                  }
                />
              </FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <FormField label="City" htmlFor={`loc-city-${index}`}>
                  <input
                    id={`loc-city-${index}`}
                    className="form-control"
                    value={loc.city}
                    onChange={(e) =>
                      setLocations((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, city: e.target.value } : row)),
                      )
                    }
                  />
                </FormField>
                <FormField label="State" htmlFor={`loc-state-${index}`}>
                  <input
                    id={`loc-state-${index}`}
                    className="form-control"
                    value={loc.stateProvince}
                    onChange={(e) =>
                      setLocations((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, stateProvince: e.target.value } : row)),
                      )
                    }
                  />
                </FormField>
                <FormField label="ZIP" htmlFor={`loc-zip-${index}`}>
                  <input
                    id={`loc-zip-${index}`}
                    className="form-control"
                    value={loc.postalCode}
                    onChange={(e) =>
                      setLocations((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, postalCode: e.target.value } : row)),
                      )
                    }
                  />
                </FormField>
              </div>
            </div>
          ))}
          <div className="d-flex flex-wrap gap-2" style={{ marginTop: "1rem" }}>
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() =>
                setLocations((prev) => [
                  ...prev,
                  {
                    name: `Location ${prev.length + 1}`,
                    facilityType: "SITE",
                    addressLine1: "",
                    city: "",
                    stateProvince: "",
                    postalCode: "",
                    timezone,
                  },
                ])
              }
            >
              + Add location
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void completeCurrent({
                  locations: locations
                    .filter((l) => l.name.trim())
                    .map((l) => ({
                      name: l.name.trim(),
                      facilityType: l.facilityType,
                      addressLine1: l.addressLine1 || undefined,
                      city: l.city || undefined,
                      stateProvince: l.stateProvince || undefined,
                      postalCode: l.postalCode || undefined,
                      timezone: l.timezone || timezone,
                      countryCode: "US",
                    })),
                })
              }
            >
              Save and continue
            </button>
          </div>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_ORG_LOOKUPS" ? (
        <FormSection title="Organization">
          <p className="text-muted">
            Add departments, positions, and employment types. You can refine these later from Setup Center.
          </p>

          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Departments</h3>
            <ul className={styles.list}>
              {departments.map((row, index) => (
                <li key={`dept-${index}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span>
                    {row.name}
                    {row.description ? ` — ${row.description}` : ""}
                    {row.active === false ? " (inactive)" : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setDepartments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
              <FormField label="Department name" htmlFor="dept-name">
                <input
                  id="dept-name"
                  className="form-control"
                  value={deptDraft.name}
                  onChange={(e) => setDeptDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Description (optional)" htmlFor="dept-desc">
                <input
                  id="dept-desc"
                  className="form-control"
                  value={deptDraft.description ?? ""}
                  onChange={(e) => setDeptDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </FormField>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={deptDraft.active !== false}
                  onChange={(e) => setDeptDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active
              </label>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  if (!deptDraft.name.trim()) return;
                  setDepartments((prev) => [
                    ...prev,
                    {
                      name: deptDraft.name.trim(),
                      ...(deptDraft.description?.trim()
                        ? { description: deptDraft.description.trim() }
                        : {}),
                      active: deptDraft.active !== false,
                    },
                  ]);
                  setDeptDraft(emptyLookup());
                }}
              >
                + Add Department
              </button>
            </div>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Positions</h3>
            <ul className={styles.list}>
              {positions.map((row, index) => (
                <li key={`pos-${index}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span>
                    {row.name}
                    {row.departmentName ? ` · ${row.departmentName}` : ""}
                    {row.description ? ` — ${row.description}` : ""}
                    {row.active === false ? " (inactive)" : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setPositions((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
              <FormField label="Position name" htmlFor="pos-name">
                <input
                  id="pos-name"
                  className="form-control"
                  value={posDraft.name}
                  onChange={(e) => setPosDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Description (optional)" htmlFor="pos-desc">
                <input
                  id="pos-desc"
                  className="form-control"
                  value={posDraft.description ?? ""}
                  onChange={(e) => setPosDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </FormField>
              <FormField label="Department (optional)" htmlFor="pos-dept">
                <select
                  id="pos-dept"
                  className="form-select"
                  value={posDraft.departmentName ?? ""}
                  onChange={(e) =>
                    setPosDraft((d) => ({ ...d, departmentName: e.target.value || undefined }))
                  }
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={posDraft.active !== false}
                  onChange={(e) => setPosDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active
              </label>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  if (!posDraft.name.trim()) return;
                  setPositions((prev) => [
                    ...prev,
                    {
                      name: posDraft.name.trim(),
                      ...(posDraft.description?.trim()
                        ? { description: posDraft.description.trim() }
                        : {}),
                      ...(posDraft.departmentName ? { departmentName: posDraft.departmentName } : {}),
                      active: posDraft.active !== false,
                    },
                  ]);
                  setPosDraft(emptyLookup());
                }}
              >
                + Add Position
              </button>
            </div>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Employment types</h3>
            <ul className={styles.list}>
              {employmentTypes.map((row, index) => (
                <li key={`emp-${index}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span>
                    {row.name}
                    {row.description ? ` — ${row.description}` : ""}
                    {row.active === false ? " (inactive)" : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEmploymentTypes((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
              <FormField label="Employment type name" htmlFor="emp-name">
                <input
                  id="emp-name"
                  className="form-control"
                  value={empDraft.name}
                  onChange={(e) => setEmpDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Description (optional)" htmlFor="emp-desc">
                <input
                  id="emp-desc"
                  className="form-control"
                  value={empDraft.description ?? ""}
                  onChange={(e) => setEmpDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </FormField>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={empDraft.active !== false}
                  onChange={(e) => setEmpDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Active
              </label>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  if (!empDraft.name.trim()) return;
                  setEmploymentTypes((prev) => [
                    ...prev,
                    {
                      name: empDraft.name.trim(),
                      ...(empDraft.description?.trim()
                        ? { description: empDraft.description.trim() }
                        : {}),
                      active: empDraft.active !== false,
                    },
                  ]);
                  setEmpDraft(emptyLookup());
                }}
              >
                + Add Employment Type
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            style={{ marginTop: "1.25rem" }}
            onClick={() =>
              void completeCurrent({
                departments: departments
                  .filter((d) => d.name.trim())
                  .map((d) => ({
                    name: d.name.trim(),
                    ...(d.description?.trim() ? { description: d.description.trim() } : {}),
                  })),
                positions: positions
                  .filter((p) => p.name.trim())
                  .map((p) => ({
                    name: p.name.trim(),
                    ...(p.description?.trim() ? { description: p.description.trim() } : {}),
                    ...(p.departmentName ? { departmentName: p.departmentName } : {}),
                  })),
                employmentTypes: employmentTypes
                  .filter((e) => e.name.trim())
                  .map((e) => ({
                    name: e.name.trim(),
                    ...(e.description?.trim() ? { description: e.description.trim() } : {}),
                  })),
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_DATA_IMPORT" ? (
        <FormSection title="Data import">
          <p className="text-muted">
            Import Personnel (XLSX/CSV) and Fleet without leaving onboarding. You can skip and finish imports later
            from Setup Center.
          </p>
          {view?.session.tenantId ? (
            <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              <ImportCenterApp
                api={importApi}
                tenantId={view.session.tenantId}
                hasPermission={hasPermission}
                embedded
                basePath="/onboarding/import"
                initialView="dashboard"
                onNavigate={() => undefined}
                {...(createLookup ? { createLookup } : {})}
                appEnv={process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local"}
              />
            </div>
          ) : null}
          <div className="d-flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void completeCurrent({ personnelImported: true, fleetImported: true })
              }
            >
              Continue — imports done
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              disabled={busy}
              onClick={() => void completeCurrent({ skipped: true })}
            >
              Skip for now
            </button>
          </div>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_DOCUMENTS" ? (
        <FormSection title="Company documents">
          <p className="text-muted">Upload PDF, Word, Excel, or image files for company policies and handbooks.</p>
          <ForgeAssetUploader
            id="company-documents"
            label="COMPANY DOCUMENTS"
            accept={COMPANY_DOC_ACCEPT}
            hint="PDF, Word, Excel, or images up to 25 MB."
            maxBytes={25_000_000}
            uploading={docUploading}
            onSelect={(file: File | null) => void uploadCompanyDocument(file)}
          />
          {companyDocs.length ? (
            <ul className={styles.list} style={{ marginTop: "1rem" }}>
              {companyDocs.map((doc) => (
                <li key={doc.id} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span>
                    <strong>{doc.title}</strong> · {doc.filename} · {formatBytes(doc.size)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setCompanyDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted" style={{ marginTop: "0.75rem" }}>
              No documents uploaded yet.
            </p>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            style={{ marginTop: "1rem" }}
            onClick={() =>
              void completeCurrent({
                documentIds: companyDocs.map((d) => d.id),
                count: companyDocs.length,
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_BRANDING" ? (
        <FormSection title="Branding">
          <ForgeAssetUploader
            id="company-logo"
            label="Company logo"
            uploading={logoUploading}
            previewUrl={logoPreview}
            fileName={logoName}
            fileSize={logoSize}
            onSelect={(file: File | null) => void uploadLogo(file)}
            onRemove={() => {
              setLogoDocumentId(null);
              setLogoPreview(null);
              setLogoName(null);
              setLogoSize(null);
            }}
          />
          <FormField label="Primary color" htmlFor="primaryColor">
            <input id="primaryColor" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </FormField>
          <FormField label="Secondary color" htmlFor="secondaryColor">
            <input id="secondaryColor" type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
          </FormField>
          <FormField label="Support email" htmlFor="supportEmail">
            <input
              id="supportEmail"
              className="form-control"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </FormField>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void completeCurrent({
                primaryColor,
                secondaryColor,
                accentColor: primaryColor,
                supportEmail: supportEmail || undefined,
                emailSenderName: displayName || orgDisplayName,
                logoDocumentId,
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CONFIGURE_BUSINESS_SETTINGS" ? (
        <FormSection title="Business settings">
          <FormField label="Time zone" htmlFor="biz-tz">
            <select
              id="biz-tz"
              className="form-select"
              value={businessSettings.timezone}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, timezone: e.target.value }))}
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date format" htmlFor="biz-date">
            <select
              id="biz-date"
              className="form-select"
              value={businessSettings.dateFormat}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, dateFormat: e.target.value }))}
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </FormField>
          <FormField label="Employee ID format" htmlFor="biz-emp-id" hint="Example: EMP-####">
            <input
              id="biz-emp-id"
              className="form-control"
              value={businessSettings.employeeIdFormat}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, employeeIdFormat: e.target.value }))}
            />
          </FormField>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
            <input
              type="checkbox"
              checked={businessSettings.emailNotifications}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, emailNotifications: e.target.checked }))}
            />
            Email notifications
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={businessSettings.mobileAccess}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, mobileAccess: e.target.checked }))}
            />
            Mobile access
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={businessSettings.employeePortal}
              onChange={(e) => setBusinessSettings((s) => ({ ...s, employeePortal: e.target.checked }))}
            />
            Employee portal
          </label>
          {industrialSelected ? (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
              <FormField label="Incident numbering prefix" htmlFor="biz-inc">
                <input
                  id="biz-inc"
                  className="form-control"
                  value={businessSettings.incidentNumbering}
                  onChange={(e) => setBusinessSettings((s) => ({ ...s, incidentNumbering: e.target.value }))}
                />
              </FormField>
              <FormField label="Inspection numbering prefix" htmlFor="biz-insp">
                <input
                  id="biz-insp"
                  className="form-control"
                  value={businessSettings.inspectionNumbering}
                  onChange={(e) => setBusinessSettings((s) => ({ ...s, inspectionNumbering: e.target.value }))}
                />
              </FormField>
              <FormField label="Fleet numbering prefix" htmlFor="biz-fleet">
                <input
                  id="biz-fleet"
                  className="form-control"
                  value={businessSettings.fleetNumbering}
                  onChange={(e) => setBusinessSettings((s) => ({ ...s, fleetNumbering: e.target.value }))}
                />
              </FormField>
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            style={{ marginTop: "1rem" }}
            onClick={() =>
              void completeCurrent({
                timezone: businessSettings.timezone,
                dateFormat: businessSettings.dateFormat,
                employeeIdFormat: businessSettings.employeeIdFormat,
                emailNotifications: businessSettings.emailNotifications,
                mobileAccess: businessSettings.mobileAccess,
                employeePortal: businessSettings.employeePortal,
                ...(industrialSelected
                  ? {
                      incidentNumbering: businessSettings.incidentNumbering,
                      inspectionNumbering: businessSettings.inspectionNumbering,
                      fleetNumbering: businessSettings.fleetNumbering,
                    }
                  : {}),
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "CREATE_PRIMARY_ADMINISTRATOR" ? (
        <FormSection title="Primary administrator">
          <FormField label="First name" htmlFor="adminFirst">
            <input id="adminFirst" className="form-control" value={adminFirst} onChange={(e) => setAdminFirst(e.target.value)} />
          </FormField>
          <FormField label="Last name" htmlFor="adminLast">
            <input id="adminLast" className="form-control" value={adminLast} onChange={(e) => setAdminLast(e.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="adminEmail">
            <input id="adminEmail" className="form-control" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </FormField>
          <FormField label="Role" htmlFor="adminRole">
            <select
              id="adminRole"
              className="form-select"
              value={adminRoleCode}
              onChange={(e) => setAdminRoleCode(e.target.value)}
            >
              {roleOptions.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </select>
          </FormField>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !adminEmail || !adminFirst || !adminLast}
            onClick={() =>
              void completeCurrent({
                email: adminEmail.trim(),
                firstName: adminFirst.trim(),
                lastName: adminLast.trim(),
                roleCode: adminRoleCode || undefined,
              })
            }
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "SEND_INVITATION" ? (
        <FormSection title="Send invitation">
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={sendInviteNow} onChange={(e) => setSendInviteNow(e.target.checked)} />
            Send invitation now
          </label>
          <p className="text-muted">
            If unchecked, Forge still creates the invitation and you can send it when the company is activated.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void completeCurrent({ send: sendInviteNow, expiresInHours: 168 })}
          >
            Save and continue
          </button>
        </FormSection>
      ) : null}

      {activeStepKey === "REVIEW_CONFIGURATION" || (!activeStepKey && view) ? (
        <FormSection title="Review & activate">
          <ul className={styles.list}>
            <li>Company information — Complete</li>
            <li>Products — {selectedProducts.map(productDisplayName).join(", ") || "Configured"}</li>
            <li>Modules — {selectedModules.length} enabled</li>
            <li>Locations — {locations.filter((l) => l.name.trim()).length} configured</li>
            <li>Departments — {departments.length} configured</li>
            <li>Employment types — {employmentTypes.length} configured</li>
            <li>Documents — {companyDocs.length} uploaded</li>
            <li>Administrator — {adminEmail || "Configured"}</li>
            <li>Logo — {logoDocumentId ? "Uploaded" : "Optional / defaults applied"}</li>
          </ul>
          <Alert tone="info">
            Activation prepares the company, turns on selected products and modules, invites the administrator, and
            creates default settings. You can import spreadsheets afterward from Data Import.
          </Alert>
          <div className="d-flex flex-wrap gap-2" style={{ marginTop: "1rem" }}>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void activateCompany()}>
              {busy ? "Activating…" : "Activate company"}
            </button>
            {view ? (
              <Link className="btn btn-outline-secondary" href={`/setup-center/?tenantId=${view.session.tenantId}`}>
                Open Setup Center
              </Link>
            ) : null}
          </div>
        </FormSection>
      ) : null}
    </section>
  );
}
