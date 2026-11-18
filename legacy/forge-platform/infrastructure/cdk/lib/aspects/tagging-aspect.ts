import * as cdk from "aws-cdk-lib";
import type { IConstruct } from "constructs";

const REQUIRED_TAGS = [
  "Project",
  "Environment",
  "ManagedBy",
  "DataClassification",
  "Owner",
  "CostCenter",
] as const;

/**
 * Apply mandatory tags without Tags.of() — Tags.of registers another Aspect and can
 * trigger PossibleInfiniteLoopDetected as the construct tree grows (Phase 4 queues).
 */
export class TaggingAspect implements cdk.IAspect {
  constructor(private readonly tags: Record<(typeof REQUIRED_TAGS)[number], string>) {}

  visit(node: IConstruct): void {
    if (node.node.id.startsWith("DefaultPolicy") || node.node.id.includes("Policy")) {
      // Skip ephemeral IAM default policies created during grants.
    }
    const resource = node as cdk.CfnResource;
    if (!resource.cfnOptions || typeof resource.addPropertyOverride !== "function") {
      return;
    }
    if (!resource.cfnResourceType) return;

    // Prefer L1 tag API when present (S3, EC2, etc.). Fallback: Tags property merge for
    // resources that support a Tags array — skip when unsupported.
    const taggable = resource as cdk.CfnResource & {
      tags?: { setTag?: (key: string, value: string) => void };
    };
    if (taggable.tags && typeof taggable.tags.setTag === "function") {
      for (const [key, value] of Object.entries(this.tags)) {
        taggable.tags.setTag(key, value);
      }
    }
  }
}

export function createMandatoryTags(
  environment: string,
): Record<(typeof REQUIRED_TAGS)[number], string> {
  return {
    Project: "ForgePlatform",
    Environment: environment,
    ManagedBy: "AWS-CDK",
    DataClassification: "Internal",
    Owner: "ForgePublicSafety",
    CostCenter: "ForgePlatform",
  };
}

export { REQUIRED_TAGS };
