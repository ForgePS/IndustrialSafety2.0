import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeEcrProps {
  config: ForgeEnvironmentConfig;
}

export class ForgeEcr extends Construct {
  readonly platformApi: ecr.Repository;
  readonly workerService: ecr.Repository;
  readonly academyWeb: ecr.Repository;
  readonly rmsWeb: ecr.Repository;
  readonly creatorConsole: ecr.Repository;

  constructor(scope: Construct, id: string, props: ForgeEcrProps) {
    super(scope, id);
    const { config } = props;

    const createRepo = (name: string) =>
      new ecr.Repository(this, name, {
        repositoryName: resourceName(config, "ecr", name.toLowerCase()),
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        lifecycleRules: [
          { maxImageCount: 20, description: "Retain recent images" },
          {
            tagStatus: ecr.TagStatus.UNTAGGED,
            maxImageAge: cdk.Duration.days(14),
            description: "Expire untagged images",
          },
        ],
        encryption: ecr.RepositoryEncryption.AES_256,
      });

    this.platformApi = createRepo("PlatformApi");
    this.workerService = createRepo("WorkerService");
    this.academyWeb = createRepo("AcademyWeb");
    this.rmsWeb = createRepo("RmsWeb");
    this.creatorConsole = createRepo("CreatorConsole");
  }
}
