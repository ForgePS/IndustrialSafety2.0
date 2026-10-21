import type { FieldMyWorkResult } from "@/lib/my-work";

export type HomeStatusCard = {
  id: string;
  label: string;
  count: number | null;
  href: string;
  tone?: "default" | "warn";
};

export type HomeQuickAction = {
  id: string;
  label: string;
  href: string;
};

/** Spec quick actions — gated by caller via permissions/modules. */
export const HOME_QUICK_ACTIONS: readonly HomeQuickAction[] = [
  { id: "scan", label: "Scan QR", href: "/scan/" },
  { id: "incident", label: "Report Incident", href: "/report/incident/" },
  { id: "observation", label: "Safety Observation", href: "/report/observation/" },
  { id: "inspection", label: "Start Inspection", href: "/inspection/new/" },
  { id: "inspections-hub", label: "My Inspections", href: "/inspections/" },
  { id: "jsa", label: "JSA", href: "/jsa/" },
  { id: "workflows", label: "Safety workflows", href: "/workflows/" },
  { id: "supplies", label: "Safety Supplies", href: "/more/safety-supplies/" },
] as const;

export function buildHomeStatusCards(data: FieldMyWorkResult | null): HomeStatusCard[] {
  const counts = data?.counts;
  return [
    {
      id: "tasks",
      label: "Tasks",
      count: counts ? counts.tasks : null,
      href: "/tasks/?filter=tasks",
    },
    {
      id: "training",
      label: "Training",
      count: counts ? counts.training : null,
      href: "/tasks/?filter=training",
    },
    {
      id: "corrective",
      label: "Corrective Actions",
      count: counts ? counts.correctiveActions : null,
      href: "/tasks/?filter=corrective_actions",
    },
    {
      id: "overdue",
      label: "Overdue",
      count: counts ? counts.overdue : null,
      href: "/tasks/?due=overdue",
      tone: counts && counts.overdue > 0 ? "warn" : "default",
    },
  ];
}

export function todayWorkItems(data: FieldMyWorkResult | null, limit = 5) {
  if (!data) return [];
  return data.items.slice(0, limit);
}
