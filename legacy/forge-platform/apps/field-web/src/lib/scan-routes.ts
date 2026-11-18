/**
 * Map industrial scan action hrefs / target types onto Forge Safety - Field Version routes.
 * Field never opens the desktop sidebar modules.
 */
import type { ScanAction, ScanPublicContext } from "./scan-public";

export function fieldHrefForScanAction(
  action: ScanAction,
  context: Pick<ScanPublicContext, "targetType" | "targetId" | "qrLinkId"> & {
    scanToken?: string | null;
  },
): string {
  const kind = action.kind ?? "navigate";
  if (kind === "start_inspection") {
    const params = new URLSearchParams();
    if (context.targetType) params.set("targetType", context.targetType);
    if (context.targetId) params.set("targetId", context.targetId);
    if (context.qrLinkId) params.set("qrLinkId", context.qrLinkId);
    if (context.scanToken) params.set("scanToken", context.scanToken);
    if (action.frequency) params.set("frequency", action.frequency);
    if (action.templateId) params.set("templateId", action.templateId);
    const qs = params.toString();
    return qs ? `/inspection/new/?${qs}` : "/inspection/new/";
  }
  if (kind === "report_issue") {
    const params = new URLSearchParams();
    if (context.qrLinkId) params.set("qrLinkId", context.qrLinkId);
    if (context.targetId) params.set("targetId", context.targetId);
    if (context.targetType) params.set("targetType", context.targetType);
    const qs = params.toString();
    return qs ? `/report/equipment/?${qs}` : "/report/equipment/";
  }

  return fieldHrefFromIndustrialPath(action.href, context);
}

export function fieldHrefFromIndustrialPath(
  href: string,
  context: Pick<ScanPublicContext, "targetType" | "targetId" | "qrLinkId">,
): string {
  const path = href.split("?")[0] ?? href;
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);

  if (path.startsWith("/modules/loto") || path.includes("lockout")) {
    const procedureId = params.get("procedureId") || params.get("id") || context.targetId || "";
    return procedureId ? `/loto/${encodeURIComponent(procedureId)}/` : "/more/loto/";
  }
  if (path.startsWith("/modules/jsas") || path.includes("/jsa")) {
    const recordId = params.get("recordId") || context.targetId || "";
    return recordId ? `/jsa/${encodeURIComponent(recordId)}/` : "/jsa/";
  }
  if (path.startsWith("/modules/chemical-safety") || path.toLowerCase().includes("sds")) {
    const recordId = params.get("recordId") || context.targetId || "";
    return recordId ? `/more/sds/?id=${encodeURIComponent(recordId)}` : "/more/sds/";
  }
  if (path.startsWith("/training") || path.includes("assignmentId")) {
    const assignmentId = params.get("assignmentId") || context.targetId || "";
    return assignmentId ? `/training/${encodeURIComponent(assignmentId)}/` : "/training/";
  }
  if (path.startsWith("/modules/fleet") || path.startsWith("/modules/forklifts")) {
    const vehicleId = params.get("vehicleId") || context.targetId || "";
    const kind = path.includes("forklift") ? "forklift" : "vehicle";
    if (vehicleId) {
      return `/equipment/${encodeURIComponent(vehicleId)}/?kind=${kind}`;
    }
    return kind === "forklift" ? "/forklifts/" : "/fleet/";
  }
  if (path.startsWith("/dvir/")) {
    const segment = path.replace(/^\/dvir\//, "").replace(/\/$/, "");
    const trip = params.get("tripType") || params.get("trip") || "";
    if (segment) {
      const qs = trip ? `?trip=${encodeURIComponent(trip)}` : "";
      // Public DVIR stickers use opaque tokens; Field authenticated form uses vehicle UUID.
      return `/dvir/${encodeURIComponent(segment)}/${qs}`;
    }
    return "/dot/";
  }
  if (path.startsWith("/modules/dot") || path.includes("dvir")) {
    const vehicleId = params.get("vehicleId") || context.targetId || "";
    const trip = params.get("tripType") || params.get("trip") || "";
    if (vehicleId) {
      const qs = trip ? `?trip=${encodeURIComponent(trip)}` : "";
      return `/dvir/${encodeURIComponent(vehicleId)}/${qs}`;
    }
    return "/dot/";
  }
  if (path.startsWith("/modules/inspections")) {
    return fieldHrefForScanAction(
      { id: "insp", label: "Inspection", href, kind: "start_inspection" },
      context,
    );
  }
  if (path.startsWith("/modules/safety-supplies")) {
    return safetySupplyHref(context.targetId, context.targetType);
  }
  if (path.startsWith("/modules/forms") || path.startsWith("/forms")) {
    const formId = params.get("formId") || params.get("id") || context.targetId || "";
    return formId ? `/forms/${encodeURIComponent(formId)}/` : "/forms/";
  }
  if (path.startsWith("/modules/equipment") || path.startsWith("/modules/documents")) {
    if (path.includes("document")) {
      const docId = params.get("documentId") || context.targetId || "";
      return docId ? `/forms/${encodeURIComponent(docId)}/?kind=document` : "/me/";
    }
    if (context.targetId) return `/equipment/${encodeURIComponent(context.targetId)}/`;
    return "/more/equipment/";
  }
  if (path.startsWith("/modules/personnel")) {
    return hubPathForTarget(context.targetType, context.targetId);
  }
  if (path.startsWith("/modules/emergency")) {
    const recordId = params.get("recordId") || params.get("id") || context.targetId || "";
    const alertId = params.get("alertId") || "";
    if (alertId || path.includes("alert")) {
      const id = alertId || recordId;
      return id ? `/more/emergency/?id=${encodeURIComponent(id)}&kind=alert` : "/more/emergency/";
    }
    if (recordId) {
      const category = params.get("category") || "eap";
      return `/more/emergency/?id=${encodeURIComponent(recordId)}&category=${encodeURIComponent(category)}`;
    }
    return "/more/emergency/";
  }
  if (path.startsWith("/modules/calendar") || path.startsWith("/calendar")) {
    const eventId = params.get("eventId") || params.get("id") || context.targetId || "";
    return eventId ? `/calendar/?eventId=${encodeURIComponent(eventId)}` : "/calendar/";
  }
  if (path.startsWith("/modules/reminders") || path.startsWith("/reminders")) {
    const reminderId = params.get("reminderId") || params.get("id") || context.targetId || "";
    return reminderId ? `/reminders/?reminderId=${encodeURIComponent(reminderId)}` : "/reminders/";
  }
  if (path.startsWith("/modules/messaging") || path.startsWith("/messaging")) {
    const threadId = params.get("thread") || params.get("threadId") || context.targetId || "";
    return threadId ? `/messaging/${encodeURIComponent(threadId)}/` : "/messaging/";
  }
  if (path.startsWith("/modules/tasks") || path.startsWith("/tasks")) {
    const taskId = params.get("taskId") || params.get("id") || context.targetId || "";
    return taskId ? `/tasks/item/${encodeURIComponent(taskId)}/` : "/tasks/";
  }
  if (path.startsWith("/modules/corrective") || path.startsWith("/corrective")) {
    const caId = params.get("id") || params.get("correctiveActionId") || context.targetId || "";
    return caId ? `/corrective/${encodeURIComponent(caId)}/` : "/tasks/?filter=corrective_actions";
  }
  if (path.startsWith("/modules/sanitation") || path.startsWith("/sanitation")) {
    return "/sanitation/";
  }

  return hubPathForTarget(context.targetType, context.targetId);
}

function safetySupplyHref(targetId?: string | null, targetType?: string | null): string {
  const params = new URLSearchParams();
  if (targetId) params.set("targetId", targetId);
  if (targetType) params.set("targetType", targetType);
  const qs = params.toString();
  return qs ? `/more/safety-supplies/?${qs}` : "/more/safety-supplies/";
}

export function hubPathForTarget(targetType?: string | null, targetId?: string | null): string {
  const id = targetId?.trim();
  const type = (targetType ?? "").toUpperCase().replace(/-/g, "_");
  switch (type) {
    case "EQUIPMENT":
    case "MACHINE":
    case "TOOL":
    case "ASSET":
      return id ? `/equipment/${encodeURIComponent(id)}/` : "/more/equipment/";
    case "VEHICLE":
      return id ? `/equipment/${encodeURIComponent(id)}/?kind=vehicle` : "/more/equipment/";
    case "FORKLIFT":
      return id ? `/equipment/${encodeURIComponent(id)}/?kind=forklift` : "/more/equipment/";
    case "LOTO_PROCEDURE":
      return id ? `/loto/${encodeURIComponent(id)}/` : "/more/loto/";
    case "TRAINING":
      return id ? `/training/${encodeURIComponent(id)}/` : "/training/";
    case "INSPECTION":
    case "INSPECTION_POINT":
      return id ? `/inspection/${encodeURIComponent(id)}/` : "/inspection/new/";
    case "JSA":
      return id ? `/jsa/${encodeURIComponent(id)}/` : "/jsa/";
    case "LOCATION":
    case "SITE":
      return id ? `/location/${encodeURIComponent(id)}/` : "/";
    case "DIVISION":
      return id ? `/location/${encodeURIComponent(id)}/?kind=division` : "/";
    case "DEPARTMENT":
      return id ? `/location/${encodeURIComponent(id)}/?kind=department` : "/";
    case "SAFETY_SUPPLY":
    case "SAFETY_SUPPLY_STATION":
    case "SUPPLY_ITEM":
    case "SUPPLY_LOCATION":
    case "SUPPLY_KIT":
    case "SUPPLY_SERIAL":
      return safetySupplyHref(id, type);
    case "FORM":
      return id ? `/forms/${encodeURIComponent(id)}/` : "/forms/";
    case "DOCUMENT":
      return id ? `/forms/${encodeURIComponent(id)}/?kind=document` : "/me/";
    case "SDS":
    case "CHEMICAL":
      return id ? `/more/sds/?id=${encodeURIComponent(id)}` : "/more/sds/";
    case "PERMIT":
    case "HOT_WORK":
      return "/more/permits/?type=hot-work";
    case "CONFINED_SPACE":
      return "/more/permits/?type=confined-space";
    case "WORKING_AT_HEIGHTS":
      return "/more/permits/?type=working-at-heights";
    case "ELECTRICAL":
    case "ELECTRICAL_SAFETY":
      return "/more/permits/?type=electrical-safety";
    case "EMERGENCY":
    case "EMERGENCY_ALERT":
      return id ? `/more/emergency/?id=${encodeURIComponent(id)}&kind=alert` : "/more/emergency/";
    case "EMERGENCY_PROCEDURE":
      return id ? `/more/emergency/?id=${encodeURIComponent(id)}&category=eap` : "/more/emergency/";
    case "EMPLOYEE":
    case "PERSONNEL":
      return "/me/";
    default:
      return id ? `/scan/` : "/";
  }
}

export function resourceTitle(context: ScanPublicContext): string {
  return context.asset?.label?.trim() || context.name?.trim() || "Scanned resource";
}

export function targetTypeLabel(targetType?: string | null): string {
  const type = (targetType ?? "").toUpperCase().replace(/-/g, "_");
  const labels: Record<string, string> = {
    EQUIPMENT: "Equipment",
    MACHINE: "Machine",
    TOOL: "Tool",
    ASSET: "Asset",
    VEHICLE: "Vehicle",
    FORKLIFT: "Forklift",
    LOCATION: "Location",
    SITE: "Location",
    DIVISION: "Division",
    DEPARTMENT: "Department",
    TRAINING: "Training",
    FORM: "Form",
    DOCUMENT: "Document",
    SDS: "SDS",
    LOTO_PROCEDURE: "LOTO",
    SAFETY_SUPPLY: "Safety Supply",
    SAFETY_SUPPLY_STATION: "Supply Station",
    SUPPLY_ITEM: "Supply Item",
    SUPPLY_LOCATION: "Supply Location",
    INSPECTION: "Inspection",
    INSPECTION_POINT: "Inspection Point",
    JSA: "JSA",
    PERMIT: "Permit",
    EMERGENCY: "Emergency",
    EMERGENCY_PROCEDURE: "Emergency Procedure",
    EMPLOYEE: "Employee",
    PERSONNEL: "Employee",
  };
  return labels[type] || type || "QR";
}

/** Whether resolving this QR should update Field org context. */
export function isOrgContextTarget(targetType?: string | null): boolean {
  const type = (targetType ?? "").toUpperCase().replace(/-/g, "_");
  return type === "LOCATION" || type === "SITE" || type === "DIVISION" || type === "DEPARTMENT";
}
