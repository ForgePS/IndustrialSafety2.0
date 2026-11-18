/** IND-5 high-risk work modules with AWS workspace UIs. */
export const IND5_HIGH_RISK_MODULES = [
  "confined-space",
  "hot-work",
  "working-at-heights",
  "electrical-safety",
  "cranes-rigging",
  "machine-safety",
] as const;

export type Ind5HighRiskModule = (typeof IND5_HIGH_RISK_MODULES)[number];

export function isInd5HighRiskModule(module: string): module is Ind5HighRiskModule {
  return (IND5_HIGH_RISK_MODULES as readonly string[]).includes(module);
}

export const HIGH_RISK_MODULE_CONFIG: Record<
  Ind5HighRiskModule,
  {
    code: string;
    flagKey: string;
    viewPerm: string;
    managePerm: string;
    approvePerm: string;
    listPath: string;
    createPath: string;
    defaultCategory: string;
  }
> = {
  "confined-space": {
    code: "CONFINED_SPACE",
    flagKey: "industrial.module.confined_space.enabled",
    viewPerm: "industrial.confined_space.view",
    managePerm: "industrial.confined_space.manage",
    approvePerm: "industrial.confined_space.approve",
    listPath: "/api/v1/industrial/confined-space",
    createPath: "/api/v1/industrial/confined-space",
    defaultCategory: "permits",
  },
  "hot-work": {
    code: "HOT_WORK",
    flagKey: "industrial.module.hot_work.enabled",
    viewPerm: "industrial.hot_work.view",
    managePerm: "industrial.hot_work.manage",
    approvePerm: "industrial.hot_work.approve",
    listPath: "/api/v1/industrial/hot-work",
    createPath: "/api/v1/industrial/hot-work",
    defaultCategory: "permits",
  },
  "working-at-heights": {
    code: "WORKING_AT_HEIGHTS",
    flagKey: "industrial.module.working_at_heights.enabled",
    viewPerm: "industrial.working_at_heights.view",
    managePerm: "industrial.working_at_heights.manage",
    approvePerm: "industrial.working_at_heights.approve",
    listPath: "/api/v1/industrial/working-at-heights",
    createPath: "/api/v1/industrial/working-at-heights",
    defaultCategory: "permits",
  },
  "electrical-safety": {
    code: "ELECTRICAL_SAFETY",
    flagKey: "industrial.module.electrical_safety.enabled",
    viewPerm: "industrial.electrical_safety.view",
    managePerm: "industrial.electrical_safety.manage",
    approvePerm: "industrial.electrical_safety.approve",
    listPath: "/api/v1/industrial/electrical-safety",
    createPath: "/api/v1/industrial/electrical-safety",
    defaultCategory: "permits",
  },
  "cranes-rigging": {
    code: "CRANES_RIGGING",
    flagKey: "industrial.module.cranes_rigging.enabled",
    viewPerm: "industrial.cranes_rigging.view",
    managePerm: "industrial.cranes_rigging.manage",
    approvePerm: "industrial.cranes_rigging.approve",
    listPath: "/api/v1/industrial/cranes-rigging",
    createPath: "/api/v1/industrial/cranes-rigging",
    defaultCategory: "liftPlans",
  },
  "machine-safety": {
    code: "MACHINE_SAFETY",
    flagKey: "industrial.module.machine_safety.enabled",
    viewPerm: "industrial.machine_safety.view",
    managePerm: "industrial.machine_safety.manage",
    approvePerm: "industrial.machine_safety.approve",
    listPath: "/api/v1/industrial/machine-safety",
    createPath: "/api/v1/industrial/machine-safety",
    defaultCategory: "machines",
  },
};
