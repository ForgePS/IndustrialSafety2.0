import { INDUSTRIAL_MODULE_REGISTRY } from "@forge/contracts";
import { AnalyticsWorkspace } from "@/components/analytics-workspace";
import { ComplianceWorkspace } from "@/components/compliance-workspace";
import { EquipmentWorkspace } from "@/components/equipment-workspace";
import { HighRiskWorkspace } from "@/components/high-risk-workspace";
import { LotoWorkspace } from "@/components/loto-workspace";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { OpsModuleWorkspace } from "@/components/ops-module-workspace";
import { PersonnelWorkspace } from "@/components/personnel-workspace";
import { TrainingWorkspace } from "@/components/training-workspace";
import { isInd6ComplianceModule } from "@/lib/compliance-modules";
import { isInd5HighRiskModule } from "@/lib/high-risk-modules";
import { isInd3OpsModule } from "@/lib/ops-modules";
import { isInd7CoordinationModule } from "@/lib/coordination-modules";
import { TasksWorkspace } from "@/components/tasks-workspace";
import { MessagingWorkspace } from "@/components/messaging-workspace";
import { EmergencyResponseWorkspace } from "@/components/emergency-response-workspace";
import { QrLinksWorkspace } from "@/components/qr-links-workspace";
import { DocumentsWorkspace } from "@/components/documents-workspace";
import { ReportingWorkspace } from "@/components/reporting-workspace";
import { IndustrialImportWorkspace } from "@/components/industrial-import-workspace";

/** Static export params for SPA deep links (directory-index rewrite only). */
export function generateStaticParams() {
  const slugs = new Set<string>(["placeholder", "equipment", "loto", "personnel", "analytics"]);
  for (const m of INDUSTRIAL_MODULE_REGISTRY) {
    if (m.route.startsWith("/modules/")) {
      slugs.add(m.route.replace("/modules/", ""));
    }
  }
  return [...slugs].map((module) => ({ module }));
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const entry = INDUSTRIAL_MODULE_REGISTRY.find(
    (m) => m.route === `/modules/${module}` || m.code.toLowerCase().replace(/_/g, "-") === module,
  );
  const name = entry?.name ?? module;

  if (module === "analytics") {
    return <AnalyticsWorkspace moduleName={name} />;
  }
  if (module === "equipment") {
    return <EquipmentWorkspace moduleName={name} />;
  }
  if (module === "loto") {
    return <LotoWorkspace moduleName={name} />;
  }
  if (module === "personnel") {
    return <PersonnelWorkspace moduleName={name} />;
  }
  if (module === "training") {
    return <TrainingWorkspace moduleName={name} />;
  }
  if (module === "qr-links") {
    return <QrLinksWorkspace moduleName={name} />;
  }
  if (module === "documents") {
    return <DocumentsWorkspace moduleName={name} />;
  }
  if (module === "reporting") {
    return <ReportingWorkspace moduleName={name} />;
  }
  if (module === "import") {
    return <IndustrialImportWorkspace moduleName={name} />;
  }

  if (isInd5HighRiskModule(module)) {
    return <HighRiskWorkspace module={module} moduleName={name} />;
  }

  if (isInd6ComplianceModule(module)) {
    return <ComplianceWorkspace module={module} moduleName={name} />;
  }

  if (isInd7CoordinationModule(module)) {
    if (module === "tasks") return <TasksWorkspace moduleName={name} />;
    if (module === "messaging") return <MessagingWorkspace moduleName={name} />;
    return <EmergencyResponseWorkspace moduleName={name} />;
  }

  if (isInd3OpsModule(module)) {
    return <OpsModuleWorkspace module={module} moduleName={name} />;
  }

  return <ModuleUnavailable moduleName={name} status={entry?.migrationStatus ?? "LEGACY_FIREBASE"} />;
}
