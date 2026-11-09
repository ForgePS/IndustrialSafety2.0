"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import { navLogoForTenant } from "@/lib/tenant-nav-logo";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ForgePrintButton } from "@/components/forge-print-button";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { useOrgLocationLookups } from "@/hooks/use-org-location-lookups";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { useProfileSignature } from "@/hooks/use-profile-signature";
import { SignaturePad } from "@/components/signature-pad";
import { SanitationEmailPdfDialog } from "@/components/sanitation-email-pdf-dialog";
import {
  pestDevicePrintFieldValues,
  sanitationLocationPrintFieldValues,
} from "@/lib/module-print-fields";
import { filterDepartmentsForSite } from "@/lib/personnel-assignment";
import { compressImageToDataUrl, imageCompressErrorMessage } from "@/lib/compress-image";
import {
  SANITATION_TABS,
  SANITATION_TOGGLEABLE_TABS,
  FACILITY_TYPES,
  COMPLIANCE_FRAMEWORKS,
  MSS_FREQUENCIES,
  CONCERN_TYPES,
  FINDING_SEVERITIES,
  REGULATORY_LIBRARY_STATIC,
  SPILL_STATUS_ACTIONS,
  statusBadgeClass,
  severityBadgeClass,
  defaultInspectionTitle,
  exceedsDustActionLevel,
  BUILTIN_SANITATION_TEMPLATES,
  downloadText,
  openPrintHtml,
  sanitationStatusDotColor,
  preopDisposition,
  saveSanitationDraft,
  loadSanitationDraft,
  stripResponsePhotos,
  sanitationAutosaveLabel,
  type SanitationAutosaveState,
  clearSanitationDraft,
  filterSanitationTabs,
  type SanitationTabId,
  type SanitationTemplateSection,
  type InspectionAnswer,
} from "@/lib/sanitation-module";
import { canManageSanitationSubmodules } from "@/lib/platform-admin";
import { filterModulePages } from "@/lib/module-page-permissions";

const API = "/api/v1/industrial/sanitation";

type Row = Record<string, unknown> & { id: string };

type DashboardData = {
  todayInspections?: number;
  inspectionsPassed?: number;
  inspectionsFailed?: number;
  openCriticalFindings?: number;
  overdueCorrectiveActions?: number;
  overdueCleaningTasks?: number;
  dustHousekeepingAlerts?: number;
  pestFindings?: number;
  mssCompletionPercent?: number;
  sanitationCompliancePercent?: number | null;
  recentInspections?: Row[];
  openFindings?: Row[];
  todayCleaningSchedule?: Row[];
  facilityScorecard?: Row | Record<string, unknown> | null;
  recurringFindings?: Row[];
  worstAreas?: Row[];
  correctiveActionAging?: Row[];
  multiSiteComparison?: Row[];
};

type AnalyticsData = {
  findingsByCategory?: unknown;
  findingsBySeverity?: unknown;
  severity?: unknown;
  dustTrend?: unknown;
  dustAccumulationTrend?: unknown;
  mssTrend?: unknown;
  mssCompletionTrend?: unknown;
  scoreTrend?: unknown;
  inspectionScoreTrend?: unknown;
  smartInsights?: unknown;
};

type HeatMapData = {
  locations?: Row[];
  pestDevices?: Row[];
  items?: Row[];
};

type TemplateRow = Row & {
  code?: string;
  name?: string;
  category?: string;
  description?: string | null;
  templateJson?: { sections?: SanitationTemplateSection[] } | null;
};

type ResponsePhoto = { id: string; fileName: string; contentType: string; dataUrl: string };

type ResponseEntry = {
  result: InspectionAnswer;
  notes?: string | undefined;
  photoNote?: string | undefined;
  label?: string | undefined;
  severity?: string | undefined;
  dustDepth?: string | undefined;
  dustUnit?: "INCHES" | "MM" | undefined;
  photos?: ResponsePhoto[] | undefined;
};

const MAX_QUESTION_PHOTOS = 10;

function absoluteAssetUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  if (typeof window === "undefined") return src;
  return new URL(src, window.location.origin).href;
}

function asItems<T extends Row>(data: T[] | { items?: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

/** Coerce API list payloads that sometimes arrive as objects. */
function asRowArray(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as Row[];
    // Aging buckets historically returned as { d0_7, d8_14, ... }
    if ("d0_7" in obj || "d8_14" in obj || "d15_30" in obj || "d31_60" in obj || "d60plus" in obj) {
      return [
        { id: "d0_7", label: "0-7 days", bucket: "d0_7", count: Number(obj.d0_7 ?? 0) },
        { id: "d8_14", label: "8-14 days", bucket: "d8_14", count: Number(obj.d8_14 ?? 0) },
        { id: "d15_30", label: "15-30 days", bucket: "d15_30", count: Number(obj.d15_30 ?? 0) },
        { id: "d31_60", label: "31-60 days", bucket: "d31_60", count: Number(obj.d31_60 ?? 0) },
        { id: "d60plus", label: "60+ days", bucket: "d60plus", count: Number(obj.d60plus ?? 0) },
      ];
    }
    return Object.entries(obj).map(([key, count]) => ({
      id: key,
      label: key,
      category: key,
      severity: key,
      count: Number(count ?? 0),
      value: Number(count ?? 0),
    }));
  }
  return [];
}

function fmtDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function siteQuery(siteId: string, extras?: { departmentId?: string }): Record<string, string> {
  const q: Record<string, string> = {};
  if (siteId) q.siteId = siteId;
  const departmentId = extras?.departmentId?.trim();
  if (departmentId) q.departmentId = departmentId;
  return q;
}

function sectionsFromTemplate(tpl: TemplateRow | undefined): SanitationTemplateSection[] {
  const sections = tpl?.templateJson?.sections;
  if (Array.isArray(sections) && sections.length) return sections;
  const builtin = BUILTIN_SANITATION_TEMPLATES.find((t) => t.code === tpl?.code);
  return builtin?.sections ?? [];
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: "danger" | "warning" | "success" | "primary";
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger"
      : tone === "warning"
        ? "border-warning"
        : tone === "success"
          ? "border-success"
          : tone === "primary"
            ? "border-primary"
            : "";
  return (
    <div className="col-6 col-md-3">
      <div className={`card h-100 ${toneClass}`}>
        <div className="card-body py-3">
          <div className="text-muted small mb-1">{label}</div>
          <div className="fs-4 fw-semibold mb-0">{value ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted">
        {message}
      </td>
    </tr>
  );
}

function toggleMulti(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function barRows(items: unknown, labelKeys: string[]): Array<{ label: string; value: number }> {
  const rows = asRowArray(items);
  if (!rows.length) return [];
  return rows.map((item) => {
    let label = "—";
    for (const key of labelKeys) {
      const v = item[key];
      if (v != null && String(v)) {
        label = String(v);
        break;
      }
    }
    const value = Number(
      item.count ?? item.value ?? item.percent ?? item.score ?? item.avgDepth ?? 0,
    );
    return { label, value: Number.isFinite(value) ? value : 0 };
  });
}

function insightRows(
  value: unknown,
): Array<{ id?: string; title: string; message: string; severity: string }> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, idx) => {
      if (typeof item === "string") {
        return { id: `insight-${idx}`, title: "Insight", message: item, severity: "INFO" };
      }
      const row = (item ?? {}) as Row;
      return {
        id: String(row.id ?? `insight-${idx}`),
        title: String(row.title ?? "Insight"),
        message: String(row.message ?? row.text ?? ""),
        severity: String(row.severity ?? "INFO"),
      };
    });
  }
  return [];
}

function SimpleBarList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card h-100">
      <div className="card-header">
        <h6 className="mb-0">{title}</h6>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="text-muted small mb-0">No data.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {rows.map((row) => (
              <div key={`${title}-${row.label}`}>
                <div className="d-flex justify-content-between small mb-1">
                  <span>{row.label}</span>
                  <span className="fw-semibold">{row.value}</span>
                </div>
                <div className="progress" style={{ height: 8 }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.round((row.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function softGet<T>(url: string, query?: Record<string, string>): Promise<T | null> {
  try {
    return await apiGet<T>(url, query ? { query } : undefined);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null;
    throw e;
  }
}

export function SanitationWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const { logoUrl, appShortName } = useTenantBranding();
  const activeTenant = useMemo(() => {
    if (!me) return null;
    const selectable = me.tenants?.filter((t) => t.selectable) ?? [];
    return (
      selectable.find((t) => t.tenantId === me.tenantId) ??
      me.tenants?.find((t) => t.tenantId === me.tenantId) ??
      null
    );
  }, [me]);
  const tenantLabel = activeTenant?.displayName?.trim() || appShortName || "Company";
  const formLogo = navLogoForTenant({
    slug: activeTenant?.slug,
    displayName: tenantLabel,
    brandingLogoUrl: logoUrl,
  });
  const formLogoSrc = formLogo?.src ? absoluteAssetUrl(formLogo.src) : "";
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.sanitation.view") ||
    permissions.has("industrial.sanitation.manage") ||
    permissions.has("industrial.sanitation.inspect") ||
    permissions.has("industrial.sanitation.clean") ||
    permissions.has("industrial.sanitation.verify") ||
    permissions.has("industrial.sanitation.report") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.sanitation.manage") || permissions.has("industrial.admin");
  const canInspect =
    permissions.has("industrial.sanitation.inspect") ||
    permissions.has("industrial.sanitation.manage") ||
    permissions.has("industrial.admin");
  const canClean =
    permissions.has("industrial.sanitation.clean") ||
    permissions.has("industrial.sanitation.manage") ||
    permissions.has("industrial.admin");
  const canVerify =
    permissions.has("industrial.sanitation.verify") ||
    permissions.has("industrial.sanitation.manage") ||
    permissions.has("industrial.admin");
  const canReport =
    permissions.has("industrial.sanitation.report") ||
    permissions.has("industrial.sanitation.manage") ||
    permissions.has("industrial.sanitation.view") ||
    permissions.has("industrial.access") ||
    permissions.has("industrial.admin");
  const canToggleSubmodules = canManageSanitationSubmodules(me);

  const org = useOrgLocationLookups(me?.tenantId);

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "SANITATION",
    canView,
  });
  const [tab, setTab] = useState<SanitationTabId>("dashboard");
  const [disabledTabs, setDisabledTabs] = useState<string[]>([]);
  const [submoduleBusy, setSubmoduleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [siteId, setSiteId] = useState("");
  const [divisionName, setDivisionName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departmentName, setDepartmentName] = useState("");

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [inspections, setInspections] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [mssRows, setMssRows] = useState<Row[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<Row[]>([]);
  const [dustRows, setDustRows] = useState<Row[]>([]);
  const [spills, setSpills] = useState<Row[]>([]);
  const [locations, setLocations] = useState<Row[]>([]);
  const [pestDevices, setPestDevices] = useState<Row[]>([]);
  const [pestFindings, setPestFindings] = useState<Row[]>([]);
  const [chemicals, setChemicals] = useState<Row[]>([]);
  const [findings, setFindings] = useState<Row[]>([]);
  const [concerns, setConcerns] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);

  // Start / run inspection
  const [startTemplateId, setStartTemplateId] = useState("");
  const [startLocationId] = useState("");
  const [startTitle, setStartTitle] = useState("");
  const [activeInspection, setActiveInspection] = useState<Row | null>(null);
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({});
  const [completeResult, setCompleteResult] = useState<{
    complianceStatus?: string | undefined;
    scorePercent?: number | null | undefined;
    findings?: Row[] | undefined;
  } | null>(null);

  // MSS form
  const [mssTitle, setMssTitle] = useState("");
  const [mssTask, setMssTask] = useState("");
  const [mssFrequency, setMssFrequency] = useState<string>("DAILY");
  const [mssVerification, setMssVerification] = useState(true);
  const [mssLoto, setMssLoto] = useState(false);
  const [mssDust, setMssDust] = useState(false);

  // Cleaning complete
  const [selectedCleaningId, setSelectedCleaningId] = useState("");
  const [cleaningNotes, setCleaningNotes] = useState("");
  const [cleaningChemicals, setCleaningChemicals] = useState("");
  const [cleaningBeforeNote, setCleaningBeforeNote] = useState("");
  const [cleaningAfterNote, setCleaningAfterNote] = useState("");
  const [cleaningSignature, setCleaningSignature] = useState("");
  const [cleaningLotoRecordId, setCleaningLotoRecordId] = useState("");
  const [cleaningBeforePhotos, setCleaningBeforePhotos] = useState<ResponsePhoto[]>([]);
  const [cleaningAfterPhotos, setCleaningAfterPhotos] = useState<ResponsePhoto[]>([]);

  // Dust
  const [dustLocationId, setDustLocationId] = useState("");
  const [dustSurface, setDustSurface] = useState("");
  const [dustPoint, setDustPoint] = useState("");
  const [dustDepth, setDustDepth] = useState("");
  const [dustUnit, setDustUnit] = useState<"INCHES" | "MM">("INCHES");
  const [dustPriority, setDustPriority] = useState(false);
  const [dustComments, setDustComments] = useState("");
  const [dustAlert, setDustAlert] = useState<string | null>(null);

  // Spill
  const [spillArea, setSpillArea] = useState("");
  const [spillProduct, setSpillProduct] = useState("");
  const [spillQty, setSpillQty] = useState("");
  const [spillCause, setSpillCause] = useState("");
  const [spillNotes, setSpillNotes] = useState("");
  const [spillSlip, setSpillSlip] = useState(false);
  const [spillDust, setSpillDust] = useState(false);

  // Areas / sanitation places
  const [locName, setLocName] = useState("");
  const [locPriority, setLocPriority] = useState(false);
  const [locPriorityReason, setLocPriorityReason] = useState("");

  // Pest
  const [pestDeviceType, setPestDeviceType] = useState("TRAP");
  const [pestDeviceArea, setPestDeviceArea] = useState("");
  const [pestFindingDeviceId, setPestFindingDeviceId] = useState("");
  const [pestCategory, setPestCategory] = useState("RODENT");
  const [pestEvidence, setPestEvidence] = useState("");

  // Chemicals
  const [chemName, setChemName] = useState("");
  const [chemMfr, setChemMfr] = useState("");
  const [chemUse, setChemUse] = useState("");
  const [chemFoodContact, setChemFoodContact] = useState(false);

  // Findings filter
  const [findingSeverity, setFindingSeverity] = useState("");

  // Verification
  const [verifyTaskId, setVerifyTaskId] = useState("");
  const [verifyMethod, setVerifyMethod] = useState("VISUAL");
  const [verifyResult, setVerifyResult] = useState<"PASS" | "FAIL" | "RECLEAN_REQUIRED">("PASS");
  const [verifyNotes, setVerifyNotes] = useState("");

  // Concerns
  const [concernType, setConcernType] = useState<string>(CONCERN_TYPES[0]);
  const [concernDesc, setConcernDesc] = useState("");

  // Profile
  const [profileTypes, setProfileTypes] = useState<string[]>([]);
  const [profileFrameworks, setProfileFrameworks] = useState<string[]>([]);
  const [profileDustThreshold, setProfileDustThreshold] = useState("0.125");
  const [profilePriorityHk, setProfilePriorityHk] = useState(true);
  const [profileIndepVerify, setProfileIndepVerify] = useState(true);
  const [profileCompletedReportEmail, setProfileCompletedReportEmail] = useState("");

  // Analytics / heat map / EM / compressed air / reports / regulatory / preop
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [heatMap, setHeatMap] = useState<HeatMapData | null>(null);
  const [heatMapError, setHeatMapError] = useState<string | null>(null);
  const [heatMapPopover, setHeatMapPopover] = useState<Row | null>(null);
  const [placingLocationId, setPlacingLocationId] = useState<string | null>(null);
  const [envSamples, setEnvSamples] = useState<Row[]>([]);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envSampleType, setEnvSampleType] = useState("ATP");
  const [envSamplePoint, setEnvSamplePoint] = useState("");
  const [envLocationId, setEnvLocationId] = useState("");
  const [envResult, setEnvResult] = useState("");
  const [envPassFail, setEnvPassFail] = useState("");
  const [envEditId, setEnvEditId] = useState("");
  const [compressedAir, setCompressedAir] = useState<Row[]>([]);
  const [airError, setAirError] = useState<string | null>(null);
  const [airArea, setAirArea] = useState("");
  const [airReason, setAirReason] = useState("");
  const [airEquipment, setAirEquipment] = useState(false);
  const [airIgnition, setAirIgnition] = useState(false);
  const [airOtherIgnition, setAirOtherIgnition] = useState(false);
  const [airPpe, setAirPpe] = useState(false);
  const [airBarricaded, setAirBarricaded] = useState(false);
  const [airDustCollection, setAirDustCollection] = useState(false);
  const [verifications, setVerifications] = useState<Row[]>([]);
  const [regulatoryRows, setRegulatoryRows] = useState<Row[]>([]);
  const [regulatorySearch, setRegulatorySearch] = useState("");
  const [regulatoryError, setRegulatoryError] = useState<string | null>(null);
  const [reportInspectionId, setReportInspectionId] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(true);
  const [draftRestored, setDraftRestored] = useState(false);
  // Answers autosave without photos; each photo uploads on its own (see flushAnswers / uploadPhoto).
  const [autosave, setAutosave] = useState<SanitationAutosaveState>({ state: "idle" });
  const [unsavedPhotoIds, setUnsavedPhotoIds] = useState<Set<string>>(() => new Set());
  const lastSavedAnswersRef = useRef("");
  const autosaveInFlightRef = useRef<Promise<boolean> | null>(null);
  const uploadingPhotoIdsRef = useRef<Set<string>>(new Set());
  const responsesRef = useRef(responses);
  const activeInspectionRef = useRef(activeInspection);
  const unsavedPhotoIdsRef = useRef(unsavedPhotoIds);
  const flushAllRef = useRef<() => Promise<void>>(async () => {});
  const [qrTokenPreview, setQrTokenPreview] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("GENERAL");
  const [tplSectionsJson, setTplSectionsJson] = useState(
    '[{"id":"s1","title":"Section 1","questions":[{"id":"q1","label":"Area clean and acceptable?"}]}]',
  );
  const [signatureDrawing, setSignatureDrawing] = useState("");
  const [emailPdfTarget, setEmailPdfTarget] = useState<{ id: string; label: string } | null>(null);
  const { signatureUrl: profileSignature } = useProfileSignature(canInspect);

  const siteName = org.sites.find((s) => s.id === siteId)?.label ?? "";
  const autoTitleRef = useRef("");

  const buildInspectionTitle = useCallback(
    (templateName: string) =>
      defaultInspectionTitle(templateName, {
        ...(divisionName.trim() ? { divisionName: divisionName.trim() } : {}),
        ...(departmentName.trim() ? { departmentName: departmentName.trim() } : {}),
      }),
    [divisionName, departmentName],
  );

  const activeTemplate = useMemo(() => {
    if (!activeInspection?.templateId) return undefined;
    return templates.find((t) => t.id === String(activeInspection.templateId));
  }, [activeInspection, templates]);

  const runSections = useMemo(() => sectionsFromTemplate(activeTemplate), [activeTemplate]);

  const runQuestions = useMemo(() => runSections.flatMap((s) => s.questions ?? []), [runSections]);

  const runProgress = useMemo(() => {
    if (!runQuestions.length) return 0;
    const answered = runQuestions.filter((q) => {
      const r = responses[q.id]?.result;
      return r === "PASS" || r === "FAIL" || r === "NA" || r === "YES" || r === "NO";
    }).length;
    return Math.round((answered / runQuestions.length) * 100);
  }, [runQuestions, responses]);

  const awaitingVerification = useMemo(
    () =>
      cleaningTasks.filter((t) => String(t.status ?? "").toUpperCase() === "AWAITING_VERIFICATION"),
    [cleaningTasks],
  );

  const filteredFindings = useMemo(() => {
    if (!findingSeverity) return findings;
    return findings.filter(
      (f) => String(f.severity ?? "").toUpperCase() === findingSeverity.toUpperCase(),
    );
  }, [findings, findingSeverity]);

  const preopTemplates = useMemo(
    () => templates.filter((t) => String(t.category ?? "").toUpperCase() === "PREOP"),
    [templates],
  );

  const heatMapLocations = useMemo(() => {
    const fromApi = heatMap?.locations ?? heatMap?.items ?? [];
    return fromApi.length ? fromApi : locations;
  }, [heatMap, locations]);

  const locationDepartmentOptions = useMemo(() => {
    const opts: { includeUnscoped?: boolean; divisionName?: string } = {};
    if (divisionName.trim()) opts.divisionName = divisionName.trim();
    return filterDepartmentsForSite(org.departments, siteId || undefined, opts);
  }, [org.departments, siteId, divisionName]);

  const locationsByDepartmentId = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const loc of locations) {
      const deptId = String(loc.departmentId ?? "").trim();
      if (!deptId) continue;
      const list = map.get(deptId) ?? [];
      list.push(loc);
      map.set(deptId, list);
    }
    return map;
  }, [locations]);

  const displayedSanitationLocations = useMemo(() => {
    if (!departmentId.trim()) return locations;
    return locations.filter((l) => String(l.departmentId ?? "") === departmentId);
  }, [locations, departmentId]);

  const selectedAreaDepartment = useMemo(
    () => org.departments.find((d) => d.id === departmentId) ?? null,
    [org.departments, departmentId],
  );

  const areaDepartmentInfo = selectedAreaDepartment ? (
    <div className="col-12">
      <div className="border rounded px-3 py-2 small bg-label-secondary">
        <div className="fw-medium">{selectedAreaDepartment.label || departmentName || "Area"}</div>
        {selectedAreaDepartment.divisionName || divisionName ? (
          <div className="text-muted">
            Division: {selectedAreaDepartment.divisionName || divisionName}
          </div>
        ) : null}
        {selectedAreaDepartment.contactName ? (
          <div className="text-muted">Contact: {selectedAreaDepartment.contactName}</div>
        ) : null}
        {selectedAreaDepartment.contactEmail ? (
          <div className="text-muted">{selectedAreaDepartment.contactEmail}</div>
        ) : null}
      </div>
    </div>
  ) : null;

  const heatMapPests = useMemo(() => {
    const fromApi = heatMap?.pestDevices ?? [];
    return fromApi.length ? fromApi : pestDevices;
  }, [heatMap, pestDevices]);

  const locationsMissingCoords = useMemo(
    () =>
      heatMapLocations.filter(
        (l) =>
          l.mapX == null ||
          l.mapY == null ||
          !Number.isFinite(Number(l.mapX)) ||
          !Number.isFinite(Number(l.mapY)),
      ),
    [heatMapLocations],
  );

  const regulatoryCombined = useMemo(() => {
    const fromApi = regulatoryRows.map((r) => ({
      code: String(r.code ?? r.id ?? ""),
      citation: String(r.citation ?? r.reference ?? r.code ?? ""),
      title: String(r.title ?? r.name ?? ""),
      topic: String(r.topic ?? r.summary ?? r.description ?? ""),
    }));
    const staticRows = REGULATORY_LIBRARY_STATIC.map((r) => ({
      code: r.code,
      citation: r.citation,
      title: r.title,
      topic: r.topic,
    }));
    const seen = new Set<string>();
    const merged = [...fromApi, ...staticRows].filter((row) => {
      const key = row.code || row.citation;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const q = regulatorySearch.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((row) =>
      [row.code, row.citation, row.title, row.topic].join(" ").toLowerCase().includes(q),
    );
  }, [regulatoryRows, regulatorySearch]);

  const selectedCleaning = useMemo(
    () => cleaningTasks.find((t) => t.id === selectedCleaningId),
    [cleaningTasks, selectedCleaningId],
  );

  const loadDashboard = useCallback(async () => {
    const data = await apiGet<DashboardData>(`${API}/dashboard`, {
      query: siteQuery(siteId),
    });
    setDashboard(data);
  }, [siteId]);

  const loadInspections = useCallback(async () => {
    const extras = departmentId.trim() ? { departmentId: departmentId.trim() } : undefined;
    const data = await apiGet<{ items?: Row[] }>(`${API}/inspections`, {
      query: {
        ...siteQuery(siteId, extras),
        page: "1",
        pageSize: "100",
      },
    });
    setInspections(asItems(data));
  }, [siteId, departmentId]);

  const loadTemplates = useCallback(async () => {
    const data = await apiGet<{ items?: TemplateRow[] } | TemplateRow[]>(`${API}/templates`);
    const items = asItems(data as { items?: TemplateRow[] });
    setTemplates(items);
    setStartTemplateId((cur) => {
      if (cur && items.some((t) => t.id === cur)) return cur;
      const daily = items.find((t) => String(t.code ?? "") === "SAN-DAILY");
      return daily?.id ?? items[0]?.id ?? "";
    });
  }, []);

  const loadMss = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/mss`, {
      query: siteQuery(siteId),
    });
    setMssRows(asItems(data));
  }, [siteId]);

  const loadCleaning = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/cleaning-tasks`, {
      query: siteQuery(siteId),
    });
    setCleaningTasks(asItems(data));
  }, [siteId]);

  const loadDust = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/dust-measurements`, {
      query: siteQuery(siteId),
    });
    setDustRows(asItems(data));
  }, [siteId]);

  const loadSpills = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/spills`, {
      query: siteQuery(siteId),
    });
    setSpills(asItems(data));
  }, [siteId]);

  const loadZonesAndLocations = useCallback(async () => {
    const loc = await apiGet<{ items?: Row[] }>(`${API}/locations`, {
      query: siteQuery(siteId),
    });
    setLocations(asItems(loc));
  }, [siteId]);

  const loadPest = useCallback(async () => {
    const q = siteQuery(siteId);
    const [devices, findingsData] = await Promise.all([
      apiGet<{ items?: Row[] }>(`${API}/pest-devices`, { query: q }),
      apiGet<{ items?: Row[] }>(`${API}/pest-findings`, { query: q }),
    ]);
    setPestDevices(asItems(devices));
    setPestFindings(asItems(findingsData));
  }, [siteId]);

  const loadChemicals = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/chemicals`, {
      query: siteQuery(siteId),
    });
    setChemicals(asItems(data));
  }, [siteId]);

  const loadFindings = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/findings`, {
      query: {
        ...siteQuery(siteId),
        ...(findingSeverity ? { severity: findingSeverity } : {}),
      },
    });
    setFindings(asItems(data));
  }, [siteId, findingSeverity]);

  const loadConcerns = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/concerns`, {
      query: siteQuery(siteId),
    });
    setConcerns(asItems(data));
  }, [siteId]);

  const loadProfiles = useCallback(async () => {
    const data = await apiGet<{ items?: Row[] }>(`${API}/profiles`, {
      query: siteQuery(siteId),
    });
    const items = asItems(data);
    setProfiles(items);
    const match = siteId ? items.find((p) => p.siteId === siteId) : items[0];
    if (match) {
      setProfileTypes(Array.isArray(match.facilityTypes) ? (match.facilityTypes as string[]) : []);
      setProfileFrameworks(
        Array.isArray(match.complianceFrameworks) ? (match.complianceFrameworks as string[]) : [],
      );
      setProfileDustThreshold(String(match.dustActionThresholdInches ?? "0.125"));
      setProfilePriorityHk(Boolean(match.priorityHousekeepingEnabled));
      setProfileIndepVerify(Boolean(match.independentVerificationRequired ?? true));
      const settings =
        match.settings && typeof match.settings === "object" && !Array.isArray(match.settings)
          ? (match.settings as Record<string, unknown>)
          : {};
      setProfileCompletedReportEmail(
        String(settings.completedReportEmail ?? settings.completedReportsTo ?? "").trim(),
      );
    } else {
      setProfileCompletedReportEmail("");
    }
  }, [siteId]);

  const loadUiSettings = useCallback(async () => {
    const data = await softGet<{ disabledTabs?: string[] }>(`${API}/ui-settings`);
    setDisabledTabs(
      Array.isArray(data?.disabledTabs)
        ? data.disabledTabs.filter((id): id is string => typeof id === "string")
        : [],
    );
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsError(null);
    const data = await softGet<AnalyticsData>(`${API}/analytics`, siteQuery(siteId));
    if (!data) {
      setAnalytics(null);
      setAnalyticsError("Analytics endpoint is not available yet.");
      return;
    }
    setAnalytics(data);
  }, [siteId]);

  const loadHeatMap = useCallback(async () => {
    setHeatMapError(null);
    const data = await softGet<HeatMapData>(`${API}/heat-map`, siteQuery(siteId));
    if (!data) {
      setHeatMap(null);
      setHeatMapError("Heat map endpoint is not available yet — showing locations table.");
      return;
    }
    setHeatMap(data);
  }, [siteId]);

  const loadEnvSamples = useCallback(async () => {
    setEnvError(null);
    try {
      const data = await apiGet<{ items?: Row[] }>(`${API}/environmental-samples`, {
        query: siteQuery(siteId),
      });
      setEnvSamples(asItems(data));
    } catch (e) {
      setEnvSamples([]);
      setEnvError(e instanceof ApiError ? e.message : "Failed to load environmental samples");
    }
  }, [siteId]);

  const loadCompressedAir = useCallback(async () => {
    setAirError(null);
    try {
      const data = await apiGet<{ items?: Row[] }>(`${API}/compressed-air-requests`, {
        query: siteQuery(siteId),
      });
      setCompressedAir(asItems(data));
    } catch (e) {
      setCompressedAir([]);
      setAirError(e instanceof ApiError ? e.message : "Failed to load compressed-air requests");
    }
  }, [siteId]);

  const loadVerifications = useCallback(async () => {
    const data = await softGet<{ items?: Row[] } | Row[]>(
      `${API}/verifications`,
      siteQuery(siteId),
    );
    setVerifications(data ? asItems(data as { items?: Row[] }) : []);
  }, [siteId]);

  const loadRegulatory = useCallback(async () => {
    setRegulatoryError(null);
    const data = await softGet<{ items?: Row[] } | Row[]>(`${API}/regulatory-library`);
    if (!data) {
      setRegulatoryRows([]);
      setRegulatoryError("Live regulatory library unavailable — showing static references.");
      return;
    }
    setRegulatoryRows(asItems(data as { items?: Row[] }));
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadInspections(),
      loadTemplates(),
      loadMss(),
      loadCleaning(),
      loadDust(),
      loadSpills(),
      loadZonesAndLocations(),
      loadPest(),
      loadChemicals(),
      loadFindings(),
      loadConcerns(),
      loadProfiles(),
      loadUiSettings(),
      loadAnalytics().catch(() => undefined),
      loadHeatMap().catch(() => undefined),
      loadEnvSamples().catch(() => undefined),
      loadCompressedAir().catch(() => undefined),
      loadVerifications().catch(() => undefined),
      loadRegulatory().catch(() => undefined),
    ]);
  }, [
    loadDashboard,
    loadInspections,
    loadTemplates,
    loadMss,
    loadCleaning,
    loadDust,
    loadSpills,
    loadZonesAndLocations,
    loadPest,
    loadChemicals,
    loadFindings,
    loadConcerns,
    loadProfiles,
    loadUiSettings,
    loadAnalytics,
    loadHeatMap,
    loadEnvSamples,
    loadCompressedAir,
    loadVerifications,
    loadRegulatory,
  ]);

  useEffect(() => {
    if (!awsReady) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await refreshAll();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load sanitation data");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, refreshAll]);

  useEffect(() => {
    if (!startTemplateId) return;
    const tpl = templates.find((t) => t.id === startTemplateId);
    if (!tpl?.name) return;
    const next = buildInspectionTitle(tpl.name);
    setStartTitle((cur) => {
      if (!cur.trim() || cur === autoTitleRef.current) {
        autoTitleRef.current = next;
        return next;
      }
      return cur;
    });
  }, [startTemplateId, templates, buildInspectionTitle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    responsesRef.current = responses;
    activeInspectionRef.current = activeInspection;
    unsavedPhotoIdsRef.current = unsavedPhotoIds;
  });

  // Keep a photo-free draft on the device and autosave answers shortly after each change.
  useEffect(() => {
    if (!activeInspection?.id) return;
    if (String(activeInspection.status ?? "").toUpperCase() === "COMPLETED") return;
    saveSanitationDraft(activeInspection.id, stripResponsePhotos(responses));
    const timer = window.setTimeout(() => void flushAllRef.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [activeInspection, responses]);

  // Retry after a failed save, and as soon as the device is back online.
  useEffect(() => {
    if (!isOnline) return;
    if (autosave.state !== "error" && autosave.state !== "offline") return;
    const timer = window.setTimeout(
      () => void flushAllRef.current(),
      autosave.state === "error" ? 15_000 : 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [isOnline, autosave]);

  const visibleTabs = useMemo(() => {
    const tenantVisible = filterSanitationTabs(disabledTabs);
    return filterModulePages({
      tabs: tenantVisible,
      moduleCode: "SANITATION",
      permissions: me?.permissions ?? [],
    });
  }, [disabledTabs, me?.permissions]);

  useEffect(() => {
    if (visibleTabs.some((t) => t.id === tab)) return;
    const fallback = visibleTabs[0]?.id ?? "settings";
    setTab(fallback);
  }, [visibleTabs, tab]);

  async function toggleSubmodule(tabId: SanitationTabId, enabled: boolean) {
    if (!canToggleSubmodules || submoduleBusy || tabId === "settings") return;
    const nextDisabled = enabled
      ? disabledTabs.filter((id) => id !== tabId)
      : [...new Set([...disabledTabs, tabId])];
    setSubmoduleBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiSend<{ disabledTabs?: string[] }>(`${API}/ui-settings`, "PATCH", {
        disabledTabs: nextDisabled,
      });
      setDisabledTabs(
        Array.isArray(updated.disabledTabs)
          ? updated.disabledTabs.filter((id): id is string => typeof id === "string")
          : nextDisabled,
      );
      setSuccess(
        enabled
          ? `${SANITATION_TABS.find((t) => t.id === tabId)?.label ?? tabId} is now on.`
          : `${SANITATION_TABS.find((t) => t.id === tabId)?.label ?? tabId} is now off.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update sub-modules.");
    } finally {
      setSubmoduleBusy(false);
    }
  }

  async function withBusy(fn: () => Promise<void>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      if (okMessage) setSuccess(okMessage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function openInspection(id: string) {
    await withBusy(async () => {
      const row = await apiGet<Row>(`${API}/inspections/${encodeURIComponent(id)}`);
      setActiveInspection(row);
      const raw = (row.responsesJson ?? {}) as Record<string, unknown>;
      const next: Record<string, ResponseEntry> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          const obj = val as Record<string, unknown>;
          const entry: ResponseEntry = {
            result: String(obj.result ?? obj.answer ?? "") as InspectionAnswer,
          };
          if (obj.notes != null) entry.notes = String(obj.notes);
          if (obj.photoNote != null) entry.photoNote = String(obj.photoNote);
          if (obj.label != null) entry.label = String(obj.label);
          if (obj.severity != null) entry.severity = String(obj.severity);
          if (obj.dustDepth != null) entry.dustDepth = String(obj.dustDepth);
          if (obj.dustUnit === "MM" || obj.dustUnit === "INCHES") entry.dustUnit = obj.dustUnit;
          if (Array.isArray(obj.photos)) {
            entry.photos = obj.photos
              .map((p) => {
                if (!p || typeof p !== "object") return null;
                const photo = p as Record<string, unknown>;
                const dataUrl = String(photo.dataUrl ?? "");
                if (!dataUrl.startsWith("data:")) return null;
                return {
                  id: String(photo.id ?? crypto.randomUUID()),
                  fileName: String(photo.fileName ?? "photo.jpg"),
                  contentType: String(photo.contentType ?? "image/jpeg"),
                  dataUrl,
                } satisfies ResponsePhoto;
              })
              .filter((p): p is ResponsePhoto => Boolean(p));
          }
          next[key] = entry;
        } else {
          next[key] = { result: String(val ?? "") as InspectionAnswer };
        }
      }
      lastSavedAnswersRef.current = JSON.stringify(stripResponsePhotos(next));
      setAutosave({ state: "idle" });
      const serverPhotoIds = new Set(
        Object.values(next).flatMap((entry) => (entry.photos ?? []).map((p) => p.id)),
      );
      const draft = loadSanitationDraft(id);
      const draftIsNewer =
        Boolean(draft?.savedAt) &&
        Boolean(row.updatedAt) &&
        Date.parse(String(draft?.savedAt)) > Date.parse(String(row.updatedAt));
      let restored = false;
      if (
        draft?.responses &&
        typeof window !== "undefined" &&
        (!navigator.onLine || draftIsNewer || Object.keys(next).length === 0)
      ) {
        // Device drafts carry answers only, so merging keeps the server's photos.
        for (const [key, val] of Object.entries(draft.responses)) {
          if (val && typeof val === "object") {
            next[key] = { ...next[key], ...(val as ResponseEntry) };
          }
        }
        restored = JSON.stringify(stripResponsePhotos(next)) !== lastSavedAnswersRef.current;
      }
      setDraftRestored(restored);
      // Drafts saved before photos uploaded separately may hold photos the server never got.
      setUnsavedPhotoIds(
        new Set(
          Object.values(next)
            .flatMap((entry) => (entry.photos ?? []).map((p) => p.id))
            .filter((photoId) => !serverPhotoIds.has(photoId)),
        ),
      );
      setResponses(next);
      setCompleteResult(null);
      setSignatureName("");
      setSignatureDrawing("");
      setExpandedQuestionIds({});
      setTab("run");
    });
  }

  async function deleteInspection(id: string, title?: string) {
    if (!canInspect) return;
    const inspectionId = String(id ?? "").trim();
    if (!inspectionId) {
      setError("Missing inspection id");
      return;
    }
    const label = title?.trim() || "this inspection";
    if (
      !window.confirm(
        `Delete ${label}?\n\nOnly incomplete inspections can be deleted. This cannot be undone.`,
      )
    ) {
      return;
    }
    await withBusy(async () => {
      await apiSend(`${API}/inspections/${encodeURIComponent(inspectionId)}/delete`, "POST", {});
      clearSanitationDraft(inspectionId);
      if (String(activeInspection?.id ?? "") === inspectionId) {
        setActiveInspection(null);
        setResponses({});
        setCompleteResult(null);
        setTab("inspections");
      }
      await Promise.all([loadInspections(), loadDashboard()]);
    }, "Inspection deleted");
  }

  async function ensureBuiltinTemplates() {
    if (!canManage) return;
    await withBusy(async () => {
      await apiSend(`${API}/templates/ensure-builtin`, "POST", {});
      await loadTemplates();
    }, "Builtin templates ensured");
  }

  async function startInspection(ev: FormEvent, opts?: { inspectionType?: string }) {
    ev.preventDefault();
    if (!canInspect) return;
    if (!siteId) {
      setError("Select a site before starting an inspection");
      return;
    }
    if (!startTemplateId) {
      setError("Select a template");
      return;
    }
    await withBusy(async () => {
      const tpl = templates.find((t) => t.id === startTemplateId);
      const inspectionType =
        opts?.inspectionType ??
        (String(tpl?.category ?? "").toUpperCase() === "PREOP" ? "PREOP" : undefined);
      const created = await apiSend<Row>(`${API}/inspections`, "POST", {
        siteId,
        templateId: startTemplateId,
        locationId: startLocationId || null,
        departmentId: departmentId || null,
        title: startTitle.trim() || undefined,
        ...(inspectionType ? { inspectionType } : {}),
      });
      await loadInspections();
      setActiveInspection(created);
      setResponses({});
      lastSavedAnswersRef.current = "{}";
      setUnsavedPhotoIds(new Set());
      setAutosave({ state: "idle" });
      setCompleteResult(null);
      setDraftRestored(false);
      setSignatureName("");
      setSignatureDrawing("");
      setExpandedQuestionIds({});
      clearSanitationDraft(created.id);
      setTab("run");
    });
  }

  function setQuestionResult(
    questionId: string,
    result: InspectionAnswer,
    label?: string,
    severity?: string,
  ) {
    setResponses((prev) => {
      const prevEntry = prev[questionId];
      const next: ResponseEntry = {
        result,
        ...(prevEntry?.notes != null ? { notes: prevEntry.notes } : {}),
        ...(prevEntry?.photoNote != null ? { photoNote: prevEntry.photoNote } : {}),
        ...(prevEntry?.dustDepth != null ? { dustDepth: prevEntry.dustDepth } : {}),
        ...(prevEntry?.dustUnit != null ? { dustUnit: prevEntry.dustUnit } : {}),
        ...(prevEntry?.photos != null ? { photos: prevEntry.photos } : {}),
        ...((label ?? prevEntry?.label) != null ? { label: label ?? prevEntry?.label } : {}),
        ...((severity ?? prevEntry?.severity) != null
          ? { severity: severity ?? prevEntry?.severity }
          : {}),
      };
      return { ...prev, [questionId]: next };
    });
    const isNo = result === "FAIL" || result === "NO";
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [questionId]: isNo ? true : Boolean(prev[questionId]),
    }));
  }

  function toggleQuestionExpanded(questionId: string) {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  function patchQuestion(questionId: string, patch: Partial<ResponseEntry>) {
    setResponses((prev) => ({
      ...prev,
      [questionId]: {
        result: prev[questionId]?.result ?? "",
        ...prev[questionId],
        ...patch,
      },
    }));
  }

  function setQuestionNotes(questionId: string, notes: string) {
    patchQuestion(questionId, { notes });
  }

  function setQuestionPhotoNote(questionId: string, photoNote: string) {
    patchQuestion(questionId, { photoNote });
  }

  function rapidPassAll() {
    setResponses((prev) => {
      const next = { ...prev };
      for (const q of runQuestions) {
        const existing = next[q.id];
        if (
          existing?.result === "PASS" ||
          existing?.result === "FAIL" ||
          existing?.result === "NA" ||
          existing?.result === "YES" ||
          existing?.result === "NO"
        ) {
          continue;
        }
        next[q.id] = {
          ...existing,
          result: "PASS",
          label: q.label,
          severity: q.riskLevel,
        };
      }
      return next;
    });
  }

  async function addQuestionPhotos(questionId: string, files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    try {
      const added: ResponsePhoto[] = [];
      for (const file of list) {
        const dataUrl = await compressImageToDataUrl(file, 900_000);
        added.push({
          id: crypto.randomUUID(),
          fileName: file.name || "photo.jpg",
          contentType: "image/jpeg",
          dataUrl,
        });
      }
      const room = MAX_QUESTION_PHOTOS - (responsesRef.current[questionId]?.photos?.length ?? 0);
      const accepted = added.slice(0, Math.max(0, room));
      if (accepted.length === 0) return;
      setResponses((prev) => {
        const existing = prev[questionId];
        const photos = [...(existing?.photos ?? []), ...accepted].slice(0, MAX_QUESTION_PHOTOS);
        return {
          ...prev,
          [questionId]: {
            result: existing?.result ?? "",
            ...existing,
            photos,
          },
        };
      });
      setUnsavedPhotoIds((prev) => new Set([...prev, ...accepted.map((p) => p.id)]));
      const inspectionId = String(activeInspection?.id ?? "");
      if (!inspectionId || !navigator.onLine) return;
      let failed = 0;
      for (const photo of accepted) {
        if (!(await uploadPhoto(inspectionId, questionId, photo))) failed += 1;
      }
      if (failed > 0) {
        setError(
          `${failed} photo${failed === 1 ? "" : "s"} didn't upload yet. ` +
            "They stay on this screen and retry automatically.",
        );
      }
    } catch (e) {
      setError(imageCompressErrorMessage(e, "Could not compress photo"));
    }
  }

  /** Upload one photo; the server adds it to the question's answer. */
  async function uploadPhoto(
    inspectionId: string,
    questionId: string,
    photo: ResponsePhoto,
  ): Promise<boolean> {
    if (uploadingPhotoIdsRef.current.has(photo.id)) return true;
    uploadingPhotoIdsRef.current.add(photo.id);
    const entry = responsesRef.current[questionId];
    try {
      await apiSend(`${API}/inspections/${encodeURIComponent(inspectionId)}/photos`, "POST", {
        questionKey: questionId,
        photo,
        ...(entry?.label ? { label: entry.label } : {}),
        ...(entry?.severity ? { severity: entry.severity } : {}),
      });
      setUnsavedPhotoIds((prev) => {
        if (!prev.has(photo.id)) return prev;
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
      return true;
    } catch {
      return false;
    } finally {
      uploadingPhotoIdsRef.current.delete(photo.id);
    }
  }

  /** Retry photos that haven't uploaded. Returns how many are still waiting. */
  async function flushPhotos(): Promise<number> {
    const inspection = activeInspectionRef.current;
    const pending = unsavedPhotoIdsRef.current;
    if (!inspection?.id || pending.size === 0) return 0;
    if (!navigator.onLine) return pending.size;
    let remaining = 0;
    for (const [questionId, entry] of Object.entries(responsesRef.current)) {
      for (const photo of entry.photos ?? []) {
        if (!pending.has(photo.id) || uploadingPhotoIdsRef.current.has(photo.id)) continue;
        if (!(await uploadPhoto(String(inspection.id), questionId, photo))) remaining += 1;
      }
    }
    return remaining;
  }

  /** Save answers (without photos) if they changed since the last save. */
  async function flushAnswers(): Promise<boolean> {
    if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
    const inspection = activeInspectionRef.current;
    if (!inspection?.id || !canInspect) return true;
    if (String(inspection.status ?? "").toUpperCase() === "COMPLETED") return true;
    const answers = stripResponsePhotos(responsesRef.current);
    const json = JSON.stringify(answers);
    if (json === lastSavedAnswersRef.current) return true;
    if (!navigator.onLine) {
      setAutosave({ state: "offline" });
      return false;
    }
    const run = (async () => {
      setAutosave({ state: "saving" });
      try {
        await apiSend(
          `${API}/inspections/${encodeURIComponent(String(inspection.id))}/responses`,
          "POST",
          { responsesJson: answers, merge: true },
        );
        lastSavedAnswersRef.current = json;
        setAutosave({ state: "saved", at: new Date().toISOString() });
        return true;
      } catch {
        setAutosave({ state: "error" });
        return false;
      }
    })();
    autosaveInFlightRef.current = run;
    try {
      return await run;
    } finally {
      autosaveInFlightRef.current = null;
    }
  }

  async function flushAll() {
    const answersSaved = await flushAnswers();
    const photosLeft = await flushPhotos();
    if (photosLeft > 0) {
      setAutosave({ state: navigator.onLine ? "error" : "offline" });
    } else if (answersSaved) {
      setAutosave((prev) =>
        prev.state === "error" || prev.state === "offline"
          ? { state: "saved", at: new Date().toISOString() }
          : prev,
      );
    }
  }
  useEffect(() => {
    flushAllRef.current = flushAll;
  });

  function removeQuestionPhoto(questionId: string, photoId: string) {
    const uploaded = !unsavedPhotoIdsRef.current.has(photoId);
    const inspectionId = String(activeInspection?.id ?? "");
    setUnsavedPhotoIds((prev) => {
      if (!prev.has(photoId)) return prev;
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
    if (uploaded && inspectionId) {
      void apiSend(
        `${API}/inspections/${encodeURIComponent(inspectionId)}/photos/${encodeURIComponent(photoId)}/delete`,
        "POST",
        { questionKey: questionId },
      ).catch(() => setError("Couldn't remove that photo from the saved inspection. Try again."));
    }
    setResponses((prev) => {
      const existing = prev[questionId];
      if (!existing) return prev;
      return {
        ...prev,
        [questionId]: {
          ...existing,
          photos: (existing.photos ?? []).filter((p) => p.id !== photoId),
        },
      };
    });
  }

  async function postDustFromQuestion(questionId: string) {
    if (!activeInspection || !canInspect) return;
    const entry = responses[questionId];
    const depth = Number(entry?.dustDepth);
    if (!Number.isFinite(depth) || depth < 0) {
      setError("Enter a dust depth before recording the measurement");
      return;
    }
    await withBusy(async () => {
      await apiSend(`${API}/dust-measurements`, "POST", {
        siteId: siteId || activeInspection.siteId || null,
        locationId: activeInspection.locationId || null,
        inspectionId: activeInspection.id,
        questionKey: questionId,
        dustDepth: depth,
        unit: entry?.dustUnit ?? "INCHES",
        comments: entry?.notes ?? null,
      });
      await loadDust();
    }, "Dust measurement recorded from checklist");
  }

  function signatureDataUrl(): string | null {
    if (signatureDrawing.trim()) return signatureDrawing;
    if (signatureName.trim()) return `typed:${signatureName.trim()}`;
    return null;
  }

  async function saveResponses() {
    if (!activeInspection || !canInspect) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      saveSanitationDraft(activeInspection.id, stripResponsePhotos(responses));
      const photosLeft = await flushPhotos();
      const saved = await flushAnswers();
      if (saved && photosLeft === 0) {
        setSuccess("Responses saved");
      } else if (!navigator.onLine) {
        setSuccess("Saved on this device. It uploads when you're back online.");
      } else if (photosLeft > 0) {
        setError(
          `${photosLeft} photo${photosLeft === 1 ? "" : "s"} didn't upload. Check your connection and tap Save again.`,
        );
      } else {
        setError("Couldn't save responses. Check your connection and tap Save again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function completeInspection() {
    if (!activeInspection || !canInspect) return;
    const missingNotes = runQuestions.filter((q) => {
      const entry = responses[q.id];
      const result = String(entry?.result ?? "").toUpperCase();
      if (result !== "FAIL" && result !== "NO") return false;
      return !String(entry?.notes ?? "").trim();
    });
    if (missingNotes.length) {
      setExpandedQuestionIds((prev) => {
        const next = { ...prev };
        for (const q of missingNotes) next[q.id] = true;
        return next;
      });
      setError(
        `Notes are required for No answers (${missingNotes.length} missing). Expand each No item and add notes.`,
      );
      return;
    }
    const sig = signatureDataUrl();
    if (!sig) {
      setError("Add an inspector signature (typed name or drawing) before completing.");
      return;
    }
    setBusy(true);
    setError(null);
    const photosLeft = await flushPhotos();
    await flushAnswers();
    setBusy(false);
    if (photosLeft > 0) {
      setError(
        `${photosLeft} photo${photosLeft === 1 ? "" : "s"} haven't uploaded yet. ` +
          "Your answers are saved. Check your connection and tap Complete again.",
      );
      return;
    }
    await withBusy(async () => {
      const signaturesJson = [
        {
          type: "INSPECTOR",
          signedAt: new Date().toISOString(),
          value: sig,
          name: signatureName.trim() || null,
        },
      ];
      const result = await apiSend<Row & { findings?: Row[] }>(
        `${API}/inspections/${encodeURIComponent(activeInspection.id)}/complete`,
        "POST",
        // Photos are already on the server; merge keeps them.
        { responsesJson: stripResponsePhotos(responses), signaturesJson, merge: true },
      );
      setActiveInspection(result);
      setCompleteResult({
        complianceStatus: String(result.complianceStatus ?? ""),
        scorePercent: result.scorePercent as number | null | undefined,
        findings: result.findings ?? [],
      });
      clearSanitationDraft(activeInspection.id);
      await Promise.all([loadInspections(), loadFindings(), loadDashboard()]);
    }, "Inspection completed");
  }

  async function createMss(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    await withBusy(async () => {
      await apiSend(`${API}/mss`, "POST", {
        title: mssTitle.trim(),
        cleaningTask: mssTask.trim() || mssTitle.trim(),
        frequency: mssFrequency,
        siteId: siteId || null,
        verificationRequired: mssVerification,
        lotoRequired: mssLoto,
        dustHazard: mssDust,
      });
      setMssTitle("");
      setMssTask("");
      await loadMss();
    }, "MSS entry created");
  }

  async function generateMssTasks() {
    if (!canManage) return;
    await withBusy(async () => {
      const result = await apiSend<{ created?: unknown[]; count?: number }>(
        `${API}/mss/generate-tasks`,
        "POST",
        {},
      );
      await Promise.all([loadCleaning(), loadMss(), loadDashboard()]);
      const n = Array.isArray(result?.created) ? result.created.length : Number(result?.count ?? 0);
      setSuccess(`Generated ${n} cleaning task(s)`);
    });
  }

  async function completeCleaningTask(ev: FormEvent) {
    ev.preventDefault();
    if (!canClean || !selectedCleaningId) return;
    await withBusy(async () => {
      const chemicals = cleaningChemicals
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await apiSend(
        `${API}/cleaning-tasks/${encodeURIComponent(selectedCleaningId)}/complete`,
        "POST",
        {
          notes: cleaningNotes.trim() || null,
          chemicalsUsed: chemicals,
          beforePhotosJson: [
            ...(cleaningBeforeNote.trim()
              ? [{ note: cleaningBeforeNote.trim(), kind: "NOTE" }]
              : []),
            ...cleaningBeforePhotos,
          ],
          afterPhotosJson: [
            ...(cleaningAfterNote.trim() ? [{ note: cleaningAfterNote.trim(), kind: "NOTE" }] : []),
            ...cleaningAfterPhotos,
          ],
          cleanerSignatureJson: cleaningSignature.trim()
            ? { typedName: cleaningSignature.trim(), signedAt: new Date().toISOString() }
            : null,
          lotoRecordId: cleaningLotoRecordId.trim() || null,
        },
      );
      setCleaningNotes("");
      setCleaningChemicals("");
      setCleaningBeforeNote("");
      setCleaningAfterNote("");
      setCleaningSignature("");
      setCleaningLotoRecordId("");
      setCleaningBeforePhotos([]);
      setCleaningAfterPhotos([]);
      setSelectedCleaningId("");
      await Promise.all([loadCleaning(), loadDashboard()]);
    }, "Cleaning task completed");
  }

  async function updateSpillStatus(id: string, status: string) {
    await withBusy(async () => {
      await apiSend(`${API}/spills/${encodeURIComponent(id)}/status`, "PATCH", { status });
      await loadSpills();
    }, `Spill marked ${status}`);
  }

  async function placeLocationOnMap(ev: ReactMouseEvent<HTMLDivElement>) {
    if (!placingLocationId || !canManage) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mapX = Math.round(((ev.clientX - rect.left) / rect.width) * 1000) / 10;
    const mapY = Math.round(((ev.clientY - rect.top) / rect.height) * 1000) / 10;
    await withBusy(async () => {
      await apiSend(`${API}/locations/${encodeURIComponent(placingLocationId)}`, "PATCH", {
        mapX,
        mapY,
      });
      setPlacingLocationId(null);
      await Promise.all([loadZonesAndLocations(), loadHeatMap()]);
    }, "Map position saved");
  }

  async function generateLocationQr(id: string) {
    await withBusy(async () => {
      try {
        const result = await apiSend<Row>(
          `${API}/locations/${encodeURIComponent(id)}/qr`,
          "POST",
          {},
        );
        setQrTokenPreview(String(result.qrToken ?? result.token ?? JSON.stringify(result)));
        await loadZonesAndLocations();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Location QR endpoint is not available yet.");
        }
        throw e;
      }
    }, "QR generated");
  }

  async function generatePestQr(id: string) {
    await withBusy(async () => {
      try {
        const result = await apiSend<Row>(
          `${API}/pest-devices/${encodeURIComponent(id)}/qr`,
          "POST",
          {},
        );
        setQrTokenPreview(String(result.qrToken ?? result.token ?? JSON.stringify(result)));
        await loadPest();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Pest device QR endpoint is not available yet.");
        }
        throw e;
      }
    }, "Device QR generated");
  }

  async function updatePestStatus(id: string, status: string) {
    await withBusy(async () => {
      await apiSend(`${API}/pest-devices/${encodeURIComponent(id)}`, "PATCH", { status });
      await loadPest();
    }, "Pest device updated");
  }

  async function createEnvSample(ev: FormEvent) {
    ev.preventDefault();
    if (!canInspect) return;
    await withBusy(async () => {
      await apiSend(`${API}/environmental-samples`, "POST", {
        siteId: siteId || null,
        locationId: envLocationId || null,
        sampleType: envSampleType,
        samplePoint: envSamplePoint.trim() || null,
        result: envResult.trim() || null,
        passFail: envPassFail || null,
      });
      setEnvSamplePoint("");
      setEnvResult("");
      setEnvPassFail("");
      await loadEnvSamples();
    }, "Environmental sample created");
  }

  async function patchEnvSample(ev: FormEvent) {
    ev.preventDefault();
    if (!canInspect || !envEditId) return;
    await withBusy(async () => {
      try {
        await apiSend(`${API}/environmental-samples/${encodeURIComponent(envEditId)}`, "PATCH", {
          result: envResult.trim() || null,
          passFail: envPassFail || null,
          status: envPassFail ? "COMPLETED" : "PENDING",
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Patch environmental sample endpoint is not available yet.");
        }
        throw e;
      }
      setEnvEditId("");
      setEnvResult("");
      setEnvPassFail("");
      await loadEnvSamples();
    }, "Sample results updated");
  }

  async function createCompressedAir(ev: FormEvent) {
    ev.preventDefault();
    if (!canInspect && !canReport) return;
    await withBusy(async () => {
      await apiSend(`${API}/compressed-air-requests`, "POST", {
        siteId: siteId || null,
        areaIdentified: airArea.trim(),
        cleaningReason: airReason.trim() || null,
        equipmentStatusConfirmed: airEquipment,
        ignitionSourcesAddressed: airIgnition,
        otherIgnitionControlled: airOtherIgnition,
        ppeConfirmed: airPpe,
        areaBarricaded: airBarricaded,
        dustCollectionReviewed: airDustCollection,
      });
      setAirArea("");
      setAirReason("");
      setAirEquipment(false);
      setAirIgnition(false);
      setAirOtherIgnition(false);
      setAirPpe(false);
      setAirBarricaded(false);
      setAirDustCollection(false);
      await loadCompressedAir();
    }, "Compressed-air request submitted");
  }

  async function airAction(id: string, action: "approve" | "deny" | "complete" | "verify") {
    await withBusy(async () => {
      try {
        await apiSend(
          `${API}/compressed-air-requests/${encodeURIComponent(id)}/${action}`,
          "POST",
          action === "deny" ? { reason: "Denied from sanitation workspace" } : {},
        );
        await loadCompressedAir();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error(`Compressed-air ${action} endpoint is not available yet.`);
        }
        throw e;
      }
    }, `Request ${action}d`);
  }

  async function printInspection(id: string) {
    await withBusy(async () => {
      try {
        const data = await apiGet<{ html?: string } | string>(
          `${API}/inspections/${encodeURIComponent(id)}/printable`,
        );
        const html = typeof data === "string" ? data : String(data.html ?? "");
        if (!html) throw new Error("Empty printable response");
        openPrintHtml(html);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Printable inspection endpoint is not available yet.");
        }
        throw e;
      }
    });
  }

  async function generateAuditPackage(ev: FormEvent) {
    ev.preventDefault();
    await withBusy(async () => {
      try {
        const data = await apiSend<{ html?: string } | string>(`${API}/audit-package`, "POST", {
          siteId: siteId || null,
          from: auditFrom || null,
          to: auditTo || null,
        });
        const html = typeof data === "string" ? data : String(data.html ?? "");
        if (!html) throw new Error("Empty audit package");
        openPrintHtml(html);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Audit package endpoint is not available yet.");
        }
        throw e;
      }
    }, "Audit package opened");
  }

  async function exportCsv(kind: string) {
    await withBusy(async () => {
      try {
        const data = await apiGet<string | { csv?: string; text?: string }>(`${API}/export`, {
          query: { kind, ...siteQuery(siteId) },
        });
        const text =
          typeof data === "string" ? data : String(data.csv ?? data.text ?? JSON.stringify(data));
        downloadText(`sanitation-${kind}.csv`, text, "text/csv;charset=utf-8");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error(`Export kind "${kind}" is not available yet.`);
        }
        throw e;
      }
    }, `${kind} CSV downloaded`);
  }

  async function createTenantTemplate(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    let sections: unknown;
    try {
      sections = JSON.parse(tplSectionsJson);
    } catch {
      setError("Template sections must be valid JSON");
      return;
    }
    await withBusy(async () => {
      try {
        await apiSend(`${API}/templates`, "POST", {
          name: tplName.trim(),
          category: tplCategory,
          templateJson: { sections },
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("Create template endpoint is not available yet.");
        }
        throw e;
      }
      setTplName("");
      await loadTemplates();
    }, "Template created");
  }

  async function addCleaningPhoto(kind: "before" | "after", file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 900_000);
      const photo: ResponsePhoto = {
        id: crypto.randomUUID(),
        fileName: file.name || "photo.jpg",
        contentType: "image/jpeg",
        dataUrl,
      };
      if (kind === "before") setCleaningBeforePhotos((p) => [...p, photo].slice(0, 3));
      else setCleaningAfterPhotos((p) => [...p, photo].slice(0, 3));
    } catch (e) {
      setError(imageCompressErrorMessage(e, "Could not compress photo"));
    }
  }

  async function submitDust(ev: FormEvent) {
    ev.preventDefault();
    if (!canInspect) return;
    const depth = Number(dustDepth);
    if (!Number.isFinite(depth) || depth < 0) {
      setError("Enter a valid dust depth");
      return;
    }
    await withBusy(async () => {
      const result = await apiSend<Row & { alert?: string | null }>(
        `${API}/dust-measurements`,
        "POST",
        {
          siteId: siteId || null,
          locationId: dustLocationId || null,
          surface: dustSurface.trim() || null,
          measurementPoint: dustPoint.trim() || null,
          dustDepth: depth,
          unit: dustUnit,
          isPriorityArea: dustPriority,
          comments: dustComments.trim() || null,
        },
      );
      setDustAlert(result.alert ? String(result.alert) : null);
      setDustDepth("");
      setDustComments("");
      await Promise.all([loadDust(), loadFindings(), loadDashboard()]);
    }, "Dust measurement recorded");
  }

  async function reportSpill(ev: FormEvent) {
    ev.preventDefault();
    if (!canReport) return;
    await withBusy(async () => {
      await apiSend(`${API}/spills`, "POST", {
        siteId: siteId || null,
        area: spillArea.trim() || null,
        product: spillProduct.trim() || null,
        estimatedQuantity: spillQty.trim() || null,
        cause: spillCause.trim() || null,
        notes: spillNotes.trim() || null,
        slipFallHazard: spillSlip,
        dustHazard: spillDust,
      });
      setSpillArea("");
      setSpillProduct("");
      setSpillQty("");
      setSpillCause("");
      setSpillNotes("");
      await loadSpills();
    }, "Spill reported");
  }

  async function createLocation(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    if (!siteId) {
      setError("Select a Location before creating a sanitation place.");
      return;
    }
    if (!departmentId) {
      setError("Select an Area before creating a sanitation place.");
      return;
    }
    const areaLabel =
      departmentName.trim() ||
      org.departments.find((d) => d.id === departmentId)?.label.trim() ||
      "Area";
    await withBusy(async () => {
      await apiSend(`${API}/locations`, "POST", {
        siteId,
        departmentId,
        name: locName.trim() || areaLabel,
        isPriorityHousekeeping: locPriority,
        priorityReason: locPriority ? locPriorityReason.trim() || null : null,
      });
      setLocName("");
      setLocPriority(false);
      setLocPriorityReason("");
      await loadZonesAndLocations();
    }, "Location created");
  }

  async function ensureSanitationLocationForArea(area: { id: string; label: string }) {
    if (!canManage) return;
    if (!siteId) {
      setError("Select a Location first.");
      return;
    }
    const existing = locationsByDepartmentId.get(area.id) ?? [];
    if (existing.length > 0) {
      setDepartmentId(area.id);
      setDepartmentName(area.label);
      setSuccess(`Area already has ${existing.length} sanitation location(s).`);
      return;
    }
    await withBusy(async () => {
      await apiSend(`${API}/locations`, "POST", {
        siteId,
        departmentId: area.id,
        name: area.label,
      });
      setDepartmentId(area.id);
      setDepartmentName(area.label);
      await loadZonesAndLocations();
    }, "Sanitation location added for area");
  }

  async function updateLocationDepartment(locationId: string, nextDepartmentId: string) {
    if (!canManage) return;
    await withBusy(
      async () => {
        await apiSend(`${API}/locations/${locationId}`, "PATCH", {
          departmentId: nextDepartmentId || null,
        });
        await loadZonesAndLocations();
      },
      nextDepartmentId ? "Area updated" : "Area cleared",
    );
  }

  async function createPestDevice(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    await withBusy(async () => {
      await apiSend(`${API}/pest-devices`, "POST", {
        siteId: siteId || null,
        deviceType: pestDeviceType,
        area: pestDeviceArea.trim() || null,
      });
      setPestDeviceArea("");
      await loadPest();
    }, "Pest device created");
  }

  async function createPestFinding(ev: FormEvent) {
    ev.preventDefault();
    if (!canInspect && !canReport) return;
    await withBusy(async () => {
      await apiSend(`${API}/pest-findings`, "POST", {
        siteId: siteId || null,
        deviceId: pestFindingDeviceId || null,
        pestCategory,
        evidence: pestEvidence.trim() || null,
      });
      setPestEvidence("");
      await Promise.all([loadPest(), loadDashboard()]);
    }, "Pest finding recorded");
  }

  async function createChemical(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    await withBusy(async () => {
      await apiSend(`${API}/chemicals`, "POST", {
        siteId: siteId || null,
        name: chemName.trim(),
        manufacturer: chemMfr.trim() || null,
        intendedUse: chemUse.trim() || null,
        foodContactApproved: chemFoodContact,
      });
      setChemName("");
      setChemMfr("");
      setChemUse("");
      setChemFoodContact(false);
      await loadChemicals();
    }, "Chemical added");
  }

  async function submitVerification(ev: FormEvent) {
    ev.preventDefault();
    if (!canVerify || !verifyTaskId) return;
    await withBusy(async () => {
      await apiSend(`${API}/verifications`, "POST", {
        cleaningTaskId: verifyTaskId,
        siteId: siteId || null,
        method: verifyMethod,
        result: verifyResult,
        notes: verifyNotes.trim() || null,
      });
      setVerifyNotes("");
      setVerifyTaskId("");
      await Promise.all([loadCleaning(), loadDashboard(), loadVerifications()]);
    }, "Verification submitted");
  }

  async function reportConcern(ev: FormEvent) {
    ev.preventDefault();
    if (!canReport) return;
    await withBusy(async () => {
      await apiSend(`${API}/concerns`, "POST", {
        siteId: siteId || null,
        concernType,
        description: concernDesc.trim() || null,
      });
      setConcernDesc("");
      await loadConcerns();
    }, "Concern reported");
  }

  async function saveProfile(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    if (!siteId) {
      setError("Select a site for the facility profile");
      return;
    }
    await withBusy(async () => {
      await apiSend(`${API}/profiles`, "POST", {
        siteId,
        facilityTypes: profileTypes,
        complianceFrameworks: profileFrameworks,
        dustActionThresholdInches: Number(profileDustThreshold) || 0.125,
        priorityHousekeepingEnabled: profilePriorityHk,
        independentVerificationRequired: profileIndepVerify,
        settings: {
          completedReportEmail: profileCompletedReportEmail.trim() || null,
        },
      });
      await loadProfiles();
    }, "Facility profile saved");
  }

  const siteCascade = (
    <div className="row g-3 mb-3">
      <OrgLocationCascade
        idPrefix="san"
        loading={org.loading}
        sites={org.sites}
        departments={org.departments}
        divisionEntries={org.divisionEntries}
        showDepartment
        departmentLabel="Area"
        required={false}
        locationEmptyLabel="All sites"
        departmentEmptyLabel="All areas"
        value={{
          siteId,
          siteName,
          divisionName,
          departmentId,
          departmentName,
        }}
        onChange={(next) => {
          setSiteId(next.siteId);
          setDivisionName(next.divisionName);
          setDepartmentId(next.departmentId);
          setDepartmentName(next.departmentName);
        }}
      />
      {areaDepartmentInfo}
    </div>
  );

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view sanitation.
      </div>
    );
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  let panel: ReactNode = null;

  if (tab === "dashboard") {
    const scorecard = dashboard?.facilityScorecard as Record<string, unknown> | null | undefined;
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="row g-3">
          <KpiCard
            label="Compliance %"
            value={
              dashboard?.sanitationCompliancePercent != null
                ? `${dashboard.sanitationCompliancePercent}%`
                : scorecard?.compliancePercent != null
                  ? `${String(scorecard.compliancePercent)}%`
                  : "—"
            }
            tone="success"
          />
          <KpiCard
            label="Inspections today"
            value={dashboard?.todayInspections ?? 0}
            tone="primary"
          />
          <KpiCard
            label="Critical findings"
            value={dashboard?.openCriticalFindings ?? 0}
            tone="danger"
          />
          <KpiCard
            label="Overdue cleaning"
            value={dashboard?.overdueCleaningTasks ?? 0}
            tone="warning"
          />
          <KpiCard
            label="Dust alerts"
            value={dashboard?.dustHousekeepingAlerts ?? 0}
            tone="danger"
          />
          <KpiCard
            label="MSS %"
            value={
              dashboard?.mssCompletionPercent != null ? `${dashboard.mssCompletionPercent}%` : "—"
            }
          />
          <KpiCard label="Pest findings" value={dashboard?.pestFindings ?? 0} tone="warning" />
          <KpiCard
            label="Open actions"
            value={dashboard?.overdueCorrectiveActions ?? 0}
            tone="warning"
          />
          {scorecard?.openFindings != null ? (
            <KpiCard label="Scorecard open findings" value={String(scorecard.openFindings)} />
          ) : null}
          {scorecard?.mssOnTimePercent != null ? (
            <KpiCard
              label="Scorecard MSS on-time"
              value={`${String(scorecard.mssOnTimePercent)}%`}
            />
          ) : null}
        </div>

        <div className="d-flex flex-wrap gap-2">
          {canInspect ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setTab("start")}
            >
              Start inspection
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("preop")}
          >
            Pre-op
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("dust")}
          >
            Record dust
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("spills")}
          >
            Report spill
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("cleaning")}
          >
            Cleaning tasks
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("analytics")}
          >
            Analytics
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setTab("concerns")}
          >
            Report concern
          </button>
        </div>

        <div className="row g-3">
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Recurring findings</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <tbody>
                    {(dashboard?.recurringFindings ?? []).length === 0 ? (
                      <EmptyRow colSpan={1} message="No recurring findings surfaced." />
                    ) : (
                      (dashboard?.recurringFindings ?? []).map((f, idx) => (
                        <tr key={String(f.id ?? idx)}>
                          <td>
                            <div>{String(f.title ?? f.label ?? f.category ?? "Finding")}</div>
                            <span className="small text-muted">
                              {f.count != null ? `${String(f.count)} occurrences` : ""}
                              {f.severity ? ` · ${String(f.severity)}` : ""}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Worst areas</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Score / findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.worstAreas ?? []).length === 0 ? (
                      <EmptyRow colSpan={2} message="No worst-area data." />
                    ) : (
                      (dashboard?.worstAreas ?? []).map((a, idx) => (
                        <tr key={String(a.id ?? idx)}>
                          <td>{String(a.name ?? a.area ?? a.locationName ?? "—")}</td>
                          <td>
                            {a.scorePercent != null
                              ? `${String(a.scorePercent)}%`
                              : a.findingsCount != null
                                ? String(a.findingsCount)
                                : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Corrective action aging</h6>
              </div>
              <div className="card-body">
                {(() => {
                  const aging = asRowArray(dashboard?.correctiveActionAging);
                  if (aging.length === 0) {
                    return <p className="text-muted small mb-0">No CA aging buckets.</p>;
                  }
                  const max = Math.max(1, ...aging.map((b) => Number(b.count ?? b.value ?? 0)));
                  return (
                    <div className="d-flex flex-column gap-2">
                      {aging.map((bucket, idx) => {
                        const label = String(bucket.label ?? bucket.bucket ?? `Bucket ${idx + 1}`);
                        const count = Number(bucket.count ?? bucket.value ?? 0);
                        return (
                          <div key={label}>
                            <div className="d-flex justify-content-between small mb-1">
                              <span>{label}</span>
                              <span className="fw-semibold">{count}</span>
                            </div>
                            <div className="progress" style={{ height: 10 }}>
                              <div
                                className="progress-bar bg-warning"
                                style={{ width: `${Math.round((count / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Multi-site comparison</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Compliance</th>
                      <th>Open critical</th>
                      <th>MSS %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.multiSiteComparison ?? []).length === 0 ? (
                      <EmptyRow colSpan={4} message="No multi-site comparison data." />
                    ) : (
                      (dashboard?.multiSiteComparison ?? []).map((row, idx) => (
                        <tr key={String(row.siteId ?? row.id ?? idx)}>
                          <td>{String(row.siteName ?? row.name ?? "—")}</td>
                          <td>
                            {row.compliancePercent != null
                              ? `${String(row.compliancePercent)}%`
                              : "—"}
                          </td>
                          <td>{String(row.openCriticalFindings ?? row.critical ?? "—")}</td>
                          <td>
                            {row.mssCompletionPercent != null
                              ? `${String(row.mssCompletionPercent)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="mb-0">Today&apos;s cleaning</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <tbody>
                    {(dashboard?.todayCleaningSchedule ?? []).length === 0 ? (
                      <EmptyRow colSpan={1} message="No cleaning due today." />
                    ) : (
                      (dashboard?.todayCleaningSchedule ?? []).map((t) => (
                        <tr key={t.id}>
                          <td>
                            <div>{String(t.title ?? t.cleaningTask ?? "Task")}</div>
                            <span className={`badge ${statusBadgeClass(String(t.status ?? ""))}`}>
                              {String(t.status ?? "—")}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header d-flex justify-content-between">
                <h6 className="mb-0">Open critical / major</h6>
                <button
                  type="button"
                  className="btn btn-sm btn-link"
                  onClick={() => setTab("findings")}
                >
                  View all
                </button>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <tbody>
                    {(dashboard?.openFindings ?? []).length === 0 ? (
                      <EmptyRow colSpan={1} message="No open critical/major findings." />
                    ) : (
                      (dashboard?.openFindings ?? []).map((f) => (
                        <tr key={f.id}>
                          <td>
                            <div>{String(f.title ?? "Finding")}</div>
                            <span
                              className={`badge ${severityBadgeClass(String(f.severity ?? ""))}`}
                            >
                              {String(f.severity ?? "—")}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header d-flex justify-content-between">
                <h6 className="mb-0">Recent inspections</h6>
                <button
                  type="button"
                  className="btn btn-sm btn-link"
                  onClick={() => setTab("inspections")}
                >
                  View all
                </button>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <tbody>
                    {(dashboard?.recentInspections ?? []).length === 0 ? (
                      <EmptyRow colSpan={1} message="No inspections yet." />
                    ) : (
                      (dashboard?.recentInspections ?? []).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div className="small text-muted">
                              {String(row.inspectionNumber ?? "")}
                            </div>
                            <div>{String(row.title ?? "—")}</div>
                            <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                              {String(row.status ?? "—")}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else if (tab === "analytics") {
    const byCategory = barRows(analytics?.findingsByCategory, ["category", "label"]);
    const bySeverity = barRows(analytics?.findingsBySeverity ?? analytics?.severity, [
      "severity",
      "label",
    ]);
    const dustTrend = barRows(analytics?.dustTrend ?? analytics?.dustAccumulationTrend, [
      "label",
      "date",
      "days",
    ]);
    const mssTrend = barRows(analytics?.mssTrend ?? analytics?.mssCompletionTrend, [
      "label",
      "date",
      "weekStart",
    ]);
    const scoreTrend = barRows(analytics?.scoreTrend ?? analytics?.inspectionScoreTrend, [
      "label",
      "date",
      "weekStart",
    ]);
    const insights = insightRows(analytics?.smartInsights);
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {analyticsError ? (
          <div className="alert alert-warning mb-0" role="alert">
            {analyticsError}
          </div>
        ) : null}
        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={() => void withBusy(async () => loadAnalytics())}
          >
            Refresh analytics
          </button>
        </div>
        {insights.length > 0 ? (
          <div className="d-flex flex-column gap-2">
            {insights.map((insight, idx) => (
              <div
                key={String(insight.id ?? idx)}
                className={`alert mb-0 ${
                  insight.severity.toUpperCase() === "CRITICAL"
                    ? "alert-danger"
                    : insight.severity.toUpperCase() === "WARNING"
                      ? "alert-warning"
                      : "alert-info"
                }`}
                role="alert"
              >
                <div className="fw-semibold">{insight.title}</div>
                <div className="small">{insight.message}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="row g-3">
          <div className="col-md-6">
            <SimpleBarList title="Findings by category" rows={byCategory} />
          </div>
          <div className="col-md-6">
            <SimpleBarList title="Findings by severity" rows={bySeverity} />
          </div>
          <div className="col-md-4">
            <SimpleBarList title="Dust trend" rows={dustTrend} />
          </div>
          <div className="col-md-4">
            <SimpleBarList title="MSS trend" rows={mssTrend} />
          </div>
          <div className="col-md-4">
            <SimpleBarList title="Score trend" rows={scoreTrend} />
          </div>
        </div>
      </div>
    );
  } else if (tab === "heatmap") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {heatMapError ? (
          <div className="alert alert-warning mb-0" role="alert">
            {heatMapError}
          </div>
        ) : null}
        {placingLocationId ? (
          <div className="alert alert-info mb-0" role="status">
            Click the map to place location position, or{" "}
            <button
              type="button"
              className="btn btn-sm btn-link p-0 align-baseline"
              onClick={() => setPlacingLocationId(null)}
            >
              cancel
            </button>
            .
          </div>
        ) : null}
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Facility heat map</h5>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  await Promise.all([loadHeatMap(), loadZonesAndLocations(), loadPest()]);
                })
              }
            >
              Refresh
            </button>
          </div>
          <div className="card-body">
            <div
              className="position-relative rounded border"
              style={{
                minHeight: 420,
                cursor: placingLocationId ? "crosshair" : "default",
                background: "linear-gradient(145deg, #e8eef5 0%, #d5e4d0 45%, #f0ebe3 100%)",
              }}
              onClick={(ev) => void placeLocationOnMap(ev)}
              role="presentation"
            >
              {heatMapLocations.map((loc) => {
                if (loc.mapX == null || loc.mapY == null) return null;
                const x = Number(loc.mapX);
                const y = Number(loc.mapY);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    title={String(loc.name ?? "Location")}
                    className="border-0 p-0"
                    style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: `${y}%`,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      transform: "translate(-50%, -50%)",
                      background: sanitationStatusDotColor(
                        String(loc.sanitationStatus ?? loc.status ?? ""),
                      ),
                      boxShadow: "0 0 0 2px #fff",
                      zIndex: 2,
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setHeatMapPopover(loc);
                    }}
                  />
                );
              })}
              {heatMapPests.map((dev) => {
                if (dev.mapX == null || dev.mapY == null) return null;
                const x = Number(dev.mapX);
                const y = Number(dev.mapY);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <button
                    key={`pest-${dev.id}`}
                    type="button"
                    title={String(dev.deviceNumber ?? "Pest device")}
                    className="border border-dark p-0"
                    style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: `${y}%`,
                      width: 12,
                      height: 12,
                      transform: "translate(-50%, -50%) rotate(45deg)",
                      background: "#7367f0",
                      zIndex: 2,
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setHeatMapPopover(dev);
                    }}
                  />
                );
              })}
              {heatMapPopover ? (
                <div
                  className="card shadow-sm"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    width: 260,
                    zIndex: 5,
                  }}
                >
                  <div className="card-body py-2">
                    <div className="fw-semibold">
                      {String(heatMapPopover.name ?? heatMapPopover.deviceNumber ?? "Point")}
                    </div>
                    <div className="small text-muted mb-1">
                      Status:{" "}
                      {String(heatMapPopover.sanitationStatus ?? heatMapPopover.status ?? "—")}
                    </div>
                    <div className="small">
                      Findings:{" "}
                      {String(heatMapPopover.findingsCount ?? heatMapPopover.openFindings ?? "—")}
                    </div>
                    <div className="small">
                      Dust alerts: {String(heatMapPopover.dustAlerts ?? "—")}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-link px-0"
                      onClick={() => setHeatMapPopover(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {locationsMissingCoords.length > 0 ? (
          <div className="card">
            <div className="card-header">
              <h6 className="mb-0">Locations without map coordinates</h6>
            </div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {locationsMissingCoords.map((loc) => (
                    <tr key={loc.id}>
                      <td>{String(loc.name ?? "—")}</td>
                      <td className="text-end">
                        {canManage ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setPlacingLocationId(loc.id)}
                          >
                            Set map position
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  } else if (tab === "inspections") {
    panel = (
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="card-title mb-0">Inspections</h5>
          {canInspect ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setTab("start")}
            >
              Start new
            </button>
          ) : null}
        </div>
        <div className="card-body pb-0">{siteCascade}</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Score</th>
                <th>Completed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inspections.length === 0 ? (
                <EmptyRow colSpan={7} message="No inspections found." />
              ) : (
                inspections.map((row) => {
                  const status = String(row.status ?? "").toUpperCase();
                  const canDeleteRow = canInspect && status !== "COMPLETED" && !row.completedAt;
                  return (
                    <tr key={row.id}>
                      <td>{String(row.inspectionNumber ?? "—")}</td>
                      <td>{String(row.title ?? "—")}</td>
                      <td>{String(row.inspectionType ?? "—")}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      <td>{row.scorePercent != null ? `${String(row.scorePercent)}%` : "—"}</td>
                      <td>{fmtDate(row.completedAt)}</td>
                      <td className="text-end text-nowrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => void openInspection(row.id)}
                        >
                          Open
                        </button>
                        {canReport && status === "COMPLETED" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary ms-1"
                            onClick={() =>
                              setEmailPdfTarget({
                                id: row.id,
                                label: String(row.inspectionNumber ?? row.title ?? "Inspection"),
                              })
                            }
                          >
                            Email PDF
                          </button>
                        ) : null}
                        {canDeleteRow ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger ms-1"
                            disabled={busy}
                            onClick={() =>
                              void deleteInspection(
                                row.id,
                                String(row.inspectionNumber ?? row.title ?? ""),
                              )
                            }
                          >
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (tab === "start") {
    panel = (
      <form className="card" onSubmit={(ev) => void startInspection(ev)}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="card-title mb-0">Start inspection</h5>
          {canManage && templates.length === 0 ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void ensureBuiltinTemplates()}
              disabled={busy}
            >
              Ensure builtin templates
            </button>
          ) : null}
        </div>
        <div className="card-body">
          <div className="row g-3">
            <OrgLocationCascade
              idPrefix="san-start"
              required
              departmentRequired={false}
              loading={org.loading}
              sites={org.sites}
              departments={org.departments}
              divisionEntries={org.divisionEntries}
              showDepartment
              departmentLabel="Area"
              departmentEmptyLabel="None"
              value={{
                siteId,
                siteName,
                divisionName,
                departmentId,
                departmentName,
              }}
              onChange={(next) => {
                setSiteId(next.siteId);
                setDivisionName(next.divisionName);
                setDepartmentId(next.departmentId);
                setDepartmentName(next.departmentName);
              }}
            />
            {areaDepartmentInfo}
            <div className="col-md-6">
              <label className="form-label" htmlFor="san-tpl">
                Template
              </label>
              <select
                id="san-tpl"
                className="form-select"
                value={startTemplateId}
                onChange={(ev) => {
                  setStartTemplateId(ev.target.value);
                  autoTitleRef.current = "";
                  setStartTitle("");
                }}
                required
              >
                {templates.length === 0 ? (
                  <option value="">No templates — ensure builtin first</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))
                )}
              </select>
              {canManage && templates.length === 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-link px-0 mt-1"
                  onClick={() => void ensureBuiltinTemplates()}
                >
                  Load builtin templates
                </button>
              ) : null}
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="san-title">
                Title
              </label>
              <input
                id="san-title"
                className="form-control"
                value={startTitle}
                onChange={(ev) => setStartTitle(ev.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="card-footer">
          <button type="submit" className="btn btn-primary" disabled={busy || !canInspect}>
            Start
          </button>
        </div>
      </form>
    );
  } else if (tab === "preop") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Pre-operational templates</h5>
          </div>
          <div className="card-body">
            <p className="text-muted small">
              Start a PREOP inspection. After completion, disposition is shown as{" "}
              <strong>RELEASED_FOR_PRODUCTION</strong> or <strong>FAILED_PRODUCTION_HOLD</strong>.
            </p>
            {preopTemplates.length === 0 ? (
              <div className="alert alert-info mb-0">
                No PREOP templates found.{" "}
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => void ensureBuiltinTemplates()}
                  >
                    Ensure builtin templates
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="list-group">
                {preopTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="list-group-item d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <div className="fw-medium">{t.name}</div>
                      <div className="small text-muted">{t.code}</div>
                    </div>
                    {canInspect ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy || !siteId}
                        onClick={() => {
                          setStartTemplateId(t.id);
                          const title = buildInspectionTitle(t.name ?? "Pre-Op");
                          autoTitleRef.current = title;
                          setStartTitle(title);
                          void startInspection({ preventDefault() {} } as FormEvent, {
                            inspectionType: "PREOP",
                          });
                        }}
                      >
                        Start PREOP
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {!siteId ? (
              <div className="form-text mt-2">Select a site above before starting.</div>
            ) : null}
          </div>
        </div>
        {completeResult &&
        String(activeInspection?.inspectionType ?? "").toUpperCase() === "PREOP" ? (
          <div
            className={`alert ${
              preopDisposition(completeResult.complianceStatus) === "RELEASED_FOR_PRODUCTION"
                ? "alert-success"
                : "alert-danger"
            }`}
          >
            <div className="fs-5 fw-semibold">
              {preopDisposition(completeResult.complianceStatus) ?? completeResult.complianceStatus}
            </div>
            <div className="small">
              Compliance: {completeResult.complianceStatus}
              {completeResult.scorePercent != null ? ` (${completeResult.scorePercent}%)` : ""}
            </div>
          </div>
        ) : null}
      </div>
    );
  } else if (tab === "run") {
    const runCompleted = String(activeInspection?.status ?? "").toUpperCase() === "COMPLETED";
    const disposition =
      String(activeInspection?.inspectionType ?? "").toUpperCase() === "PREOP"
        ? preopDisposition(
            completeResult?.complianceStatus ?? String(activeInspection?.complianceStatus ?? ""),
          )
        : null;
    panel = (
      <div className="d-flex flex-column gap-3">
        {!activeInspection ? (
          <div className="alert alert-info mb-0">
            No active inspection.{" "}
            <button
              type="button"
              className="btn btn-sm btn-primary ms-2"
              onClick={() => setTab("start")}
            >
              Start one
            </button>{" "}
            or open from the Inspections list.
          </div>
        ) : (
          <>
            {!isOnline ? (
              <div className="alert alert-warning mb-0" role="alert">
                You are offline. Responses autosave locally (
                <code>forge.sanitation.draft.{activeInspection.id}</code>) and will sync when
                online.
              </div>
            ) : null}
            {draftRestored ? (
              <div className="alert alert-info mb-0" role="status">
                A local draft was restored for this inspection.
              </div>
            ) : null}
            <div className="card">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between gap-3 align-items-start">
                  <div className="d-flex gap-3 align-items-start">
                    {formLogoSrc ? (
                      // Plain <img> on purpose: static export, so next/image optimization is unavailable.
                      <img
                        src={formLogoSrc}
                        alt={formLogo?.label || tenantLabel}
                        style={{ maxHeight: 56, maxWidth: 160, objectFit: "contain" }}
                      />
                    ) : (
                      <div className="fw-semibold">{tenantLabel}</div>
                    )}
                    <div>
                      <div className="text-muted small">
                        {String(activeInspection.inspectionNumber ?? "")}
                      </div>
                      <h5 className="mb-1">{String(activeInspection.title ?? "Inspection")}</h5>
                      <div className="small text-muted mb-1">{tenantLabel}</div>
                      <span
                        className={`badge ${statusBadgeClass(String(activeInspection.status ?? ""))}`}
                      >
                        {String(activeInspection.status ?? "—")}
                      </span>
                      {String(activeInspection.inspectionType ?? "") ? (
                        <span className="badge bg-label-secondary ms-1">
                          {String(activeInspection.inspectionType)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-semibold">{runProgress}% complete</div>
                    <div className="progress mt-1" style={{ width: 140, height: 8 }}>
                      <div className="progress-bar" style={{ width: `${runProgress}%` }} />
                    </div>
                    {!runCompleted && canInspect ? (
                      <div className="d-flex flex-wrap gap-1 justify-content-end mt-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          disabled={busy}
                          onClick={() => rapidPassAll()}
                        >
                          Rapid Pass
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busy}
                          onClick={() =>
                            void deleteInspection(
                              activeInspection.id,
                              String(
                                activeInspection.inspectionNumber ?? activeInspection.title ?? "",
                              ),
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                    {runCompleted && canReport ? (
                      <div className="d-flex flex-wrap gap-1 justify-content-end mt-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={busy}
                          onClick={() => void printInspection(activeInspection.id)}
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            setEmailPdfTarget({
                              id: activeInspection.id,
                              label: String(
                                activeInspection.inspectionNumber ??
                                  activeInspection.title ??
                                  "Inspection",
                              ),
                            })
                          }
                        >
                          Email PDF
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {completeResult || disposition ? (
              <div
                className={`alert ${
                  disposition === "RELEASED_FOR_PRODUCTION" ||
                  String(completeResult?.complianceStatus ?? "").includes("PASS")
                    ? "alert-success"
                    : "alert-warning"
                }`}
              >
                {disposition ? <div className="fs-5 fw-semibold mb-1">{disposition}</div> : null}
                <div className="fw-semibold">
                  Result:{" "}
                  {completeResult?.complianceStatus ??
                    String(activeInspection.complianceStatus ?? "—")}
                  {(completeResult?.scorePercent ?? activeInspection.scorePercent) != null
                    ? ` (${String(completeResult?.scorePercent ?? activeInspection.scorePercent)}%)`
                    : ""}
                </div>
                {(completeResult?.findings ?? []).length > 0 ? (
                  <ul className="mb-0 mt-2">
                    {(completeResult?.findings ?? []).map((f) => (
                      <li key={f.id}>
                        <span
                          className={`badge me-1 ${severityBadgeClass(String(f.severity ?? ""))}`}
                        >
                          {String(f.severity ?? "")}
                        </span>
                        {String(f.title ?? "")}
                      </li>
                    ))}
                  </ul>
                ) : completeResult ? (
                  <div className="small mt-1">No findings generated.</div>
                ) : null}
              </div>
            ) : null}

            {runSections.map((section) => (
              <div className="card" key={section.id}>
                <div className="card-header">
                  <h6 className="mb-0">{section.title}</h6>
                </div>
                <div className="card-body d-flex flex-column gap-2 p-2 p-md-3">
                  {(section.questions ?? []).map((q) => {
                    const entry = responses[q.id];
                    const result = entry?.result ?? "";
                    const isNo = result === "FAIL" || result === "NO";
                    const isYes = result === "PASS" || result === "YES";
                    const disabled = busy || !canInspect || runCompleted;
                    const expanded = Boolean(expandedQuestionIds[q.id]) || isNo;
                    const photoCount = entry?.photos?.length ?? 0;
                    const hasNotes = Boolean(String(entry?.notes ?? "").trim());
                    return (
                      <div key={q.id} className={`border rounded ${isNo ? "border-danger" : ""}`}>
                        <div className="sanitation-checklist-item__row">
                          <button
                            type="button"
                            className="btn btn-link sanitation-checklist-item__question text-decoration-none text-body p-0"
                            onClick={() => toggleQuestionExpanded(q.id)}
                            aria-expanded={expanded}
                          >
                            <div className="sanitation-checklist-item__question-inner">
                              <span className="text-muted mt-1 flex-shrink-0" aria-hidden>
                                {expanded ? "▾" : "▸"}
                              </span>
                              <span className="text-start min-w-0">
                                <span className="fw-medium d-block text-start">{q.label}</span>
                                {!expanded && q.regulationRef ? (
                                  <span className="small text-muted d-block text-start">
                                    {q.regulationRef}
                                  </span>
                                ) : null}
                                {!expanded && (hasNotes || photoCount > 0) ? (
                                  <span className="small text-muted d-block text-start">
                                    {hasNotes ? "Notes added" : ""}
                                    {hasNotes && photoCount > 0 ? " · " : ""}
                                    {photoCount > 0 ? `${photoCount} photo(s)` : ""}
                                  </span>
                                ) : null}
                                {!expanded && !isNo ? (
                                  <span className="small text-muted d-block text-start">
                                    Click to add optional notes or photos
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </button>
                          <div
                            className="sanitation-checklist-item__answers"
                            role="group"
                            aria-label={`Answer ${q.label}`}
                          >
                            <div className="btn-group">
                              {(
                                [
                                  { value: "PASS" as const, label: "Yes" },
                                  { value: "FAIL" as const, label: "No" },
                                  { value: "NA" as const, label: "N/A" },
                                ] as const
                              ).map((ans) => (
                                <button
                                  key={ans.value}
                                  type="button"
                                  className={`btn btn-sm ${
                                    result === ans.value ||
                                    (ans.value === "PASS" && isYes) ||
                                    (ans.value === "FAIL" && isNo)
                                      ? ans.value === "FAIL"
                                        ? "btn-danger"
                                        : ans.value === "PASS"
                                          ? "btn-success"
                                          : "btn-secondary"
                                      : "btn-outline-secondary"
                                  }`}
                                  disabled={disabled}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setQuestionResult(q.id, ans.value, q.label, q.riskLevel);
                                  }}
                                >
                                  {ans.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="px-2 px-md-3 pb-3 border-top pt-3">
                            {q.description ? (
                              <div className="small mb-2">{q.description}</div>
                            ) : null}
                            {q.regulationRef ? (
                              <div className="small text-muted mb-2">{q.regulationRef}</div>
                            ) : null}
                            {q.measurementRequired ? (
                              <div className="row g-2 mb-2">
                                <div className="col-md-4">
                                  <label
                                    className="form-label small"
                                    htmlFor={`dust-depth-${q.id}`}
                                  >
                                    Dust depth
                                  </label>
                                  <input
                                    id={`dust-depth-${q.id}`}
                                    className="form-control form-control-sm"
                                    type="number"
                                    step="any"
                                    min="0"
                                    disabled={disabled}
                                    value={entry?.dustDepth ?? ""}
                                    onChange={(ev) =>
                                      patchQuestion(q.id, { dustDepth: ev.target.value })
                                    }
                                  />
                                </div>
                                <div className="col-md-3">
                                  <label className="form-label small" htmlFor={`dust-unit-${q.id}`}>
                                    Unit
                                  </label>
                                  <select
                                    id={`dust-unit-${q.id}`}
                                    className="form-select form-select-sm"
                                    disabled={disabled}
                                    value={entry?.dustUnit ?? "INCHES"}
                                    onChange={(ev) =>
                                      patchQuestion(q.id, {
                                        dustUnit: ev.target.value as "INCHES" | "MM",
                                      })
                                    }
                                  >
                                    <option value="INCHES">INCHES</option>
                                    <option value="MM">MM</option>
                                  </select>
                                </div>
                                <div className="col-md-5 d-flex align-items-end">
                                  {isNo && canInspect && !runCompleted ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={busy}
                                      onClick={() => void postDustFromQuestion(q.id)}
                                    >
                                      POST dust measurement
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            <label className="form-label small" htmlFor={`notes-${q.id}`}>
                              Notes{isNo ? " (required)" : " (optional)"}
                            </label>
                            <textarea
                              id={`notes-${q.id}`}
                              className={`form-control form-control-sm mb-2 ${
                                isNo && !hasNotes ? "is-invalid" : ""
                              }`}
                              rows={2}
                              value={entry?.notes ?? ""}
                              disabled={disabled}
                              required={isNo}
                              onChange={(ev) => setQuestionNotes(q.id, ev.target.value)}
                              placeholder={
                                isNo
                                  ? "Required: describe the issue and any corrective action"
                                  : "Optional observations or follow-up detail"
                              }
                            />
                            {isNo && !hasNotes ? (
                              <div className="invalid-feedback d-block mb-2">
                                Notes are required for No answers.
                              </div>
                            ) : null}
                            <label className="form-label small" htmlFor={`photo-file-${q.id}`}>
                              Photos (optional) — up to {MAX_QUESTION_PHOTOS}
                              {q.photoRequired && isNo ? " · recommended for No" : ""}
                            </label>
                            <input
                              id={`photo-file-${q.id}`}
                              className="form-control form-control-sm mb-2"
                              type="file"
                              accept="image/*"
                              capture="environment"
                              multiple
                              disabled={disabled || photoCount >= MAX_QUESTION_PHOTOS}
                              onChange={(ev) => {
                                void addQuestionPhotos(q.id, ev.target.files);
                                ev.target.value = "";
                              }}
                            />
                            {photoCount > 0 ? (
                              <div className="d-flex flex-wrap gap-2 mb-2">
                                {(entry?.photos ?? []).map((p) => (
                                  <div key={p.id} className="position-relative">
                                    {/* Plain <img> on purpose: static export, so next/image optimization is unavailable. */}
                                    <img
                                      src={p.dataUrl}
                                      alt={p.fileName}
                                      style={{ width: 72, height: 72, objectFit: "cover" }}
                                      className="rounded border"
                                    />
                                    {unsavedPhotoIds.has(p.id) ? (
                                      <span className="badge bg-warning text-dark position-absolute bottom-0 start-0 small">
                                        Not uploaded
                                      </span>
                                    ) : null}
                                    {!disabled ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0"
                                        style={{ width: 22, height: 22, lineHeight: 1 }}
                                        aria-label={`Remove ${p.fileName}`}
                                        onClick={() => removeQuestionPhoto(q.id, p.id)}
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <label className="form-label small" htmlFor={`photo-${q.id}`}>
                              Photo note (optional)
                            </label>
                            <input
                              id={`photo-${q.id}`}
                              className="form-control form-control-sm"
                              value={entry?.photoNote ?? ""}
                              disabled={disabled}
                              onChange={(ev) => setQuestionPhotoNote(q.id, ev.target.value)}
                              placeholder="Describe photo evidence or file reference"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {!runCompleted && canInspect ? (
              <div className="card">
                <div className="card-header">
                  <h6 className="mb-0">Inspector signature</h6>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="sig-name">
                        Typed name
                      </label>
                      <input
                        id="sig-name"
                        className="form-control"
                        value={signatureName}
                        onChange={(ev) => setSignatureName(ev.target.value)}
                        placeholder="Inspector full name"
                      />
                    </div>
                    <div className="col-md-6">
                      <SignaturePad
                        label="Draw signature"
                        value={signatureDrawing}
                        onChange={setSignatureDrawing}
                        disabled={busy}
                        profileSignature={profileSignature}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!runCompleted && canInspect ? (
              <div className="d-flex flex-wrap gap-2 sticky-bottom bg-body py-2">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={busy}
                  onClick={() => void saveResponses()}
                >
                  Save responses
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void completeInspection()}
                >
                  Complete inspection
                </button>
                <span className="small text-body-secondary align-self-center" aria-live="polite">
                  {sanitationAutosaveLabel(autosave, unsavedPhotoIds.size)}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  } else if (tab === "mss") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Master sanitation schedule</h5>
            {canManage ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => void generateMssTasks()}
              >
                Generate due tasks
              </button>
            ) : null}
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Task</th>
                  <th>Frequency</th>
                  <th>Next due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mssRows.length === 0 ? (
                  <EmptyRow colSpan={5} message="No MSS entries." />
                ) : (
                  mssRows.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.title ?? "—")}</td>
                      <td>{String(row.cleaningTask ?? "—")}</td>
                      <td>{String(row.frequency ?? "—")}</td>
                      <td>{fmtDate(row.nextDueAt)}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {canManage ? (
          <form className="card" onSubmit={(ev) => void createMss(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Add MSS entry</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="mss-title">
                    Title
                  </label>
                  <input
                    id="mss-title"
                    className="form-control"
                    required
                    value={mssTitle}
                    onChange={(ev) => setMssTitle(ev.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="mss-task">
                    Cleaning task
                  </label>
                  <input
                    id="mss-task"
                    className="form-control"
                    value={mssTask}
                    onChange={(ev) => setMssTask(ev.target.value)}
                    placeholder="Defaults to title"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="mss-freq">
                    Frequency
                  </label>
                  <select
                    id="mss-freq"
                    className="form-select"
                    value={mssFrequency}
                    onChange={(ev) => setMssFrequency(ev.target.value)}
                  >
                    {MSS_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-8 d-flex flex-wrap align-items-end gap-3">
                  <div className="form-check">
                    <input
                      id="mss-verify"
                      className="form-check-input"
                      type="checkbox"
                      checked={mssVerification}
                      onChange={(ev) => setMssVerification(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="mss-verify">
                      Verification required
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="mss-loto"
                      className="form-check-input"
                      type="checkbox"
                      checked={mssLoto}
                      onChange={(ev) => setMssLoto(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="mss-loto">
                      LOTO required
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="mss-dust"
                      className="form-check-input"
                      type="checkbox"
                      checked={mssDust}
                      onChange={(ev) => setMssDust(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="mss-dust">
                      Dust hazard
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  } else if (tab === "cleaning") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Cleaning tasks</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cleaningTasks.length === 0 ? (
                  <EmptyRow colSpan={4} message="No cleaning tasks." />
                ) : (
                  cleaningTasks.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.title ?? row.cleaningTask ?? "—")}</td>
                      <td>{fmtDate(row.dueAt)}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      <td className="text-end">
                        {canClean &&
                        !["COMPLETED", "CLOSED", "VERIFIED", "CANCELLED"].includes(
                          String(row.status ?? "").toUpperCase(),
                        ) ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setSelectedCleaningId(row.id)}
                          >
                            Select
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {canClean && selectedCleaningId ? (
          <form className="card" onSubmit={(ev) => void completeCleaningTask(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Complete cleaning task</h5>
            </div>
            <div className="card-body">
              <p className="small text-muted">
                Selected:{" "}
                {String(
                  selectedCleaning?.title ?? selectedCleaning?.cleaningTask ?? selectedCleaningId,
                )}
              </p>
              {selectedCleaning?.lotoRequired ? (
                <div className="alert alert-warning" role="alert">
                  LOTO required for this task. Confirm isolation before cleaning.
                  <div className="mt-2">
                    <label className="form-label" htmlFor="clean-loto">
                      LOTO record ID (optional)
                    </label>
                    <input
                      id="clean-loto"
                      className="form-control"
                      value={cleaningLotoRecordId}
                      onChange={(ev) => setCleaningLotoRecordId(ev.target.value)}
                      placeholder="Related lockout record id"
                    />
                  </div>
                </div>
              ) : null}
              <div className="mb-3">
                <label className="form-label" htmlFor="clean-chems">
                  Chemicals used (comma or newline separated)
                </label>
                <textarea
                  id="clean-chems"
                  className="form-control"
                  rows={2}
                  value={cleaningChemicals}
                  onChange={(ev) => setCleaningChemicals(ev.target.value)}
                />
              </div>
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="clean-before-note">
                    Before photo note
                  </label>
                  <input
                    id="clean-before-note"
                    className="form-control"
                    value={cleaningBeforeNote}
                    onChange={(ev) => setCleaningBeforeNote(ev.target.value)}
                  />
                  <input
                    className="form-control form-control-sm mt-2"
                    type="file"
                    accept="image/*"
                    onChange={(ev) => {
                      void addCleaningPhoto("before", ev.target.files?.[0] ?? null);
                      ev.target.value = "";
                    }}
                  />
                  <div className="small text-muted mt-1">
                    {cleaningBeforePhotos.length} before photo(s)
                  </div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="clean-after-note">
                    After photo note
                  </label>
                  <input
                    id="clean-after-note"
                    className="form-control"
                    value={cleaningAfterNote}
                    onChange={(ev) => setCleaningAfterNote(ev.target.value)}
                  />
                  <input
                    className="form-control form-control-sm mt-2"
                    type="file"
                    accept="image/*"
                    onChange={(ev) => {
                      void addCleaningPhoto("after", ev.target.files?.[0] ?? null);
                      ev.target.value = "";
                    }}
                  />
                  <div className="small text-muted mt-1">
                    {cleaningAfterPhotos.length} after photo(s)
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="clean-sig">
                  Cleaner signature (typed name)
                </label>
                <input
                  id="clean-sig"
                  className="form-control"
                  value={cleaningSignature}
                  onChange={(ev) => setCleaningSignature(ev.target.value)}
                />
              </div>
              <label className="form-label" htmlFor="clean-notes">
                Notes
              </label>
              <textarea
                id="clean-notes"
                className="form-control"
                rows={3}
                value={cleaningNotes}
                onChange={(ev) => setCleaningNotes(ev.target.value)}
              />
            </div>
            <div className="card-footer d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Mark complete
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setSelectedCleaningId("")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  } else if (tab === "dust") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {dustAlert === "CRITICAL_DUST_HOUSEKEEPING_ALERT" ? (
          <div className="alert alert-danger" role="alert">
            CRITICAL_DUST_HOUSEKEEPING_ALERT — dust exceeded the priority housekeeping action level.
            A critical finding was created.
          </div>
        ) : null}
        {canInspect ? (
          <form className="card" onSubmit={(ev) => void submitDust(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Record dust measurement</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="dust-loc">
                    Location
                  </label>
                  <select
                    id="dust-loc"
                    className="form-select"
                    value={dustLocationId}
                    onChange={(ev) => setDustLocationId(ev.target.value)}
                  >
                    <option value="">Select location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {String(l.name)}
                        {l.isPriorityHousekeeping ? " (priority)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="dust-surface">
                    Surface
                  </label>
                  <input
                    id="dust-surface"
                    className="form-control"
                    value={dustSurface}
                    onChange={(ev) => setDustSurface(ev.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="dust-point">
                    Measurement point
                  </label>
                  <input
                    id="dust-point"
                    className="form-control"
                    value={dustPoint}
                    onChange={(ev) => setDustPoint(ev.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="dust-depth">
                    Dust depth
                  </label>
                  <input
                    id="dust-depth"
                    className="form-control"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={dustDepth}
                    onChange={(ev) => setDustDepth(ev.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="dust-unit">
                    Unit
                  </label>
                  <select
                    id="dust-unit"
                    className="form-select"
                    value={dustUnit}
                    onChange={(ev) => setDustUnit(ev.target.value as "INCHES" | "MM")}
                  >
                    <option value="INCHES">INCHES</option>
                    <option value="MM">MM</option>
                  </select>
                </div>
                <div className="col-md-6 d-flex align-items-end">
                  <div className="form-check">
                    <input
                      id="dust-priority"
                      className="form-check-input"
                      type="checkbox"
                      checked={dustPriority}
                      onChange={(ev) => setDustPriority(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="dust-priority">
                      Priority housekeeping area
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="dust-comments">
                    Comments
                  </label>
                  <textarea
                    id="dust-comments"
                    className="form-control"
                    rows={2}
                    value={dustComments}
                    onChange={(ev) => setDustComments(ev.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Record measurement
              </button>
            </div>
          </form>
        ) : null}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Recent measurements</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Depth</th>
                  <th>Surface / point</th>
                  <th>Measured</th>
                  <th>Action level</th>
                </tr>
              </thead>
              <tbody>
                {dustRows.length === 0 ? (
                  <EmptyRow colSpan={5} message="No dust measurements." />
                ) : (
                  dustRows.map((row) => {
                    const exceeds =
                      Boolean(row.exceedsActionLevel) ||
                      (typeof row.dustDepthInches === "number" &&
                        exceedsDustActionLevel(Number(row.dustDepthInches)));
                    return (
                      <tr key={row.id} className={exceeds ? "table-danger" : undefined}>
                        <td>{String(row.measurementNumber ?? "—")}</td>
                        <td>
                          {String(row.dustDepth ?? "—")} {String(row.unit ?? "")}
                          {row.dustDepthInches != null
                            ? ` (${String(row.dustDepthInches)} in)`
                            : ""}
                        </td>
                        <td>
                          {String(row.surface ?? "—")}
                          {row.measurementPoint ? ` / ${String(row.measurementPoint)}` : ""}
                        </td>
                        <td>{fmtDate(row.measuredAt)}</td>
                        <td>
                          {exceeds ? (
                            <span className="badge bg-label-danger">Exceeds</span>
                          ) : (
                            <span className="badge bg-label-success">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "environmental") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {envError ? (
          <div className="alert alert-warning mb-0" role="alert">
            {envError}
          </div>
        ) : null}
        {canInspect ? (
          <form className="card" onSubmit={(ev) => void createEnvSample(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Create EM sample</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label" htmlFor="env-type">
                    Sample type
                  </label>
                  <select
                    id="env-type"
                    className="form-select"
                    value={envSampleType}
                    onChange={(ev) => setEnvSampleType(ev.target.value)}
                  >
                    <option value="ATP">ATP</option>
                    <option value="SWAB">SWAB</option>
                    <option value="AIR">AIR</option>
                    <option value="WATER">WATER</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="env-loc">
                    Location
                  </label>
                  <select
                    id="env-loc"
                    className="form-select"
                    value={envLocationId}
                    onChange={(ev) => setEnvLocationId(ev.target.value)}
                  >
                    <option value="">None</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {String(l.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="env-point">
                    Sample point
                  </label>
                  <input
                    id="env-point"
                    className="form-control"
                    value={envSamplePoint}
                    onChange={(ev) => setEnvSamplePoint(ev.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="env-result-create">
                    Result (optional)
                  </label>
                  <input
                    id="env-result-create"
                    className="form-control"
                    value={envResult}
                    onChange={(ev) => setEnvResult(ev.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create sample
              </button>
            </div>
          </form>
        ) : null}
        {canInspect && envEditId ? (
          <form className="card" onSubmit={(ev) => void patchEnvSample(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Update sample results</h5>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-4">
                <label className="form-label" htmlFor="env-result">
                  Result
                </label>
                <input
                  id="env-result"
                  className="form-control"
                  value={envResult}
                  onChange={(ev) => setEnvResult(ev.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="env-pf">
                  Pass / Fail
                </label>
                <select
                  id="env-pf"
                  className="form-select"
                  value={envPassFail}
                  onChange={(ev) => setEnvPassFail(ev.target.value)}
                >
                  <option value="">Unset</option>
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                </select>
              </div>
            </div>
            <div className="card-footer d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save results
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setEnvEditId("")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Environmental samples</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Point</th>
                  <th>Result</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {envSamples.length === 0 ? (
                  <EmptyRow colSpan={6} message="No environmental samples." />
                ) : (
                  envSamples.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.sampleNumber ?? "—")}</td>
                      <td>{String(row.sampleType ?? "—")}</td>
                      <td>{String(row.samplePoint ?? "—")}</td>
                      <td>
                        {String(row.result ?? "—")}
                        {row.passFail ? ` (${String(row.passFail)})` : ""}
                      </td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      <td className="text-end">
                        {canInspect ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              setEnvEditId(row.id);
                              setEnvResult(String(row.result ?? ""));
                              setEnvPassFail(String(row.passFail ?? ""));
                            }}
                          >
                            Patch results
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "spills") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {canReport ? (
          <form className="card" onSubmit={(ev) => void reportSpill(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Report spill</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="spill-area">
                    Area
                  </label>
                  <input
                    id="spill-area"
                    className="form-control"
                    value={spillArea}
                    onChange={(ev) => setSpillArea(ev.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="spill-product">
                    Product
                  </label>
                  <input
                    id="spill-product"
                    className="form-control"
                    value={spillProduct}
                    onChange={(ev) => setSpillProduct(ev.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="spill-qty">
                    Estimated quantity
                  </label>
                  <input
                    id="spill-qty"
                    className="form-control"
                    value={spillQty}
                    onChange={(ev) => setSpillQty(ev.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="spill-cause">
                    Cause
                  </label>
                  <input
                    id="spill-cause"
                    className="form-control"
                    value={spillCause}
                    onChange={(ev) => setSpillCause(ev.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="spill-notes">
                    Notes
                  </label>
                  <input
                    id="spill-notes"
                    className="form-control"
                    value={spillNotes}
                    onChange={(ev) => setSpillNotes(ev.target.value)}
                  />
                </div>
                <div className="col-12 d-flex gap-3">
                  <div className="form-check">
                    <input
                      id="spill-slip"
                      className="form-check-input"
                      type="checkbox"
                      checked={spillSlip}
                      onChange={(ev) => setSpillSlip(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="spill-slip">
                      Slip/fall hazard
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="spill-dust"
                      className="form-check-input"
                      type="checkbox"
                      checked={spillDust}
                      onChange={(ev) => setSpillDust(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="spill-dust">
                      Dust hazard
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Report spill
              </button>
            </div>
          </form>
        ) : null}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Spills</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Area / product</th>
                  <th>Status</th>
                  <th>Reported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {spills.length === 0 ? (
                  <EmptyRow colSpan={5} message="No spills reported." />
                ) : (
                  spills.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.spillNumber ?? "—")}</td>
                      <td>
                        {String(row.area ?? "—")}
                        {row.product ? ` / ${String(row.product)}` : ""}
                      </td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      <td>{fmtDate(row.reportedAt)}</td>
                      <td>
                        {canClean || canManage ? (
                          <div className="d-flex flex-wrap gap-1">
                            {SPILL_STATUS_ACTIONS.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={busy || String(row.status ?? "").toUpperCase() === status}
                                onClick={() => void updateSpillStatus(row.id, status)}
                              >
                                {status.replaceAll("_", " ")}
                              </button>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "zones") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="alert alert-secondary mb-0" role="status">
          Areas &amp; Locations follow your org hierarchy:{" "}
          <strong>Location → Division → Area</strong>. Manage Areas under Settings → Dropdown lists.
          Add a sanitation place so the Area can appear on the heat map and in inspections.
        </div>
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="card h-100">
              <div className="card-header">
                <h5 className="card-title mb-0">Areas</h5>
                <div className="small text-muted">From Location / Division / Area catalogs</div>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Division</th>
                      <th>Places</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {!siteId ? (
                      <EmptyRow colSpan={4} message="Select a Location to see Areas." />
                    ) : locationDepartmentOptions.length === 0 ? (
                      <EmptyRow
                        colSpan={4}
                        message={
                          divisionName.trim()
                            ? "No Areas for this Division yet."
                            : "No Areas for this Location yet."
                        }
                      />
                    ) : (
                      locationDepartmentOptions.map((area) => {
                        const linked = locationsByDepartmentId.get(area.id) ?? [];
                        const selected = departmentId === area.id;
                        return (
                          <tr
                            key={area.id}
                            className={selected ? "table-active" : undefined}
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              setDepartmentId(area.id);
                              setDepartmentName(area.label);
                              if (area.divisionName) setDivisionName(area.divisionName);
                            }}
                          >
                            <td>
                              <div className="fw-medium">{area.label}</div>
                              {area.contactName ? (
                                <div className="small text-muted">{area.contactName}</div>
                              ) : null}
                            </td>
                            <td>{area.divisionName?.trim() || "—"}</td>
                            <td>{linked.length}</td>
                            <td className="text-end">
                              {canManage ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  disabled={busy}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void ensureSanitationLocationForArea(area);
                                  }}
                                >
                                  {linked.length ? "Select" : "Add place"}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="card h-100">
              <div className="card-header">
                <h5 className="card-title mb-0">Sanitation places</h5>
                <div className="small text-muted">
                  {departmentId
                    ? `Places for Area: ${departmentName || selectedAreaDepartment?.label || "selected"}`
                    : "All places for the selected Location (choose an Area to filter)"}
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Area</th>
                      <th>Priority HK</th>
                      <th>Map</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSanitationLocations.length === 0 ? (
                      <EmptyRow
                        colSpan={5}
                        message={
                          !siteId
                            ? "Select a Location first."
                            : departmentId
                              ? "No sanitation places for this Area yet."
                              : "No sanitation places yet."
                        }
                      />
                    ) : (
                      displayedSanitationLocations.map((l) => {
                        const deptName = String(l.departmentName ?? "").trim();
                        const deptDivision = String(l.departmentDivisionName ?? "").trim();
                        const deptContact = String(l.departmentContactName ?? "").trim();
                        const deptEmail = String(l.departmentContactEmail ?? "").trim();
                        return (
                          <tr key={l.id}>
                            <td>{String(l.name ?? "—")}</td>
                            <td style={{ minWidth: 160 }}>
                              {canManage ? (
                                <select
                                  className="form-select form-select-sm"
                                  value={String(l.departmentId ?? "")}
                                  disabled={busy}
                                  onChange={(ev) =>
                                    void updateLocationDepartment(l.id, ev.target.value)
                                  }
                                  aria-label={`Area for ${String(l.name ?? "place")}`}
                                >
                                  <option value="">None</option>
                                  {locationDepartmentOptions.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.label}
                                      {d.divisionName ? ` · ${d.divisionName}` : ""}
                                    </option>
                                  ))}
                                  {String(l.departmentId ?? "") &&
                                  !locationDepartmentOptions.some(
                                    (d) => d.id === String(l.departmentId),
                                  ) ? (
                                    <option value={String(l.departmentId)}>
                                      {deptName || "Current area"}
                                    </option>
                                  ) : null}
                                </select>
                              ) : (
                                <div className="small">
                                  <div className="fw-medium">{deptName || "—"}</div>
                                </div>
                              )}
                              {deptName || deptDivision || deptContact || deptEmail ? (
                                <div
                                  className={
                                    canManage ? "small text-muted mt-1" : "small text-muted"
                                  }
                                >
                                  {deptDivision ? <div>Division: {deptDivision}</div> : null}
                                  {deptContact ? <div>Contact: {deptContact}</div> : null}
                                  {deptEmail ? <div>{deptEmail}</div> : null}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {l.isPriorityHousekeeping ? (
                                <span className="badge bg-label-warning">
                                  {String(l.priorityReason ?? "Priority")}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {l.mapX != null && l.mapY != null
                                ? `${String(l.mapX)}, ${String(l.mapY)}`
                                : "—"}
                            </td>
                            <td className="text-end">
                              <div className="d-flex flex-wrap gap-1 justify-content-end">
                                <ForgePrintButton
                                  module="SANITATION"
                                  recordType="sanitation_location"
                                  recordId={String(l.id)}
                                  fieldValues={sanitationLocationPrintFieldValues(
                                    l as Record<string, unknown>,
                                  )}
                                  onPrepare={async () => {
                                    const result = await apiSend<Row>(
                                      `${API}/locations/${encodeURIComponent(String(l.id))}/qr`,
                                      "POST",
                                      {},
                                    );
                                    const qr = String(
                                      result.publicUrl ??
                                        result.url ??
                                        result.qrToken ??
                                        result.token ??
                                        "",
                                    );
                                    return qr ? { qr, qrPayload: qr } : {};
                                  }}
                                />
                                {canManage ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => {
                                        setPlacingLocationId(l.id);
                                        setTab("heatmap");
                                      }}
                                    >
                                      Edit map
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      disabled={busy}
                                      onClick={() => void generateLocationQr(l.id)}
                                    >
                                      Generate QR
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {qrTokenPreview ? (
                <div className="card-body border-top">
                  <div className="small text-muted">QR token</div>
                  <code className="small">{qrTokenPreview}</code>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {canManage ? (
          <form className="card" onSubmit={(ev) => void createLocation(ev)}>
            <div className="card-header">
              <h6 className="mb-0">Add sanitation place</h6>
            </div>
            <div className="card-body">
              <p className="small text-muted mb-3">
                Uses the selected Location and Area above. Leave name blank to use the Area name.
              </p>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="loc-name">
                    Place name
                  </label>
                  <input
                    id="loc-name"
                    className="form-control"
                    placeholder={selectedAreaDepartment?.label || departmentName || "Area name"}
                    value={locName}
                    onChange={(ev) => setLocName(ev.target.value)}
                    disabled={!siteId || !departmentId}
                  />
                </div>
                <div className="col-md-6 d-flex align-items-end">
                  <div className="form-check mb-2">
                    <input
                      id="loc-priority"
                      className="form-check-input"
                      type="checkbox"
                      checked={locPriority}
                      onChange={(ev) => setLocPriority(ev.target.checked)}
                      disabled={!siteId || !departmentId}
                    />
                    <label className="form-check-label" htmlFor="loc-priority">
                      Priority housekeeping
                    </label>
                  </div>
                </div>
                {locPriority ? (
                  <div className="col-12">
                    <input
                      className="form-control"
                      placeholder="Priority reason"
                      value={locPriorityReason}
                      onChange={(ev) => setLocPriorityReason(ev.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="card-footer">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !siteId || !departmentId}
              >
                Add place
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  } else if (tab === "pest") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">Pest devices</h5>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Type</th>
                      <th>Area</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pestDevices.length === 0 ? (
                      <EmptyRow colSpan={5} message="No devices." />
                    ) : (
                      pestDevices.map((d) => (
                        <tr key={d.id}>
                          <td>{String(d.deviceNumber ?? "—")}</td>
                          <td>{String(d.deviceType ?? "—")}</td>
                          <td>{String(d.area ?? "—")}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(String(d.status ?? ""))}`}>
                              {String(d.status ?? "—")}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <ForgePrintButton
                                module="SANITATION"
                                recordType="pest_device"
                                recordId={String(d.id)}
                                fieldValues={pestDevicePrintFieldValues(
                                  d as Record<string, unknown>,
                                )}
                                onPrepare={async () => {
                                  const result = await apiSend<Row>(
                                    `${API}/pest-devices/${encodeURIComponent(String(d.id))}/qr`,
                                    "POST",
                                    {},
                                  );
                                  const qr = String(
                                    result.publicUrl ??
                                      result.url ??
                                      result.qrToken ??
                                      result.token ??
                                      "",
                                  );
                                  return qr ? { qr, qrPayload: qr } : {};
                                }}
                              />
                              {canManage ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={busy}
                                    onClick={() => void generatePestQr(d.id)}
                                  >
                                    QR
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={busy}
                                    onClick={() => void updatePestStatus(d.id, "ACTIVE")}
                                  >
                                    Active
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-warning"
                                    disabled={busy}
                                    onClick={() => void updatePestStatus(d.id, "NEEDS_SERVICE")}
                                  >
                                    Needs service
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {canManage ? (
              <form className="card mt-3" onSubmit={(ev) => void createPestDevice(ev)}>
                <div className="card-header">
                  <h6 className="mb-0">Add device</h6>
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="pest-type">
                      Device type
                    </label>
                    <select
                      id="pest-type"
                      className="form-select"
                      value={pestDeviceType}
                      onChange={(ev) => setPestDeviceType(ev.target.value)}
                    >
                      <option value="TRAP">TRAP</option>
                      <option value="BAIT_STATION">BAIT_STATION</option>
                      <option value="LIGHT_TRAP">LIGHT_TRAP</option>
                      <option value="MONITOR">MONITOR</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="pest-area">
                      Area
                    </label>
                    <input
                      id="pest-area"
                      className="form-control"
                      value={pestDeviceArea}
                      onChange={(ev) => setPestDeviceArea(ev.target.value)}
                    />
                  </div>
                </div>
                <div className="card-footer">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                    Create device
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">Pest findings</h5>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Evidence</th>
                      <th>Status</th>
                      <th>Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pestFindings.length === 0 ? (
                      <EmptyRow colSpan={4} message="No pest findings." />
                    ) : (
                      pestFindings.map((f) => (
                        <tr key={f.id}>
                          <td>{String(f.pestCategory ?? "—")}</td>
                          <td>{String(f.evidence ?? "—")}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(String(f.status ?? ""))}`}>
                              {String(f.status ?? "—")}
                            </span>
                          </td>
                          <td>{fmtDate(f.observedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {canInspect || canReport ? (
              <form className="card mt-3" onSubmit={(ev) => void createPestFinding(ev)}>
                <div className="card-header">
                  <h6 className="mb-0">Record finding</h6>
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="pf-device">
                      Device
                    </label>
                    <select
                      id="pf-device"
                      className="form-select"
                      value={pestFindingDeviceId}
                      onChange={(ev) => setPestFindingDeviceId(ev.target.value)}
                    >
                      <option value="">None</option>
                      {pestDevices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {String(d.deviceNumber ?? d.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="pf-cat">
                      Category
                    </label>
                    <select
                      id="pf-cat"
                      className="form-select"
                      value={pestCategory}
                      onChange={(ev) => setPestCategory(ev.target.value)}
                    >
                      <option value="RODENT">RODENT</option>
                      <option value="INSECT">INSECT</option>
                      <option value="BIRD">BIRD</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="pf-ev">
                      Evidence
                    </label>
                    <textarea
                      id="pf-ev"
                      className="form-control"
                      rows={2}
                      value={pestEvidence}
                      onChange={(ev) => setPestEvidence(ev.target.value)}
                    />
                  </div>
                </div>
                <div className="card-footer">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                    Create finding
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    );
  } else if (tab === "chemicals") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Approved chemicals</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Manufacturer</th>
                  <th>Food contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {chemicals.length === 0 ? (
                  <EmptyRow colSpan={4} message="No chemicals." />
                ) : (
                  chemicals.map((c) => (
                    <tr key={c.id}>
                      <td>{String(c.name ?? "—")}</td>
                      <td>{String(c.manufacturer ?? "—")}</td>
                      <td>{c.foodContactApproved ? "Yes" : "No"}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(c.status ?? ""))}`}>
                          {String(c.status ?? "—")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {canManage ? (
          <form className="card" onSubmit={(ev) => void createChemical(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Add chemical</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="chem-name">
                    Name
                  </label>
                  <input
                    id="chem-name"
                    className="form-control"
                    required
                    value={chemName}
                    onChange={(ev) => setChemName(ev.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="chem-mfr">
                    Manufacturer
                  </label>
                  <input
                    id="chem-mfr"
                    className="form-control"
                    value={chemMfr}
                    onChange={(ev) => setChemMfr(ev.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="chem-use">
                    Intended use
                  </label>
                  <input
                    id="chem-use"
                    className="form-control"
                    value={chemUse}
                    onChange={(ev) => setChemUse(ev.target.value)}
                  />
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      id="chem-fc"
                      className="form-check-input"
                      type="checkbox"
                      checked={chemFoodContact}
                      onChange={(ev) => setChemFoodContact(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="chem-fc">
                      Food-contact approved
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Add chemical
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  } else if (tab === "compressed-air") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {airError ? (
          <div className="alert alert-warning mb-0" role="alert">
            {airError}
          </div>
        ) : null}
        {canInspect || canReport ? (
          <form className="card" onSubmit={(ev) => void createCompressedAir(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Request compressed-air cleaning</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="air-area">
                    Area identified
                  </label>
                  <input
                    id="air-area"
                    className="form-control"
                    required
                    value={airArea}
                    onChange={(ev) => setAirArea(ev.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="air-reason">
                    Cleaning reason
                  </label>
                  <input
                    id="air-reason"
                    className="form-control"
                    value={airReason}
                    onChange={(ev) => setAirReason(ev.target.value)}
                  />
                </div>
                <div className="col-12">
                  <div className="fw-medium mb-2">OSHA checklist</div>
                  <div className="d-flex flex-column gap-2">
                    {(
                      [
                        [
                          "airEquipment",
                          airEquipment,
                          setAirEquipment,
                          "Equipment status confirmed",
                        ],
                        ["airIgnition", airIgnition, setAirIgnition, "Ignition sources addressed"],
                        [
                          "airOtherIgnition",
                          airOtherIgnition,
                          setAirOtherIgnition,
                          "Other ignition controlled",
                        ],
                        ["airPpe", airPpe, setAirPpe, "PPE confirmed"],
                        ["airBarricaded", airBarricaded, setAirBarricaded, "Area barricaded"],
                        [
                          "airDustCollection",
                          airDustCollection,
                          setAirDustCollection,
                          "Dust collection reviewed",
                        ],
                      ] as const
                    ).map(([id, checked, setter, label]) => (
                      <div className="form-check" key={id}>
                        <input
                          id={id}
                          className="form-check-input"
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => setter(ev.target.checked)}
                        />
                        <label className="form-check-label" htmlFor={id}>
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Submit request
              </button>
            </div>
          </form>
        ) : null}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Compressed-air requests</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {compressedAir.length === 0 ? (
                  <EmptyRow colSpan={5} message="No compressed-air requests." />
                ) : (
                  compressedAir.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.requestNumber ?? "—")}</td>
                      <td>{String(row.areaIdentified ?? "—")}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      <td>{fmtDate(row.createdAt)}</td>
                      <td className="text-end">
                        <div className="d-flex flex-wrap gap-1 justify-content-end">
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                disabled={busy}
                                onClick={() => void airAction(row.id, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={busy}
                                onClick={() => void airAction(row.id, "deny")}
                              >
                                Deny
                              </button>
                            </>
                          ) : null}
                          {canClean || canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={busy}
                              onClick={() => void airAction(row.id, "complete")}
                            >
                              Complete
                            </button>
                          ) : null}
                          {canVerify || canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={busy}
                              onClick={() => void airAction(row.id, "verify")}
                            >
                              Verify
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "findings") {
    panel = (
      <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h5 className="card-title mb-0">Findings</h5>
          <select
            className="form-select form-select-sm w-auto"
            value={findingSeverity}
            onChange={(ev) => setFindingSeverity(ev.target.value)}
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            {FINDING_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="card-body pb-0">{siteCascade}</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.length === 0 ? (
                <EmptyRow colSpan={5} message="No findings." />
              ) : (
                filteredFindings.map((f) => (
                  <tr key={f.id}>
                    <td>{String(f.findingNumber ?? "—")}</td>
                    <td>{String(f.title ?? "—")}</td>
                    <td>
                      <span className={`badge ${severityBadgeClass(String(f.severity ?? ""))}`}>
                        {String(f.severity ?? "—")}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(String(f.status ?? ""))}`}>
                        {String(f.status ?? "—")}
                      </span>
                    </td>
                    <td>{fmtDate(f.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (tab === "verification") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="alert alert-info mb-0" role="note">
          Independent verification: the verifier should not be the same person who performed the
          cleaning when facility policy requires independent verification.
        </div>
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Recent verifications</h5>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={() => void withBusy(async () => loadVerifications())}
            >
              Refresh list
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Method</th>
                  <th>Result</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {verifications.length === 0 ? (
                  <EmptyRow colSpan={4} message="No verification records loaded." />
                ) : (
                  verifications.map((v) => (
                    <tr key={v.id}>
                      <td>{String(v.cleaningTaskId ?? v.taskTitle ?? "—")}</td>
                      <td>{String(v.method ?? "—")}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(v.result ?? ""))}`}>
                          {String(v.result ?? "—")}
                        </span>
                      </td>
                      <td>{fmtDate(v.verifiedAt ?? v.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <form className="card" onSubmit={(ev) => void submitVerification(ev)}>
          <div className="card-header">
            <h5 className="card-title mb-0">Submit verification</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="verify-task">
                  Awaiting-verification task
                </label>
                <select
                  id="verify-task"
                  className="form-select"
                  required
                  value={verifyTaskId}
                  onChange={(ev) => setVerifyTaskId(ev.target.value)}
                  disabled={!canVerify}
                >
                  <option value="">Select task</option>
                  {awaitingVerification.map((t) => (
                    <option key={t.id} value={t.id}>
                      {String(t.title ?? t.cleaningTask ?? t.id)}
                    </option>
                  ))}
                </select>
                {awaitingVerification.length === 0 ? (
                  <div className="form-text">No tasks currently awaiting verification.</div>
                ) : null}
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="verify-method">
                  Method
                </label>
                <select
                  id="verify-method"
                  className="form-select"
                  value={verifyMethod}
                  onChange={(ev) => setVerifyMethod(ev.target.value)}
                  disabled={!canVerify}
                >
                  <option value="VISUAL">VISUAL</option>
                  <option value="SWAB">SWAB</option>
                  <option value="ATP">ATP</option>
                  <option value="DOCUMENT_REVIEW">DOCUMENT_REVIEW</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="verify-result">
                  Result
                </label>
                <select
                  id="verify-result"
                  className="form-select"
                  value={verifyResult}
                  onChange={(ev) =>
                    setVerifyResult(ev.target.value as "PASS" | "FAIL" | "RECLEAN_REQUIRED")
                  }
                  disabled={!canVerify}
                >
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                  <option value="RECLEAN_REQUIRED">RECLEAN_REQUIRED</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="verify-notes">
                  Notes
                </label>
                <textarea
                  id="verify-notes"
                  className="form-control"
                  rows={3}
                  value={verifyNotes}
                  onChange={(ev) => setVerifyNotes(ev.target.value)}
                  disabled={!canVerify}
                />
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button type="submit" className="btn btn-primary" disabled={busy || !canVerify}>
              Submit verification
            </button>
          </div>
        </form>
      </div>
    );
  } else if (tab === "concerns") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        {canReport ? (
          <form className="card" onSubmit={(ev) => void reportConcern(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Report concern</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="concern-type">
                    Type
                  </label>
                  <select
                    id="concern-type"
                    className="form-select"
                    value={concernType}
                    onChange={(ev) => setConcernType(ev.target.value)}
                  >
                    {CONCERN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-8">
                  <label className="form-label" htmlFor="concern-desc">
                    Description
                  </label>
                  <input
                    id="concern-desc"
                    className="form-control"
                    value={concernDesc}
                    onChange={(ev) => setConcernDesc(ev.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Submit concern
              </button>
            </div>
          </form>
        ) : null}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Concerns</h5>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {concerns.length === 0 ? (
                  <EmptyRow colSpan={4} message="No concerns." />
                ) : (
                  concerns.map((c) => (
                    <tr key={c.id}>
                      <td>{String(c.concernType ?? "—")}</td>
                      <td>{String(c.description ?? "—")}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(String(c.status ?? ""))}`}>
                          {String(c.status ?? "—")}
                        </span>
                      </td>
                      <td>{fmtDate(c.reportedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "reports") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Print &amp; audit package</h5>
          </div>
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <label className="form-label" htmlFor="rpt-insp">
                  Inspection
                </label>
                <select
                  id="rpt-insp"
                  className="form-select"
                  value={reportInspectionId}
                  onChange={(ev) => setReportInspectionId(ev.target.value)}
                >
                  <option value="">Select inspection</option>
                  {inspections.map((row) => (
                    <option key={row.id} value={row.id}>
                      {String(row.inspectionNumber ?? row.title ?? row.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !reportInspectionId}
                  onClick={() => void printInspection(reportInspectionId)}
                >
                  Print selected inspection
                </button>
                {canReport ? (
                  <button
                    type="button"
                    className="btn btn-outline-primary ms-2"
                    disabled={
                      busy ||
                      String(
                        inspections.find((row) => row.id === reportInspectionId)?.status ?? "",
                      ).toUpperCase() !== "COMPLETED"
                    }
                    title="Only completed inspections can be emailed"
                    onClick={() => {
                      const row = inspections.find((r) => r.id === reportInspectionId);
                      if (!row) return;
                      setEmailPdfTarget({
                        id: row.id,
                        label: String(row.inspectionNumber ?? row.title ?? "Inspection"),
                      });
                    }}
                  >
                    Email PDF
                  </button>
                ) : null}
              </div>
            </div>
            <hr />
            <form
              className="row g-3 align-items-end"
              onSubmit={(ev) => void generateAuditPackage(ev)}
            >
              <div className="col-md-4">
                <label className="form-label" htmlFor="audit-from">
                  From
                </label>
                <input
                  id="audit-from"
                  type="date"
                  className="form-control"
                  value={auditFrom}
                  onChange={(ev) => setAuditFrom(ev.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="audit-to">
                  To
                </label>
                <input
                  id="audit-to"
                  type="date"
                  className="form-control"
                  value={auditTo}
                  onChange={(ev) => setAuditTo(ev.target.value)}
                />
              </div>
              <div className="col-md-4">
                <button type="submit" className="btn btn-outline-primary" disabled={busy}>
                  Generate Audit Package
                </button>
              </div>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">CSV exports</h5>
          </div>
          <div className="card-body d-flex flex-wrap gap-2">
            {(
              ["inspections", "findings", "dust", "mss", "cleaning", "pest", "spills"] as const
            ).map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={busy}
                onClick={() => void exportCsv(kind)}
              >
                Export {kind}
              </button>
            ))}
          </div>
          <div className="card-footer">
            <Link href="/reporting/library/?q=sanitation" className="btn btn-sm btn-link px-0">
              Open reporting library (sanitation)
            </Link>
          </div>
        </div>
      </div>
    );
  } else if (tab === "regulatory") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {regulatoryError ? (
          <div className="alert alert-warning mb-0" role="alert">
            {regulatoryError}
          </div>
        ) : null}
        <div className="card">
          <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h5 className="card-title mb-0">Regulatory library</h5>
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              placeholder="Search regulations…"
              value={regulatorySearch}
              onChange={(ev) => setRegulatorySearch(ev.target.value)}
              aria-label="Search regulations"
            />
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Citation</th>
                  <th>Title</th>
                  <th>Topic</th>
                </tr>
              </thead>
              <tbody>
                {regulatoryCombined.length === 0 ? (
                  <EmptyRow colSpan={4} message="No matching regulations." />
                ) : (
                  regulatoryCombined.map((row) => (
                    <tr key={row.code || row.citation}>
                      <td>{row.code || "—"}</td>
                      <td>{row.citation || "—"}</td>
                      <td>{row.title || "—"}</td>
                      <td className="small">{row.topic || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } else if (tab === "profile") {
    panel = (
      <div className="d-flex flex-column gap-3">
        {siteCascade}
        <form className="card" onSubmit={(ev) => void saveProfile(ev)}>
          <div className="card-header">
            <h5 className="card-title mb-0">Facility profile</h5>
          </div>
          <div className="card-body">
            {!siteId ? (
              <div className="alert alert-warning">
                Select a site to upsert its facility profile.
              </div>
            ) : null}
            <div className="mb-3">
              <div className="form-label">Facility types</div>
              <div className="row g-2">
                {FACILITY_TYPES.map((t) => (
                  <div className="col-md-4 col-lg-3" key={t}>
                    <div className="form-check">
                      <input
                        id={`ft-${t}`}
                        className="form-check-input"
                        type="checkbox"
                        checked={profileTypes.includes(t)}
                        disabled={!canManage}
                        onChange={() => setProfileTypes((prev) => toggleMulti(prev, t))}
                      />
                      <label className="form-check-label small" htmlFor={`ft-${t}`}>
                        {t}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <div className="form-label">Compliance frameworks</div>
              <div className="row g-2">
                {COMPLIANCE_FRAMEWORKS.map((f) => (
                  <div className="col-md-6" key={f}>
                    <div className="form-check">
                      <input
                        id={`fw-${f}`}
                        className="form-check-input"
                        type="checkbox"
                        checked={profileFrameworks.includes(f)}
                        disabled={!canManage}
                        onChange={() => setProfileFrameworks((prev) => toggleMulti(prev, f))}
                      />
                      <label className="form-check-label small" htmlFor={`fw-${f}`}>
                        {f}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label" htmlFor="profile-dust">
                  Dust action threshold (inches)
                </label>
                <input
                  id="profile-dust"
                  className="form-control"
                  type="number"
                  step="0.001"
                  min="0"
                  value={profileDustThreshold}
                  disabled={!canManage}
                  onChange={(ev) => setProfileDustThreshold(ev.target.value)}
                />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check">
                  <input
                    id="profile-phk"
                    className="form-check-input"
                    type="checkbox"
                    checked={profilePriorityHk}
                    disabled={!canManage}
                    onChange={(ev) => setProfilePriorityHk(ev.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="profile-phk">
                    Priority housekeeping enabled
                  </label>
                </div>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check">
                  <input
                    id="profile-iv"
                    className="form-check-input"
                    type="checkbox"
                    checked={profileIndepVerify}
                    disabled={!canManage}
                    onChange={(ev) => setProfileIndepVerify(ev.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="profile-iv">
                    Independent verification required
                  </label>
                </div>
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="profile-report-email">
                  Completed report email
                </label>
                <input
                  id="profile-report-email"
                  className="form-control"
                  type="email"
                  placeholder="reports@example.com"
                  value={profileCompletedReportEmail}
                  disabled={!canManage}
                  onChange={(ev) => setProfileCompletedReportEmail(ev.target.value)}
                />
                <div className="form-text">
                  When set, each completed sanitation inspection report is emailed here
                  automatically.
                </div>
              </div>
            </div>
            {profiles.length > 0 && siteId ? (
              <p className="small text-muted mt-3 mb-0">
                Existing profile for this site will be updated on save.
              </p>
            ) : null}
          </div>
          <div className="card-footer">
            <button type="submit" className="btn btn-primary" disabled={busy || !canManage}>
              Save profile
            </button>
          </div>
        </form>
      </div>
    );
  } else if (tab === "templates") {
    panel = (
      <div className="d-flex flex-column gap-3">
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Templates</h5>
            {canManage ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => void ensureBuiltinTemplates()}
              >
                Ensure builtin
              </button>
            ) : null}
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Sections</th>
                  <th>Questions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <EmptyRow colSpan={5} message="No templates. Use Ensure builtin to seed." />
                ) : (
                  templates.map((t) => {
                    const sections = sectionsFromTemplate(t);
                    const qCount = sections.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
                    return (
                      <tr key={t.id}>
                        <td>{String(t.code ?? "—")}</td>
                        <td>{String(t.name ?? "—")}</td>
                        <td>{String(t.category ?? "—")}</td>
                        <td>{sections.length}</td>
                        <td>{qCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="card-body border-top">
            <p className="small text-muted mb-0">
              Builtin catalog includes {BUILTIN_SANITATION_TEMPLATES.length} templates (daily, dust,
              GMP, pest, pre-op, and more). Ensure builtin posts them for this tenant when empty or
              incomplete.
            </p>
          </div>
        </div>
        {canManage ? (
          <form className="card" onSubmit={(ev) => void createTenantTemplate(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Create tenant template</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="tpl-name">
                    Name
                  </label>
                  <input
                    id="tpl-name"
                    className="form-control"
                    required
                    value={tplName}
                    onChange={(ev) => setTplName(ev.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="tpl-cat">
                    Category
                  </label>
                  <select
                    id="tpl-cat"
                    className="form-select"
                    value={tplCategory}
                    onChange={(ev) => setTplCategory(ev.target.value)}
                  >
                    <option value="GENERAL">GENERAL</option>
                    <option value="DUST">DUST</option>
                    <option value="PREOP">PREOP</option>
                    <option value="GMP">GMP</option>
                    <option value="PEST">PEST</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="tpl-json">
                    Sections JSON
                  </label>
                  <textarea
                    id="tpl-json"
                    className="form-control font-monospace"
                    rows={6}
                    value={tplSectionsJson}
                    onChange={(ev) => setTplSectionsJson(ev.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create template
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  } else if (tab === "settings") {
    panel = (
      <div className="d-flex flex-column gap-3">
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Sub-modules</h5>
          </div>
          <div className="card-body">
            <p className="text-muted small">
              Turn Sanitation sections on or off for this company. Settings stays available so you
              can turn sections back on.
            </p>
            {!canToggleSubmodules ? (
              <div className="alert alert-secondary mb-0" role="status">
                Only Tenant Admins and Creators can change sub-module visibility.
              </div>
            ) : (
              <ul className="list-group list-group-flush">
                {SANITATION_TOGGLEABLE_TABS.map((row) => {
                  const enabled = !disabledTabs.includes(row.id);
                  const inputId = `sanitation-submodule-${row.id}`;
                  return (
                    <li
                      key={row.id}
                      className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-0"
                    >
                      <div className="fw-semibold">{row.label}</div>
                      <div className="form-check form-switch m-0">
                        <input
                          id={inputId}
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={enabled}
                          disabled={submoduleBusy}
                          onChange={() => void toggleSubmodule(row.id, !enabled)}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${row.label}`}
                        />
                        <label className="form-check-label small text-muted" htmlFor={inputId}>
                          {submoduleBusy ? "Saving…" : enabled ? "On" : "Off"}
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">Sanitation settings & guidance</h5>
          </div>
          <div className="card-body">
            <h6>OSHA grain dust housekeeping</h6>
            <p>
              Priority housekeeping areas (for example floors within 35 ft of inside bucket
              elevators) generally use a <strong>1/8 inch (0.125 in)</strong> fugitive dust action
              level under OSHA 29 CFR 1910.272(j). Facility profiles can override the threshold via{" "}
              <code>dustActionThresholdInches</code>. Record measurements on the Dust tab;
              exceedances raise a CRITICAL_DUST_HOUSEKEEPING_ALERT and open a finding.
            </p>
            <h6>Offline authoring</h6>
            <p>
              Sanitation inspections and dust/spill reports are classified as offline-useful.
              Checklist responses autosave to <code>forge.sanitation.draft.{"{inspectionId}"}</code>{" "}
              when offline and sync when connectivity returns. Templates are offline-required for
              mill checklist work.
            </p>
            <h6>Compressed air controls</h6>
            <p>
              Compressed-air cleaning of grain dust can create ignition and inhalation hazards.
              Prefer vacuum or other controlled methods. Use the Compressed Air tab for OSHA
              checklist requests, approvals, completion, and verification.
            </p>
            <h6>Integration deep-links</h6>
            <ul className="mb-0">
              <li>
                <Link href="/modules/lockout-tagout">Lockout / Tagout</Link> — MSS can flag{" "}
                <code>lotoRequired</code> before energized equipment cleaning.
              </li>
              <li>
                <Link href="/modules/confined-space">Confined space</Link> — coordinate entry
                permits for bin/silo cleaning.
              </li>
              <li>
                <Link href="/modules/documents">Document control</Link> — SOPs and sanitation
                procedures.
              </li>
              <li>
                <Link href="/modules/inspections">Inspections</Link> — related industrial inspection
                workflows.
              </li>
              <li>
                Corrective actions — critical/major findings and dust exceedances create linked CA
                records.
              </li>
              <li>QR — locations and pest devices can generate tokens for field scan workflows.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="sanitation-title" data-walkthrough="sanitation">
      <ModuleWorkspaceHeader
        id="sanitation-title"
        title={moduleName}
        description="Grain facility sanitation & housekeeping"
        onRefresh={() =>
          void withBusy(async () => {
            await refreshAll();
          })
        }
        refreshing={busy}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      ) : null}
      {busy ? (
        <div className="alert alert-secondary" role="status">
          Loading…
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Sanitation sections"
      >
        {panel}
      </ModuleWorkspaceTabs>
      {emailPdfTarget ? (
        <SanitationEmailPdfDialog
          inspectionId={emailPdfTarget.id}
          inspectionLabel={emailPdfTarget.label}
          onClose={() => setEmailPdfTarget(null)}
        />
      ) : null}
    </section>
  );
}
