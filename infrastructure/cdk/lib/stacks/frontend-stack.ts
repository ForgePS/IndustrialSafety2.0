import * as cdk from "aws-cdk-lib";
import type * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeBudgets } from "../constructs/forge-budgets.js";
import { ForgeCloudFrontWaf } from "../constructs/forge-cloudfront-waf.js";
import { ForgeConsoleHosting } from "../constructs/forge-console-hosting.js";
import { ForgeFieldHosting } from "../constructs/forge-field-hosting.js";
import { ForgeIndustrialHosting } from "../constructs/forge-industrial-hosting.js";
import { ForgeRmsHosting } from "../constructs/forge-rms-hosting.js";
import { ForgeTenantAdminHosting } from "../constructs/forge-tenant-admin-hosting.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface FrontendStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  /**
   * Optional API CloudFront distribution ID (Compute-owned).
   * Not associated in-stack (CloudFront rejects WAFv2 WebACLAssociation).
   * After deploy, associate via CloudFront AssociateDistributionWebACL using
   * the exported Frontend WebACL ARN.
   */
  apiCloudFrontDistributionId?: string;
}

/**
 * Static frontends (Creator Console, RMS Web, Tenant Admin, Industrial, Field) and budgets.
 * Kept separate from Compute so UI deploys do not recycle the API service.
 */
export class FrontendStack extends cdk.Stack {
  readonly console?: ForgeConsoleHosting;
  readonly rms?: ForgeRmsHosting;
  readonly tenantAdmin?: ForgeTenantAdminHosting;
  readonly industrial?: ForgeIndustrialHosting;
  readonly field?: ForgeFieldHosting;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Frontend"),
    });

    const distributions: cloudfront.Distribution[] = [];

    if (props.config.features.enableConsoleHosting) {
      this.console = new ForgeConsoleHosting(this, "Console", { config: props.config });
      distributions.push(this.console.distribution);
      exportValue(
        this,
        `${id}-ConsoleDomain`,
        this.console.distribution.distributionDomainName,
        "Creator Console CloudFront domain",
      );
      exportValue(
        this,
        `${id}-ConsoleBucket`,
        this.console.bucket.bucketName,
        "Creator Console origin bucket",
      );
      exportValue(
        this,
        `${id}-ConsoleDistributionId`,
        this.console.distribution.distributionId,
        "Creator Console CloudFront distribution ID",
      );
    }

    if (props.config.features.enableRmsHosting) {
      this.rms = new ForgeRmsHosting(this, "Rms", { config: props.config });
      distributions.push(this.rms.distribution);
      exportValue(
        this,
        `${id}-RmsDomain`,
        this.rms.distribution.distributionDomainName,
        "RMS Web CloudFront domain",
      );
      exportValue(
        this,
        `${id}-RmsBucket`,
        this.rms.bucket.bucketName,
        "RMS Web origin bucket",
      );
      exportValue(
        this,
        `${id}-RmsDistributionId`,
        this.rms.distribution.distributionId,
        "RMS Web CloudFront distribution ID",
      );
    }

    if (props.config.features.enableTenantAdminHosting) {
      this.tenantAdmin = new ForgeTenantAdminHosting(this, "TenantAdmin", {
        config: props.config,
      });
      distributions.push(this.tenantAdmin.distribution);
      exportValue(
        this,
        `${id}-TenantAdminDomain`,
        this.tenantAdmin.distribution.distributionDomainName,
        "Tenant Admin CloudFront domain",
      );
      exportValue(
        this,
        `${id}-TenantAdminBucket`,
        this.tenantAdmin.bucket.bucketName,
        "Tenant Admin origin bucket",
      );
      exportValue(
        this,
        `${id}-TenantAdminDistributionId`,
        this.tenantAdmin.distribution.distributionId,
        "Tenant Admin CloudFront distribution ID",
      );
    }

    if (props.config.domains?.industrial) {
      this.industrial = new ForgeIndustrialHosting(this, "Industrial", {
        config: props.config,
      });
      distributions.push(this.industrial.distribution);
      exportValue(
        this,
        `${id}-IndustrialDomain`,
        this.industrial.distribution.distributionDomainName,
        "Industrial Web CloudFront domain",
      );
      exportValue(
        this,
        `${id}-IndustrialBucket`,
        this.industrial.bucket.bucketName,
        "Industrial Web origin bucket",
      );
      exportValue(
        this,
        `${id}-IndustrialDistributionId`,
        this.industrial.distribution.distributionId,
        "Industrial Web CloudFront distribution ID",
      );
    }

    if (props.config.features.enableFieldHosting) {
      this.field = new ForgeFieldHosting(this, "Field", { config: props.config });
      distributions.push(this.field.distribution);
      exportValue(
        this,
        `${id}-FieldDomain`,
        this.field.distribution.distributionDomainName,
        "Field Web CloudFront domain",
      );
      exportValue(
        this,
        `${id}-FieldBucket`,
        this.field.bucket.bucketName,
        "Field Web origin bucket",
      );
      exportValue(
        this,
        `${id}-FieldDistributionId`,
        this.field.distribution.distributionId,
        "Field Web CloudFront distribution ID",
      );
    }

    if (props.config.features.enableWaf && distributions.length > 0) {
      const waf = new ForgeCloudFrontWaf(this, "CloudFrontWaf", {
        config: props.config,
        distributions,
      });
      exportValue(
        this,
        `${id}-CloudFrontWebAclArn`,
        waf.webAclArn,
        "CloudFront WAF WebACL ARN for SPA edges (and optional API AssociateDistributionWebACL)",
      );
      if (props.apiCloudFrontDistributionId) {
        exportValue(
          this,
          `${id}-ApiCloudFrontDistributionId`,
          props.apiCloudFrontDistributionId,
          "API CloudFront distribution ID pending AssociateDistributionWebACL",
        );
      }
    }

    new ForgeBudgets(this, "Budgets", { config: props.config });
  }
}
