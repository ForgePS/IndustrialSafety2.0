/**
 * Personnel profile analytics — mirrors the legacy Firebase safety profile so
 * each section can list related records and deep-link into the owning module.
 */

export type ProfileActivityItem = {
  id: string;
  module: string;
  label: string;
  date: string;
  status?: string;
  /** Module list URL, optionally with a search hint for this record. */
  href: string;
};

export type ProfileMetric = {
  id: string;
  label: string;
  value: number;
  sub: string;
  href: string;
  /** Section that opens when the card is activated. */
  section: ProfileSectionId;
};

export type ProfileSectionId =
  | "incidents"
  | "observations"
  | "forms"
  | "training"
  | "certificates"
  | "qualifications"
  | "workers-comp"
  | "scans"
  | "overdue"
  | "activity"
  | "personnel-forms"
  | "attached-forms";

/** API breakdown of how observations move a person's safety score. */
export type ObservationScoreImpact = {
  deduction: number;
  credit: number;
  /** Unsafe observations where this person is marked at fault. */
  unsafeCount: number;
  unsafeOpen: number;
  positiveCount: number;
  daysClean: number | null;
  recoveryStep: 0 | 1 | 2 | 3;
};

/** e.g. "−6 from 2 at-fault observations · 34 clean days (⅓ restored)". */
export function describeObservationImpact(
  impact: ObservationScoreImpact | undefined,
): string | null {
  if (!impact || (impact.unsafeCount === 0 && impact.credit === 0)) return null;
  const parts: string[] = [];
  if (impact.unsafeCount > 0) {
    const pts = impact.deduction > 0 ? `−${impact.deduction}` : "0";
    parts.push(
      `${pts} from ${impact.unsafeCount} at-fault observation${impact.unsafeCount === 1 ? "" : "s"}`,
    );
    if (impact.daysClean !== null && impact.recoveryStep > 0) {
      const restored =
        impact.recoveryStep === 3 ? "fully restored" : `${impact.recoveryStep}/3 restored`;
      parts.push(`${impact.daysClean} clean days (${restored})`);
    }
  }
  if (impact.credit > 0) parts.push(`+${impact.credit} positive`);
  return parts.join(" · ");
}

/** Active disciplinary actions; only returned to users with discipline access. */
export type DisciplineScoreImpact = {
  deduction: number;
  activeCount: number;
  totalCount: number;
};

/** e.g. "−15 from 2 active actions". */
export function describeDisciplineImpact(impact: DisciplineScoreImpact | undefined): string | null {
  if (!impact || impact.activeCount === 0) return null;
  return `−${impact.deduction} from ${impact.activeCount} active action${impact.activeCount === 1 ? "" : "s"}`;
}

export type PersonnelProfileAnalytics = {
  personId: string;
  safetyScore: number;
  discipline?: DisciplineScoreImpact;
  incidents: {
    total: number;
    open: number;
    recordable: number;
    asSubject: number;
    asReporter: number;
    lastDate: string | null;
    items: ProfileActivityItem[];
  };
  observations: {
    total: number;
    open: number;
    lastDate: string | null;
    items: ProfileActivityItem[];
    scoreImpact?: ObservationScoreImpact;
  };
  forms: {
    total: number;
    submitted: number;
    drafts: number;
    lastDate: string | null;
    /** Available PDF / form templates for this org. */
    templates: ProfileActivityItem[];
    /** Submissions attached to this person. */
    submissions: ProfileActivityItem[];
  };
  training: {
    enrollments: number;
    completed: number;
    inProgress: number;
    overdue: number;
    openAssignments: number;
    certificates: number;
    expiringCertificates: number;
    lastActivityDate: string | null;
    items: ProfileActivityItem[];
  };
  qualifications: {
    total: number;
    active: number;
    expiringSoon: number;
    expired: number;
    items: ProfileActivityItem[];
  };
  workersComp: {
    total: number;
    open: number;
    lastDate: string | null;
    items: ProfileActivityItem[];
  };
  scanActivity: {
    completions: number;
    lastDate: string | null;
    items: ProfileActivityItem[];
  };
  recentActivity: ProfileActivityItem[];
};

export function emptyPersonnelProfileAnalytics(personId: string): PersonnelProfileAnalytics {
  return {
    personId,
    safetyScore: 100,
    incidents: {
      total: 0,
      open: 0,
      recordable: 0,
      asSubject: 0,
      asReporter: 0,
      lastDate: null,
      items: [],
    },
    observations: { total: 0, open: 0, lastDate: null, items: [] },
    forms: {
      total: 0,
      submitted: 0,
      drafts: 0,
      lastDate: null,
      templates: [],
      submissions: [],
    },
    training: {
      enrollments: 0,
      completed: 0,
      inProgress: 0,
      overdue: 0,
      openAssignments: 0,
      certificates: 0,
      expiringCertificates: 0,
      lastActivityDate: null,
      items: [],
    },
    qualifications: { total: 0, active: 0, expiringSoon: 0, expired: 0, items: [] },
    workersComp: { total: 0, open: 0, lastDate: null, items: [] },
    scanActivity: { completions: 0, lastDate: null, items: [] },
    recentActivity: [],
  };
}

export function computeSafetyScore(
  analytics: Omit<PersonnelProfileAnalytics, "personId" | "safetyScore">,
): number {
  let score = 100;
  score -= analytics.incidents.open * 12;
  score -= analytics.incidents.recordable * 8;
  score -= analytics.training.overdue * 6;
  score -= analytics.qualifications.expired * 5;
  score -= analytics.qualifications.expiringSoon * 2;
  score -= analytics.workersComp.open * 4;
  score += Math.min(analytics.training.completed * 2, 10);
  const impact = analytics.observations.scoreImpact;
  score += impact ? impact.credit - impact.deduction : Math.min(analytics.observations.total, 5);
  score -= analytics.discipline?.deduction ?? 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function latestIsoDate(values: Array<string | null | undefined>): string | null {
  const dates = values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "")
    .sort((a, b) => b.localeCompare(a));
  return dates[0] ?? null;
}

export function isPastDate(date: string | null | undefined, now = Date.now()): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  return !Number.isNaN(target) && target < now;
}

export function isExpiringSoon(
  date: string | null | undefined,
  withinDays = 30,
  now = Date.now(),
): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return false;
  const horizon = now + withinDays * 24 * 60 * 60 * 1000;
  return target >= now && target <= horizon;
}

export function moduleListHref(module: string, query?: string): string {
  const base = `/modules/${module}/`;
  if (!query || query.trim() === "") return base;
  return `${base}?q=${encodeURIComponent(query.trim())}`;
}

/** Open a specific submission in Forms fill view (not a search hint). */
export function formSubmissionHref(item: ProfileActivityItem): string {
  if (item.module !== "forms" || !item.id) return item.href;
  if (item.href.includes("submission=")) return item.href;
  const params = new URLSearchParams({ tab: "fill", submission: item.id });
  try {
    const existing = new URL(item.href, "https://local.invalid");
    const formId = existing.searchParams.get("form");
    if (formId) params.set("form", formId);
  } catch {
    // keep submission-only deep link
  }
  return `/modules/forms/?${params.toString()}`;
}

/** Forms this person finished or saved pending supervisor / EHS signatures. */
export function completedPersonnelForms(
  analytics: PersonnelProfileAnalytics,
): ProfileActivityItem[] {
  return analytics.forms.submissions.filter((item) => {
    const status = item.status?.trim().toLowerCase() ?? "";
    return (
      status.includes("submit") ||
      status === "complete" ||
      status === "completed" ||
      status === "pending_signature"
    );
  });
}

/** Metric cards shown in the Safety analytics grid. */
export function buildProfileMetrics(
  analytics: PersonnelProfileAnalytics,
  searchHint: string,
): ProfileMetric[] {
  return [
    {
      id: "incidents",
      label: "Incidents",
      value: analytics.incidents.total,
      sub: `${analytics.incidents.open} open`,
      href: moduleListHref("incidents", searchHint),
      section: "incidents",
    },
    {
      id: "observations",
      label: "Observations",
      value: analytics.observations.total,
      sub:
        analytics.observations.scoreImpact && analytics.observations.scoreImpact.unsafeCount > 0
          ? `${analytics.observations.open} open · ${analytics.observations.scoreImpact.unsafeCount} at fault`
          : `${analytics.observations.open} open`,
      href: moduleListHref("observations", searchHint),
      section: "observations",
    },
    {
      id: "forms",
      label: "Forms",
      value: analytics.forms.submitted,
      sub: `${analytics.forms.total} total`,
      href: moduleListHref("forms", searchHint),
      section: "attached-forms",
    },
    {
      id: "training",
      label: "Training",
      value: analytics.training.completed,
      sub: `${analytics.training.enrollments} enrollments`,
      href: moduleListHref("training", searchHint),
      section: "training",
    },
    {
      id: "certificates",
      label: "Certificates",
      value: analytics.training.certificates,
      sub: `${analytics.training.expiringCertificates} expiring`,
      href: moduleListHref("training", searchHint),
      section: "certificates",
    },
    {
      id: "qualifications",
      label: "Qualifications",
      value: analytics.qualifications.active,
      sub: `${analytics.qualifications.total} tracked`,
      href: moduleListHref("dot-compliance", searchHint),
      section: "qualifications",
    },
    {
      id: "workers-comp",
      label: "Workers' comp",
      value: analytics.workersComp.total,
      sub: `${analytics.workersComp.open} open`,
      href: moduleListHref("workers-comp", searchHint),
      section: "workers-comp",
    },
    {
      id: "scans",
      label: "Scan completions",
      value: analytics.scanActivity.completions,
      sub: analytics.scanActivity.lastDate ? "Recent activity" : "No scans yet",
      href: moduleListHref("scan", searchHint),
      section: "scans",
    },
    {
      id: "overdue",
      label: "Overdue training",
      value: analytics.training.overdue,
      sub: analytics.training.overdue > 0 ? "Needs attention" : "None overdue",
      href: moduleListHref("training", searchHint),
      section: "overdue",
    },
  ];
}

export function itemsForSection(
  analytics: PersonnelProfileAnalytics,
  section: ProfileSectionId,
): ProfileActivityItem[] {
  switch (section) {
    case "incidents":
      return analytics.incidents.items;
    case "observations":
      return analytics.observations.items;
    case "forms":
    case "attached-forms":
      return analytics.forms.submissions;
    case "personnel-forms":
      return completedPersonnelForms(analytics);
    case "training":
    case "certificates":
    case "overdue":
      return analytics.training.items;
    case "qualifications":
      return analytics.qualifications.items;
    case "workers-comp":
      return analytics.workersComp.items;
    case "scans":
      return analytics.scanActivity.items;
    case "activity":
      return analytics.recentActivity;
    default:
      return [];
  }
}

export function sectionTitle(section: ProfileSectionId): string {
  switch (section) {
    case "incidents":
      return "Incident involvement";
    case "observations":
      return "Observations";
    case "forms":
    case "attached-forms":
      return "Attached forms";
    case "personnel-forms":
      return "Personnel forms";
    case "training":
      return "Training records";
    case "certificates":
      return "Certificates";
    case "overdue":
      return "Overdue training";
    case "qualifications":
      return "Training & qualifications";
    case "workers-comp":
      return "Workers' compensation";
    case "scans":
      return "Scan completions";
    case "activity":
      return "Recent activity";
    default:
      return "Related records";
  }
}
