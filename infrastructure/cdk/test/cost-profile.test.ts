import { describe, expect, it } from "vitest";
import {
  COST_PROFILES,
  ENVIRONMENT_COST_PROFILE,
  listCostProfileSummaries,
  resolveCostProfileForEnvironment,
} from "../lib/config/cost-profile.js";
import { developmentConfig } from "../lib/config/development.js";
import { testingConfig } from "../lib/config/testing.js";
import { productionConfig } from "../lib/config/production.js";

describe("Environment Cost Profiles", () => {
  it("exposes the three presets with documented cost targets", () => {
    expect(listCostProfileSummaries()).toEqual([
      {
        environment: "Developer",
        goal: "Single developer, cost optimized",
        approximateMonthlyCost: "~$50–80",
      },
      {
        environment: "Integration",
        goal: "Team testing, always on",
        approximateMonthlyCost: "~$100–150",
      },
      {
        environment: "Production",
        goal: "High availability",
        approximateMonthlyCost: "Sized by workload",
      },
    ]);
  });

  it("maps Forge environments to the expected profiles", () => {
    expect(ENVIRONMENT_COST_PROFILE.development).toBe("developer");
    expect(ENVIRONMENT_COST_PROFILE.testing).toBe("integration");
    expect(ENVIRONMENT_COST_PROFILE.staging).toBe("integration");
    expect(ENVIRONMENT_COST_PROFILE.production).toBe("production");
  });

  it("applies Developer knobs to the development config", () => {
    const profile = resolveCostProfileForEnvironment("development");
    expect(developmentConfig.costProfile).toBe("developer");
    expect(developmentConfig.database.serverlessMinCapacity).toBe(
      profile.knobs.database.serverlessMinCapacity,
    );
    expect(developmentConfig.compute.workerDesiredCount).toBe(
      profile.knobs.compute.workerDesiredCount,
    );
    expect(developmentConfig.networking.flowLogDestination).toBe("s3");
    expect(developmentConfig.features.monthlyBudgetUsd).toBe(100);
  });

  it("applies Integration knobs to the testing config", () => {
    expect(testingConfig.costProfile).toBe("integration");
    expect(testingConfig.database.serverlessMinCapacity).toBe(0.5);
    expect(testingConfig.compute.workerDesiredCount).toBe(1);
    expect(testingConfig.features.monthlyBudgetUsd).toBe(200);
  });

  it("applies Production knobs without auto-pause", () => {
    expect(productionConfig.costProfile).toBe("production");
    expect(productionConfig.database.serverlessMinCapacity).toBeGreaterThanOrEqual(4);
    expect(productionConfig.database.deletionProtection).toBe(true);
    expect(productionConfig.database.multiAz).toBe(true);
    expect(COST_PROFILES.production.approximateMonthlyCost).toBe("Sized by workload");
  });
});
