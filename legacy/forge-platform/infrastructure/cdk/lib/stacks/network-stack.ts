import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeVpc } from "../constructs/forge-vpc.js";
import { ForgeSecurityGroups } from "../constructs/forge-security-groups.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface NetworkStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly securityGroups: ForgeSecurityGroups;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Network"),
    });

    const forgeVpc = new ForgeVpc(this, "ForgeVpc", { config: props.config });
    this.vpc = forgeVpc.vpc;
    this.securityGroups = new ForgeSecurityGroups(this, "SecurityGroups", {
      config: props.config,
      vpc: this.vpc,
    });

    exportValue(this, `${id}-VpcId`, this.vpc.vpcId, "VPC ID");
    exportValue(
      this,
      `${id}-PrivateSubnetIds`,
      cdk.Fn.join(
        ",",
        this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
      ),
      "Private application subnet IDs",
    );
  }
}
