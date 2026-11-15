import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { createMandatoryTags } from "../aspects/tagging-aspect.js";

export interface ForgeTagsProps {
  config: ForgeEnvironmentConfig;
}

/** Applies mandatory Forge tags to the enclosing construct scope. */
export class ForgeTags extends Construct {
  readonly tags: Record<string, string>;

  constructor(scope: Construct, id: string, props: ForgeTagsProps) {
    super(scope, id);
    this.tags = createMandatoryTags(props.config.environmentName);
    for (const [key, value] of Object.entries(this.tags)) {
      cdk.Tags.of(scope).add(key, value);
    }
  }
}
