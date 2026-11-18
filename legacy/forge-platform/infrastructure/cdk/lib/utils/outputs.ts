import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";

/**
 * CloudFormation export helper.
 * Production / GovCloud stacks prefix export names with the CloudFormation stack
 * name so they do not collide with Development exports that share construct IDs
 * (e.g. ForgeNetwork-VpcId). Development keeps legacy bare export names.
 */
export function exportValue(
  scope: Construct,
  id: string,
  value: string,
  description: string,
): void {
  const stack = cdk.Stack.of(scope);
  const stackName = stack.stackName;
  const needsEnvPrefix =
    /production/i.test(stackName) || /govcloud/i.test(stackName) || /staging/i.test(stackName);
  new cdk.CfnOutput(scope, id, {
    value,
    description,
    exportName: needsEnvPrefix ? `${stackName}:${id}` : id,
  });
}
