import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeSecurityGroupsProps {
  config: ForgeEnvironmentConfig;
  vpc: ec2.IVpc;
}

export class ForgeSecurityGroups extends Construct {
  readonly albSg: ec2.SecurityGroup;
  readonly ecsApiSg: ec2.SecurityGroup;
  readonly workerSg: ec2.SecurityGroup;
  readonly databaseSg: ec2.SecurityGroup;
  readonly migrationSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: ForgeSecurityGroupsProps) {
    super(scope, id);
    const { config, vpc } = props;

    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      securityGroupName: resourceName(config, "sg", "alb"),
      description: "ALB ingress for approved web traffic",
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP redirect");

    this.ecsApiSg = new ec2.SecurityGroup(this, "EcsApiSg", {
      vpc,
      securityGroupName: resourceName(config, "sg", "ecs-api"),
      description: "ECS API accepts traffic only from ALB",
      allowAllOutbound: true,
    });
    this.ecsApiSg.addIngressRule(this.albSg, ec2.Port.tcp(4000), "API from ALB");

    this.workerSg = new ec2.SecurityGroup(this, "WorkerSg", {
      vpc,
      securityGroupName: resourceName(config, "sg", "worker"),
      description: "Worker service - no public ingress",
      allowAllOutbound: true,
    });

    this.migrationSg = new ec2.SecurityGroup(this, "MigrationSg", {
      vpc,
      securityGroupName: resourceName(config, "sg", "migration"),
      description: "Controlled migration task access to database",
      allowAllOutbound: true,
    });

    this.databaseSg = new ec2.SecurityGroup(this, "DatabaseSg", {
      vpc,
      securityGroupName: resourceName(config, "sg", "database"),
      description: "PostgreSQL only from API and migration SGs",
      allowAllOutbound: false,
    });
    this.databaseSg.addIngressRule(this.ecsApiSg, ec2.Port.tcp(5432), "API to DB");
    this.databaseSg.addIngressRule(this.migrationSg, ec2.Port.tcp(5432), "Migration to DB");
    this.databaseSg.addIngressRule(this.workerSg, ec2.Port.tcp(5432), "Worker to DB");
  }
}
