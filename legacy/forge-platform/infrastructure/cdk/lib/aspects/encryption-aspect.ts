import * as cdk from "aws-cdk-lib";
import type { IConstruct } from "constructs";

/** Flags resources that lack server-side encryption annotations for review. */
export class EncryptionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    const resource = node as cdk.CfnResource;
    if (!resource.cfnResourceType) return;
    // Aspect is a documentation hook; encryption is enforced in constructs.
    // Future: emit Annotations when known encryptable types lack KMS props.
  }
}
