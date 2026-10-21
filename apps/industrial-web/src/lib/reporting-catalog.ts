/**
 * Built-in Reporting V1 catalog seed (vision §9–§27 subset).
 * Server registry will replace this when the Reporting Engine lands.
 */

export type ReportCategory =
  | "Safety"
  | "Incidents"
  | "Inspections"
  | "Training"
  | "Personnel"
  | "DOT"
  | "Fleet"
  | "Equipment"
  | "Inventory"
  | "Corrective Actions"
  | "Compliance"
  | "Observations"
  | "JSAs"
  | "WorkersComp"
  | "LOTO"
  | "Sanitation";

export type BuiltInReport = {
  id: string;
  key: string;
  name: string;
  description: string;
  module: string;
  category: ReportCategory;
  reportType: "standard" | "compliance" | "operational";
  tags: string[];
};

export const BUILT_IN_REPORTS: readonly BuiltInReport[] = [
  {
    id: "rpt-incidents-summary",
    key: "incidents.summary",
    name: "Incident Summary",
    description: "Incident counts by type, severity, and status for a date range.",
    module: "Incidents",
    category: "Incidents",
    reportType: "standard",
    tags: ["incidents", "safety"],
  },
  {
    id: "rpt-incidents-by-location",
    key: "incidents.by_location",
    name: "Incidents by Location",
    description: "Incident volume grouped by site and department.",
    module: "Incidents",
    category: "Incidents",
    reportType: "operational",
    tags: ["incidents", "location"],
  },
  {
    id: "rpt-near-miss",
    key: "incidents.near_miss",
    name: "Near Miss Report",
    description: "Near-miss events with contributing factors.",
    module: "Incidents",
    category: "Incidents",
    reportType: "standard",
    tags: ["near-miss", "prevention"],
  },
  {
    id: "rpt-osha-300",
    key: "compliance.osha_300",
    name: "OSHA 300 Log",
    description: "Recordable injury and illness log for the selected year.",
    module: "OSHA",
    category: "Compliance",
    reportType: "compliance",
    tags: ["osha", "recordkeeping"],
  },
  {
    id: "rpt-osha-300a",
    key: "compliance.osha_300a",
    name: "OSHA 300A Summary",
    description: "Annual summary of work-related injuries and illnesses.",
    module: "OSHA",
    category: "Compliance",
    reportType: "compliance",
    tags: ["osha", "annual"],
  },
  {
    id: "rpt-training-completion",
    key: "training.completion",
    name: "Training Completion",
    description: "Assignment completion rates by course and person.",
    module: "Training",
    category: "Training",
    reportType: "standard",
    tags: ["training", "compliance"],
  },
  {
    id: "rpt-training-expiring",
    key: "training.expiring",
    name: "Expiring Certifications",
    description: "Certifications and training due within the next 30/60/90 days.",
    module: "Training",
    category: "Training",
    reportType: "operational",
    tags: ["training", "expiration"],
  },
  {
    id: "rpt-personnel-roster",
    key: "personnel.roster",
    name: "Personnel Roster",
    description: "Active personnel with location, department, and role.",
    module: "Personnel",
    category: "Personnel",
    reportType: "standard",
    tags: ["personnel", "roster"],
  },
  {
    id: "rpt-inspections-open",
    key: "inspections.open_findings",
    name: "Open Inspection Findings",
    description: "Open and overdue inspection findings by severity.",
    module: "Inspections",
    category: "Inspections",
    reportType: "operational",
    tags: ["inspections", "findings"],
  },
  {
    id: "rpt-inspections-completion",
    key: "inspections.completion",
    name: "Inspection Completion",
    description: "Completed vs planned inspections for the period.",
    module: "Inspections",
    category: "Inspections",
    reportType: "standard",
    tags: ["inspections"],
  },
  {
    id: "rpt-capa-open",
    key: "capa.open",
    name: "Open Corrective Actions",
    description: "Open CAPAs with owner, due date, and status.",
    module: "Corrective Actions",
    category: "Corrective Actions",
    reportType: "operational",
    tags: ["capa", "actions"],
  },
  {
    id: "rpt-capa-overdue",
    key: "capa.overdue",
    name: "Overdue Corrective Actions",
    description: "CAPAs past due date, prioritized by risk.",
    module: "Corrective Actions",
    category: "Corrective Actions",
    reportType: "operational",
    tags: ["capa", "overdue"],
  },
  {
    id: "rpt-fleet-assets",
    key: "fleet.assets",
    name: "Fleet Asset List",
    description: "Active fleet assets with status and assignment.",
    module: "Fleet",
    category: "Fleet",
    reportType: "standard",
    tags: ["fleet", "assets"],
  },
  {
    id: "rpt-fleet-dvir",
    key: "fleet.dvir_summary",
    name: "DVIR Summary",
    description: "Driver vehicle inspection report outcomes and defects.",
    module: "Fleet",
    category: "Fleet",
    reportType: "operational",
    tags: ["fleet", "dvir"],
  },
  {
    id: "rpt-dot-dq",
    key: "dot.driver_qualification",
    name: "Driver Qualification Status",
    description: "DOT driver qualification file completeness and expirations.",
    module: "DOT Compliance",
    category: "DOT",
    reportType: "compliance",
    tags: ["dot", "dqf"],
  },
  {
    id: "rpt-dot-medical",
    key: "dot.medical_card",
    name: "Medical Card Expiration",
    description: "Drivers with medical cards expiring soon or expired.",
    module: "DOT Compliance",
    category: "DOT",
    reportType: "compliance",
    tags: ["dot", "medical"],
  },
  {
    id: "rpt-equipment-status",
    key: "equipment.status",
    name: "Equipment Status",
    description: "Assets and equipment by operational status.",
    module: "Assets & Equipment",
    category: "Equipment",
    reportType: "standard",
    tags: ["equipment"],
  },
  {
    id: "rpt-inventory-on-hand",
    key: "supplies.on_hand",
    name: "Inventory On Hand",
    description: "Safety supply quantities by location and item.",
    module: "Safety Supplies",
    category: "Inventory",
    reportType: "operational",
    tags: ["inventory", "ppe"],
  },
  {
    id: "rpt-observations-summary",
    key: "observations.summary",
    name: "Observation Summary",
    description: "Safety observations by type and outcome.",
    module: "Observations",
    category: "Observations",
    reportType: "standard",
    tags: ["observations"],
  },
  {
    id: "rpt-jsa-status",
    key: "jsa.status",
    name: "JSA Status",
    description: "Job safety analyses by status and owner.",
    module: "JSAs",
    category: "JSAs",
    reportType: "standard",
    tags: ["jsa"],
  },
  {
    id: "rpt-safety-monthly",
    key: "safety.monthly_stats",
    name: "Monthly Safety Statistics",
    description: "High-level safety KPIs for the selected month.",
    module: "Analytics",
    category: "Safety",
    reportType: "standard",
    tags: ["safety", "kpi"],
  },
  {
    id: "rpt-wc-open-cases",
    key: "workers_comp.open_cases",
    name: "Open Workers' Comp Cases",
    description: "Open and active workers' compensation cases with claim and duty status.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "operational",
    tags: ["workers-comp", "open", "claims"],
  },
  {
    id: "rpt-wc-weekly-status",
    key: "workers_comp.weekly_status",
    name: "Workers' Comp Weekly Status",
    description:
      "Open cases with status, injury, location, days away / restricted, and this week's Thursday notes. Scheduled runs email the weekly status digest.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "operational",
    tags: ["workers-comp", "weekly", "status", "email"],
  },
  {
    id: "rpt-wc-by-status",
    key: "workers_comp.by_status",
    name: "Workers' Comp by Status",
    description: "Case counts grouped by status for a date range.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "standard",
    tags: ["workers-comp", "status", "kpi"],
  },
  {
    id: "rpt-wc-lost-time",
    key: "workers_comp.lost_time",
    name: "Lost-Time Cases",
    description: "Cases with lost time (days away or LOST_TIME status).",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "operational",
    tags: ["workers-comp", "lost-time"],
  },
  {
    id: "rpt-wc-restricted",
    key: "workers_comp.restricted_duty",
    name: "Restricted Duty Cases",
    description: "Restricted-duty cases with active restriction summaries.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "operational",
    tags: ["workers-comp", "restricted"],
  },
  {
    id: "rpt-wc-work-status",
    key: "workers_comp.work_status_history",
    name: "Work Status History",
    description: "Work-status periods joined to workers' compensation cases.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "standard",
    tags: ["workers-comp", "work-status"],
  },
  {
    id: "rpt-wc-claims",
    key: "workers_comp.claims_summary",
    name: "Claims Summary",
    description: "Claim number, carrier, adjuster, body parts, and date of injury.",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "standard",
    tags: ["workers-comp", "claims"],
  },
  {
    id: "rpt-wc-medical",
    key: "workers_comp.medical_encounters",
    name: "Medical Encounters",
    description: "Medical encounter rows for workers' compensation cases (medical permission required).",
    module: "Workers' Comp",
    category: "WorkersComp",
    reportType: "compliance",
    tags: ["workers-comp", "medical"],
  },
  {
    id: "rpt-loto-inventory",
    key: "loto.procedures_inventory",
    name: "LOTO Procedure Inventory",
    description: "All lockout procedures with status, site, department, area, and equipment.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "operational",
    tags: ["loto", "procedures", "inventory"],
  },
  {
    id: "rpt-loto-by-status",
    key: "loto.procedures_by_status",
    name: "LOTO Procedures by Status",
    description: "Procedure counts grouped by status for a date range.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "standard",
    tags: ["loto", "status", "kpi"],
  },
  {
    id: "rpt-loto-by-location",
    key: "loto.procedures_by_location",
    name: "LOTO Procedures by Location",
    description: "Procedure volume grouped by site and department.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "operational",
    tags: ["loto", "location", "department"],
  },
  {
    id: "rpt-loto-review-due",
    key: "loto.procedure_review_due",
    name: "LOTO Review Due",
    description: "Procedures in review or past / approaching review due date.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "compliance",
    tags: ["loto", "review", "aging"],
  },
  {
    id: "rpt-loto-open-lockouts",
    key: "loto.open_lockouts",
    name: "Open Lockouts",
    description: "Issued and verified lockouts that are still open.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "operational",
    tags: ["loto", "lockouts", "open"],
  },
  {
    id: "rpt-loto-lockout-history",
    key: "loto.lockout_history",
    name: "Lockout History",
    description: "Lockout records by date, employee, equipment, and procedure.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "standard",
    tags: ["loto", "lockouts", "history"],
  },
  {
    id: "rpt-loto-energy-coverage",
    key: "loto.energy_type_coverage",
    name: "LOTO Energy Type Coverage",
    description: "Energy types used across procedures and how many procedures cover each type.",
    module: "Lockout / Tagout",
    category: "LOTO",
    reportType: "standard",
    tags: ["loto", "energy", "coverage"],
  },
  {
    id: "rpt-sanitation-inspections",
    key: "sanitation.inspections",
    name: "Sanitation Inspections",
    description: "Sanitation inspections by status, type, score, and site for a date range.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "operational",
    tags: ["sanitation", "inspections"],
  },
  {
    id: "rpt-sanitation-findings",
    key: "sanitation.findings",
    name: "Sanitation Findings",
    description: "Open and historical sanitation findings by severity and category.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "operational",
    tags: ["sanitation", "findings"],
  },
  {
    id: "rpt-sanitation-dust",
    key: "sanitation.dust",
    name: "Dust Housekeeping Measurements",
    description: "Grain dust depth measurements with action-level exceedances.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "compliance",
    tags: ["sanitation", "dust", "osha"],
  },
  {
    id: "rpt-sanitation-mss",
    key: "sanitation.mss",
    name: "Master Sanitation Schedule",
    description: "MSS entries with frequency, next due, and completion status.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "operational",
    tags: ["sanitation", "mss", "schedule"],
  },
  {
    id: "rpt-sanitation-cleaning",
    key: "sanitation.cleaning",
    name: "Cleaning Tasks",
    description: "Cleaning task completion, overdue, and verification status.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "operational",
    tags: ["sanitation", "cleaning"],
  },
  {
    id: "rpt-sanitation-pest",
    key: "sanitation.pest",
    name: "Pest Control Activity",
    description: "Pest devices and findings for the selected period.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "compliance",
    tags: ["sanitation", "pest"],
  },
  {
    id: "rpt-sanitation-spills",
    key: "sanitation.spills",
    name: "Grain Spills",
    description: "Spill reports by status, area, and hazard flags.",
    module: "Sanitation",
    category: "Sanitation",
    reportType: "operational",
    tags: ["sanitation", "spills"],
  },
] as const;

export type ReportingCatalogFilters = {
  search?: string;
  category?: string;
  module?: string;
  reportType?: string;
};

export function listReportCategories(reports: readonly BuiltInReport[] = BUILT_IN_REPORTS): string[] {
  return [...new Set(reports.map((r) => r.category))].sort((a, b) => a.localeCompare(b));
}

export function listReportModules(reports: readonly BuiltInReport[] = BUILT_IN_REPORTS): string[] {
  return [...new Set(reports.map((r) => r.module))].sort((a, b) => a.localeCompare(b));
}

export function filterBuiltInReports(
  reports: readonly BuiltInReport[],
  filters: ReportingCatalogFilters,
): BuiltInReport[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const category = filters.category?.trim() ?? "";
  const module = filters.module?.trim() ?? "";
  const reportType = filters.reportType?.trim() ?? "";

  return reports.filter((report) => {
    if (category && report.category !== category) return false;
    if (module && report.module !== module) return false;
    if (reportType && report.reportType !== reportType) return false;
    if (!search) return true;
    const haystack = [
      report.name,
      report.description,
      report.module,
      report.category,
      report.key,
      ...report.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function sortBuiltInReports(
  reports: BuiltInReport[],
  sortBy: "name" | "module" | "category" = "name",
): BuiltInReport[] {
  const copy = [...reports];
  copy.sort((a, b) => {
    const left = a[sortBy];
    const right = b[sortBy];
    const cmp = left.localeCompare(right);
    return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
  });
  return copy;
}
