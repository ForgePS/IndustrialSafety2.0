import * as cdk from "aws-cdk-lib";
import type { IConstruct } from "constructs";

/** Development may DESTROY disposable resources; production must RETAIN data-bearing ones. */
export class RemovalPolicyAspect implements cdk.IAspect {
  constructor(private readonly isProduction: boolean) {}

  visit(node: IConstruct): void {
    if (!this.isProduction) return;
    const resource = node as cdk.CfnResource;
    if (resource.cfnOptions) {
      // Prefer RETAIN for production data-bearing resources when applicable.
      if (
        resource.cfnResourceType?.includes("AWS::S3::Bucket") ||
        resource.cfnResourceType?.includes("AWS::RDS::DBCluster") ||
        resource.cfnResourceType?.includes("AWS::KMS::Key")
      ) {
        resource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      }
    }
  }
}
