/**
 * Dataset / field registry for the Reporting Center builder.
 * Derived from builtin catalog + known adapter columns (code registry, no DDL).
 */

import { WC_WEEKLY_STATUS_REPORT_COLUMNS } from "../industrial/workers-comp-helpers.js";
import { BUILTIN_REPORTS, type BuiltinReportMeta } from "./reporting-catalog.js";

export type ReportDatasetField = { key: string; label: string };

export type ReportDataset = {
  key: string;
  name: string;
  description: string;
  category: string;
  module: string;
  reportType: BuiltinReportMeta["reportType"];
  tags: string[];
  fields: ReportDatasetField[];
  supportsGroupBy: boolean;
};

const FIELD_MAP: Record<string, ReportDatasetField[]> = {
  "incidents.summary": [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "siteId", label: "Site" },
    { key: "createdAt", label: "Created" },
  ],
  "incidents.by_location": [
    { key: "location", label: "Location" },
    { key: "count", label: "Count" },
  ],
  "incidents.near_miss": [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created" },
  ],
  "training.completion": [
    { key: "course", label: "Course" },
    { key: "person", label: "Person" },
    { key: "status", label: "Status" },
    { key: "completedAt", label: "Completed" },
  ],
  "personnel.roster": [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "status", label: "Status" },
  ],
  "safety.monthly_stats": [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
  ],
  "capa.open": [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "dueDate", label: "Due date" },
  ],
  "fleet.assets": [
    { key: "unitNumber", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "assetType", label: "Type" },
  ],
  "workers_comp.open_cases": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "status", label: "Status" },
    { key: "workflowStage", label: "Stage" },
    { key: "severity", label: "Severity" },
    { key: "dateOfInjury", label: "Date of injury" },
    { key: "daysAway", label: "Days away" },
    { key: "restrictedDays", label: "Restricted days" },
    { key: "carrierName", label: "Carrier" },
  ],
  "workers_comp.weekly_status": WC_WEEKLY_STATUS_REPORT_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
  })),
  "workers_comp.by_status": [
    { key: "status", label: "Status" },
    { key: "count", label: "Count" },
  ],
  "workers_comp.lost_time": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "status", label: "Status" },
    { key: "severity", label: "Severity" },
    { key: "daysAway", label: "Days away" },
    { key: "dateOfInjury", label: "Date of injury" },
    { key: "carrierName", label: "Carrier" },
  ],
  "workers_comp.restricted_duty": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "status", label: "Status" },
    { key: "restrictedDays", label: "Restricted days" },
    { key: "activeRestrictions", label: "Active restrictions" },
    { key: "bodyParts", label: "Body parts" },
  ],
  "workers_comp.work_status_history": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "caseStatus", label: "Case status" },
    { key: "workStatus", label: "Work status" },
    { key: "startDate", label: "Start" },
    { key: "endDate", label: "End" },
    { key: "notes", label: "Notes" },
  ],
  "workers_comp.claims_summary": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "carrierName", label: "Carrier" },
    { key: "adjuster", label: "Adjuster" },
    { key: "bodyParts", label: "Body parts" },
    { key: "dateOfInjury", label: "Date of injury" },
    { key: "claimNotes", label: "Claim notes" },
    { key: "status", label: "Status" },
  ],
  "workers_comp.medical_encounters": [
    { key: "caseNumber", label: "Claim #" },
    { key: "workerName", label: "Employee" },
    { key: "appointmentDate", label: "Date" },
    { key: "provider", label: "Provider" },
    { key: "providerSpecialty", label: "Specialty" },
    { key: "diagnosis", label: "Diagnosis" },
    { key: "treatment", label: "Treatment" },
    { key: "medication", label: "Medication" },
    { key: "symptoms", label: "Symptoms" },
    { key: "examFindings", label: "Exam findings" },
    { key: "assessment", label: "Assessment" },
    { key: "notes", label: "Notes" },
  ],
  "loto.procedures_inventory": [
    { key: "procedureNumber", label: "Procedure #" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "siteName", label: "Location" },
    { key: "departmentName", label: "Department" },
    { key: "areaName", label: "Area" },
    { key: "equipmentName", label: "Equipment" },
    { key: "revision", label: "Revision" },
    { key: "reviewDueAt", label: "Review due" },
    { key: "updatedAt", label: "Updated" },
  ],
  "loto.procedures_by_status": [
    { key: "status", label: "Status" },
    { key: "count", label: "Count" },
  ],
  "loto.procedures_by_location": [
    { key: "siteName", label: "Location" },
    { key: "departmentName", label: "Department" },
    { key: "count", label: "Count" },
  ],
  "loto.procedure_review_due": [
    { key: "procedureNumber", label: "Procedure #" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "siteName", label: "Location" },
    { key: "departmentName", label: "Department" },
    { key: "reviewDueAt", label: "Review due" },
    { key: "daysOverdue", label: "Days overdue" },
    { key: "updatedAt", label: "Updated" },
  ],
  "loto.open_lockouts": [
    { key: "title", label: "Lockout" },
    { key: "status", label: "Status" },
    { key: "procedureNumber", label: "Procedure #" },
    { key: "equipmentName", label: "Equipment" },
    { key: "authorizedEmployee", label: "Authorized employee" },
    { key: "siteName", label: "Location" },
    { key: "issuedAt", label: "Issued" },
    { key: "dueDate", label: "Due" },
  ],
  "loto.lockout_history": [
    { key: "title", label: "Lockout" },
    { key: "status", label: "Status" },
    { key: "procedureNumber", label: "Procedure #" },
    { key: "equipmentName", label: "Equipment" },
    { key: "authorizedEmployee", label: "Authorized employee" },
    { key: "siteName", label: "Location" },
    { key: "issuedAt", label: "Issued" },
    { key: "verifiedAt", label: "Verified" },
    { key: "closedAt", label: "Closed" },
    { key: "dueDate", label: "Due" },
  ],
  "loto.energy_type_coverage": [
    { key: "energyType", label: "Energy type" },
    { key: "sourceCount", label: "Sources" },
    { key: "procedureCount", label: "Procedures" },
  ],
  "sanitation.inspections": [
    { key: "inspectionNumber", label: "Inspection #" },
    { key: "title", label: "Title" },
    { key: "inspectionType", label: "Type" },
    { key: "status", label: "Status" },
    { key: "complianceStatus", label: "Compliance" },
    { key: "scorePercent", label: "Score" },
    { key: "siteName", label: "Site" },
    { key: "completedAt", label: "Completed" },
  ],
  "sanitation.findings_open": [
    { key: "findingNumber", label: "Finding #" },
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status" },
    { key: "locationName", label: "Location" },
    { key: "siteName", label: "Site" },
    { key: "isRecurring", label: "Recurring" },
    { key: "createdAt", label: "Created" },
  ],
  "sanitation.dust_alerts": [
    { key: "measurementNumber", label: "Measurement #" },
    { key: "dustDepthInches", label: "Depth (in)" },
    { key: "actionThresholdInches", label: "Threshold" },
    { key: "isPriorityArea", label: "Priority area" },
    { key: "locationName", label: "Location" },
    { key: "siteName", label: "Site" },
    { key: "measuredAt", label: "Measured" },
  ],
  "sanitation.mss_completion": [
    { key: "title", label: "Title" },
    { key: "cleaningTask", label: "Task" },
    { key: "frequency", label: "Frequency" },
    { key: "nextDueAt", label: "Next due" },
    { key: "lastCompletedAt", label: "Last completed" },
    { key: "status", label: "Status" },
    { key: "siteName", label: "Site" },
  ],
  "sanitation.cleaning_overdue": [
    { key: "taskNumber", label: "Task #" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "dueAt", label: "Due" },
    { key: "siteName", label: "Site" },
  ],
  "sanitation.pest_activity": [
    { key: "pestCategory", label: "Category" },
    { key: "pestSpecies", label: "Species" },
    { key: "activityLevel", label: "Activity" },
    { key: "status", label: "Status" },
    { key: "locationName", label: "Location" },
    { key: "siteName", label: "Site" },
    { key: "observedAt", label: "Observed" },
  ],
  "sanitation.spills": [
    { key: "spillNumber", label: "Spill #" },
    { key: "product", label: "Product" },
    { key: "status", label: "Status" },
    { key: "slipFallHazard", label: "Slip/fall" },
    { key: "dustHazard", label: "Dust hazard" },
    { key: "siteName", label: "Site" },
    { key: "reportedAt", label: "Reported" },
  ],
};

const GROUPABLE = new Set([
  "workers_comp.by_status",
  "workers_comp.open_cases",
  "workers_comp.lost_time",
  "incidents.summary",
  "incidents.near_miss",
  "capa.open",
  "observations.summary",
  "loto.procedures_by_status",
  "loto.procedures_by_location",
  "loto.procedures_inventory",
  "loto.open_lockouts",
  "loto.lockout_history",
  "loto.energy_type_coverage",
  "sanitation.inspections",
  "sanitation.findings_open",
  "sanitation.dust_alerts",
  "sanitation.mss_completion",
  "sanitation.cleaning_overdue",
  "sanitation.pest_activity",
  "sanitation.spills",
]);

function fieldsFor(meta: BuiltinReportMeta): ReportDatasetField[] {
  return (
    FIELD_MAP[meta.key] ?? [
      { key: "id", label: "Id" },
      { key: "status", label: "Status" },
    ]
  );
}

export function listReportDatasets(): ReportDataset[] {
  return BUILTIN_REPORTS.map((meta) => ({
    key: meta.key,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    module: meta.module,
    reportType: meta.reportType,
    tags: [...meta.tags],
    fields: fieldsFor(meta),
    supportsGroupBy: GROUPABLE.has(meta.key),
  }));
}

export function getReportDataset(key: string): ReportDataset | undefined {
  return listReportDatasets().find((d) => d.key === key);
}

export function getReportDatasetFields(key: string): ReportDatasetField[] {
  return getReportDataset(key)?.fields ?? [];
}
