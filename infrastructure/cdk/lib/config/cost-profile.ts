/**
 * Environment Cost Profiles — named presets that set cost-relevant infrastructure knobs.
 *
 * | Profile      | Goal                              | Approximate monthly cost |
 * |--------------|-----------------------------------|--------------------------|
 * | developer    | Single developer, cost optimized  | ~$50–80                  |
 * | integration  | Team testing, always on           | ~$100–150                |
 * | production   | High availability                 | Sized by workload        |
 */

export const costProfileNameSchema = ["developer", "integration", "production"] as const;
export type CostProfileName = (typeof costProfileNameSchema)[number];

/** Cost-relevant slices applied by a profile. Environments compose these with account/region/domains. */
export interface CostProfileKnobs {
  networking: {
    availabilityZoneCount: number;
    natGatewayCount: number;
    enableVpcFlowLogs: boolean;
    flowLogDestination: "cloudwatch" | "s3";
    enableInterfaceEndpoints: boolean;
  };
  database: {
    serverlessMinCapacity: number;
    serverlessMaxCapacity: number;
    autoPauseMinutes?: number;
    backupRetentionDays: number;
    deletionProtection: boolean;
    multiAz: boolean;
  };
  compute: {
    apiDesiredCount: number;
    workerDesiredCount: number;
  };
  retention: {
    applicationLogsDays: number;
    securityLogsDays: number;
    auditLogsDays: number;
    importFilesDays: number;
    exportFilesDays: number;
  };
  features: {
    enableWaf: boolean;
    enableMacie: boolean;
    enableGuardDuty: boolean;
    enableSecurityHub: boolean;
    enableInspector: boolean;
    enableBackup: boolean;
    enableBudget: boolean;
    enableCloudTrail: boolean;
    enableConsoleHosting: boolean;
    enableRmsHosting: boolean;
    enableTenantAdminHosting: boolean;
    enableFieldHosting: boolean;
    monthlyBudgetUsd: number;
    budgetAlertThresholds: number[];
  };
}

export interface CostProfile {
  name: CostProfileName;
  /** Short label for docs and dashboards. */
  label: string;
  /** One-line goal statement. */
  goal: string;
  /** Human-readable monthly cost target; production is workload-sized. */
  approximateMonthlyCost: string;
  /** Optional numeric budget alarm threshold in USD. */
  monthlyBudgetUsd: number;
  knobs: CostProfileKnobs;
}

/**
 * Developer — single developer, cost optimized (~$50–80/mo).
 * Aurora auto-pauses, worker at 0, flow logs to S3, single NAT.
 */
export const developerCostProfile: CostProfile = {
  name: "developer",
  label: "Developer",
  goal: "Single developer, cost optimized",
  approximateMonthlyCost: "~$50–80",
  monthlyBudgetUsd: 100,
  knobs: {
    networking: {
      availabilityZoneCount: 2,
      natGatewayCount: 1,
      enableVpcFlowLogs: true,
      flowLogDestination: "s3",
      enableInterfaceEndpoints: false,
    },
    database: {
      serverlessMinCapacity: 0,
      serverlessMaxCapacity: 2,
      autoPauseMinutes: 60,
      backupRetentionDays: 7,
      deletionProtection: false,
      multiAz: false,
    },
    compute: {
      apiDesiredCount: 1,
      workerDesiredCount: 1,
    },
    retention: {
      applicationLogsDays: 14,
      securityLogsDays: 90,
      auditLogsDays: 90,
      importFilesDays: 14,
      exportFilesDays: 7,
    },
    features: {
      enableWaf: true,
      enableMacie: false,
      enableGuardDuty: false,
      enableSecurityHub: false,
      enableInspector: true,
      enableBackup: true,
      enableBudget: true,
      enableCloudTrail: true,
      enableConsoleHosting: true,
      enableRmsHosting: true,
      enableTenantAdminHosting: true,
      // Field ships via dedicated Forge-*-FieldFrontend stack (bin/deploy-field.ts)
      // to avoid CLOUDFRONT WAF logging ResourcePolicy collisions across envs.
      enableFieldHosting: false,
      monthlyBudgetUsd: 100,
      budgetAlertThresholds: [50, 80, 100, 120],
    },
  },
};

/**
 * Integration — team testing, always on (~$100–150/mo).
 * Aurora stays warm at 0.5 ACU, worker runs, modest HA.
 */
export const integrationCostProfile: CostProfile = {
  name: "integration",
  label: "Integration",
  goal: "Team testing, always on",
  approximateMonthlyCost: "~$100–150",
  monthlyBudgetUsd: 200,
  knobs: {
    networking: {
      availabilityZoneCount: 2,
      natGatewayCount: 1,
      enableVpcFlowLogs: true,
      flowLogDestination: "s3",
      enableInterfaceEndpoints: false,
    },
    database: {
      serverlessMinCapacity: 0.5,
      serverlessMaxCapacity: 4,
      backupRetentionDays: 7,
      deletionProtection: false,
      multiAz: false,
    },
    compute: {
      apiDesiredCount: 1,
      workerDesiredCount: 1,
    },
    retention: {
      applicationLogsDays: 30,
      securityLogsDays: 365,
      auditLogsDays: 365,
      importFilesDays: 30,
      exportFilesDays: 14,
    },
    features: {
      enableWaf: true,
      enableMacie: false,
      enableGuardDuty: false,
      enableSecurityHub: false,
      enableInspector: true,
      enableBackup: true,
      enableBudget: true,
      enableCloudTrail: true,
      enableConsoleHosting: true,
      enableRmsHosting: true,
      enableTenantAdminHosting: true,
      enableFieldHosting: false,
      monthlyBudgetUsd: 200,
      budgetAlertThresholds: [50, 80, 100, 120],
    },
  },
};

/**
 * Production — high availability; capacity sized by workload.
 * Multi-AZ, no auto-pause, full security controls, deletion protection.
 */
export const productionCostProfile: CostProfile = {
  name: "production",
  label: "Production",
  goal: "High availability",
  approximateMonthlyCost: "Sized by workload",
  monthlyBudgetUsd: 5000,
  knobs: {
    networking: {
      availabilityZoneCount: 3,
      natGatewayCount: 3,
      enableVpcFlowLogs: true,
      flowLogDestination: "cloudwatch",
      enableInterfaceEndpoints: true,
    },
    database: {
      // Floor above 2 ACU avoids Sunday-morning cold latency after idle scale-down.
      serverlessMinCapacity: 4,
      serverlessMaxCapacity: 32,
      backupRetentionDays: 35,
      deletionProtection: true,
      multiAz: true,
    },
    compute: {
      apiDesiredCount: 3,
      workerDesiredCount: 2,
    },
    retention: {
      applicationLogsDays: 90,
      securityLogsDays: 365,
      auditLogsDays: 2555,
      importFilesDays: 90,
      exportFilesDays: 30,
    },
    features: {
      enableWaf: true,
      enableMacie: true,
      enableGuardDuty: true,
      enableSecurityHub: true,
      enableInspector: true,
      enableBackup: true,
      enableBudget: true,
      enableCloudTrail: true,
      enableConsoleHosting: true,
      enableRmsHosting: true,
      enableTenantAdminHosting: true,
      enableFieldHosting: false,
      monthlyBudgetUsd: 5000,
      budgetAlertThresholds: [50, 80, 100, 120],
    },
  },
};

export const COST_PROFILES: Record<CostProfileName, CostProfile> = {
  developer: developerCostProfile,
  integration: integrationCostProfile,
  production: productionCostProfile,
};

/** Default profile mapping for Forge environment names. */
export const ENVIRONMENT_COST_PROFILE: Record<string, CostProfileName> = {
  development: "developer",
  testing: "integration",
  staging: "integration",
  production: "production",
  "govcloud-development": "developer",
  "govcloud-staging": "integration",
  "govcloud-production": "production",
};

export function getCostProfile(name: CostProfileName): CostProfile {
  return COST_PROFILES[name];
}

export function resolveCostProfileForEnvironment(environmentName: string): CostProfile {
  const profileName = ENVIRONMENT_COST_PROFILE[environmentName];
  if (!profileName) {
    throw new Error(`No cost profile mapped for environment "${environmentName}"`);
  }
  return getCostProfile(profileName);
}

/** Summary table rows for docs and CLI output. */
export function listCostProfileSummaries(): Array<{
  environment: string;
  goal: string;
  approximateMonthlyCost: string;
}> {
  return [
    {
      environment: developerCostProfile.label,
      goal: developerCostProfile.goal,
      approximateMonthlyCost: developerCostProfile.approximateMonthlyCost,
    },
    {
      environment: integrationCostProfile.label,
      goal: integrationCostProfile.goal,
      approximateMonthlyCost: integrationCostProfile.approximateMonthlyCost,
    },
    {
      environment: productionCostProfile.label,
      goal: productionCostProfile.goal,
      approximateMonthlyCost: productionCostProfile.approximateMonthlyCost,
    },
  ];
}
