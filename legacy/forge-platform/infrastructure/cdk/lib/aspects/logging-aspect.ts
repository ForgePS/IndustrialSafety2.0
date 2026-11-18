import * as cdk from "aws-cdk-lib";
import type { IConstruct } from "constructs";

/** Placeholder aspect for ensuring log groups get retention (enforced in ForgeLogging). */
export class LoggingAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    const resource = node as cdk.CfnResource;
    if (resource.cfnResourceType === "AWS::Logs::LogGroup") {
      // Retention is set in ForgeLogging / ForgeVpc constructs.
    }
  }
}
