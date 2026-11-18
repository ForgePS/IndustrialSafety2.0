/** IND-6 compliance and facility-safety modules with AWS workspace UIs. */
export const IND6_COMPLIANCE_MODULES = [
  "dot-compliance",
  "forklifts",
  "workers-comp",
  "osha",
  "risk",
  "chemical-safety",
  "warehouse-safety",
  "manufacturing-safety",
  "contractor-safety",
  "process-safety",
  "environmental-safety",
] as const;

export type Ind6ComplianceModule = (typeof IND6_COMPLIANCE_MODULES)[number];

export function isInd6ComplianceModule(module: string): module is Ind6ComplianceModule {
  return (IND6_COMPLIANCE_MODULES as readonly string[]).includes(module);
}

export const COMPLIANCE_MODULE_CONFIG: Record<
  Ind6ComplianceModule,
  {
    code: string;
    flagKey: string;
    viewPerm: string;
    managePerm: string;
    sensitivePerm?: string;
    listPath: string;
    createPath: string;
    defaultCategory: string;
    requiresIncident?: boolean;
  }
> = {
  "dot-compliance": {
    code: "DOT_COMPLIANCE",
    flagKey: "industrial.module.dot.enabled",
    viewPerm: "industrial.dot.view",
    managePerm: "industrial.dot.manage",
    sensitivePerm: "industrial.dot.view_sensitive",
    listPath: "/api/v1/industrial/dot",
    createPath: "/api/v1/industrial/dot",
    defaultCategory: "drivers",
  },
  forklifts: {
    code: "FORKLIFTS",
    flagKey: "industrial.module.forklifts.enabled",
    viewPerm: "industrial.forklifts.view",
    managePerm: "industrial.forklifts.manage",
    listPath: "/api/v1/industrial/forklifts",
    createPath: "/api/v1/industrial/forklifts",
    defaultCategory: "equipment",
  },
  "workers-comp": {
    code: "WORKERS_COMP",
    flagKey: "industrial.module.workers_comp.enabled",
    viewPerm: "industrial.workers_comp.view",
    managePerm: "industrial.workers_comp.manage",
    sensitivePerm: "industrial.workers_comp.medical.view",
    listPath: "/api/v1/industrial/workers-comp",
    createPath: "/api/v1/industrial/workers-comp",
    defaultCategory: "cases",
    requiresIncident: true,
  },
  osha: {
    code: "OSHA",
    flagKey: "industrial.module.osha.enabled",
    viewPerm: "industrial.osha.view",
    managePerm: "industrial.osha.manage",
    listPath: "/api/v1/industrial/osha",
    createPath: "/api/v1/industrial/osha",
    defaultCategory: "cases",
    requiresIncident: true,
  },
  risk: {
    code: "RISK",
    flagKey: "industrial.module.risk.enabled",
    viewPerm: "industrial.risk.view",
    managePerm: "industrial.risk.manage",
    listPath: "/api/v1/industrial/risk",
    createPath: "/api/v1/industrial/risk",
    defaultCategory: "register",
  },
  "chemical-safety": {
    code: "CHEMICAL_SAFETY",
    flagKey: "industrial.module.chemical_safety.enabled",
    viewPerm: "industrial.chemical_safety.view",
    managePerm: "industrial.chemical_safety.manage",
    listPath: "/api/v1/industrial/chemical-safety",
    createPath: "/api/v1/industrial/chemical-safety",
    defaultCategory: "inventory",
  },
  "warehouse-safety": {
    code: "WAREHOUSE_SAFETY",
    flagKey: "industrial.module.warehouse_safety.enabled",
    viewPerm: "industrial.warehouse_safety.view",
    managePerm: "industrial.warehouse_safety.manage",
    listPath: "/api/v1/industrial/warehouse-safety",
    createPath: "/api/v1/industrial/warehouse-safety",
    defaultCategory: "housekeeping",
  },
  "manufacturing-safety": {
    code: "MANUFACTURING_SAFETY",
    flagKey: "industrial.module.manufacturing_safety.enabled",
    viewPerm: "industrial.manufacturing_safety.view",
    managePerm: "industrial.manufacturing_safety.manage",
    listPath: "/api/v1/industrial/manufacturing-safety",
    createPath: "/api/v1/industrial/manufacturing-safety",
    defaultCategory: "productionLines",
  },
  "contractor-safety": {
    code: "CONTRACTOR_SAFETY",
    flagKey: "industrial.module.contractor_safety.enabled",
    viewPerm: "industrial.contractor_safety.view",
    managePerm: "industrial.contractor_safety.manage",
    listPath: "/api/v1/industrial/contractor-safety",
    createPath: "/api/v1/industrial/contractor-safety",
    defaultCategory: "onboarding",
  },
  "process-safety": {
    code: "PROCESS_SAFETY",
    flagKey: "industrial.module.process_safety.enabled",
    viewPerm: "industrial.process_safety.view",
    managePerm: "industrial.process_safety.manage",
    listPath: "/api/v1/industrial/process-safety",
    createPath: "/api/v1/industrial/process-safety",
    defaultCategory: "moc",
  },
  "environmental-safety": {
    code: "ENVIRONMENTAL_SAFETY",
    flagKey: "industrial.module.environmental_safety.enabled",
    viewPerm: "industrial.environmental_safety.view",
    managePerm: "industrial.environmental_safety.manage",
    listPath: "/api/v1/industrial/environmental-safety",
    createPath: "/api/v1/industrial/environmental-safety",
    defaultCategory: "waste",
  },
};
