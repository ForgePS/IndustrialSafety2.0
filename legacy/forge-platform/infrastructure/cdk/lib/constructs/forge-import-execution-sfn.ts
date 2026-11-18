import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeImportExecutionStateMachineProps {
  config: ForgeEnvironmentConfig;
  importsQueue: sqs.IQueue;
  /**
   * When false, resources are still synthesized for review but the state machine
   * is not intended to receive live traffic (worker polls SQS directly in S5).
   */
  activate?: boolean;
}

/**
 * Import execution orchestration definition (S5).
 * Operational path in S5: API → SQS → ECS worker.
 * This state machine mirrors the same stages for future EventBridge Pipe activation.
 */
export class ForgeImportExecutionStateMachine extends Construct {
  readonly stateMachine: sfn.StateMachine;
  readonly deploymentStatus:
    "DEPLOYED_AND_ACTIVE" | "DEPLOYED_NOT_ACTIVE" | "DEFINITION_COMPLETE_DEPLOYMENT_PENDING";

  constructor(scope: Construct, id: string, props: ForgeImportExecutionStateMachineProps) {
    super(scope, id);

    const activate = props.activate === true;
    this.deploymentStatus = activate ? "DEPLOYED_AND_ACTIVE" : "DEPLOYED_NOT_ACTIVE";

    const definition = sfn.DefinitionBody.fromString(
      JSON.stringify({
        Comment:
          "Forge Universal Import Platform S5 execution orchestration. Pass job/batch refs only — never row payloads.",
        StartAt: "LoadJob",
        States: {
          LoadJob: {
            Type: "Pass",
            Comment: "Load job metadata references (tenantId, jobId, correlationId)",
            ResultPath: "$.loadJob",
            Next: "ValidateExecutableState",
          },
          ValidateExecutableState: {
            Type: "Pass",
            Comment: "Confirm APPROVED/QUEUED executable state against PostgreSQL",
            ResultPath: "$.validate",
            Next: "AcquireExecutionLock",
          },
          AcquireExecutionLock: {
            Type: "Pass",
            Comment: "Conditional lock acquisition with heartbeat/expiry",
            ResultPath: "$.lock",
            Next: "ResolveAdapter",
          },
          ResolveAdapter: {
            Type: "Pass",
            Comment: "Resolve adapter key via registry (no product conditionals)",
            ResultPath: "$.adapter",
            Next: "CreateOrResumeBatch",
          },
          CreateOrResumeBatch: {
            Type: "Pass",
            Comment: "Create or resume durable import_batches checkpoint",
            ResultPath: "$.batch",
            Next: "ProcessBatch",
          },
          ProcessBatch: {
            Type: "Pass",
            Comment: "Process a controlled row batch through adapter commit pipeline",
            ResultPath: "$.process",
            Next: "UpdateProgress",
          },
          UpdateProgress: {
            Type: "Pass",
            Comment: "Persist monotonic progress counters",
            ResultPath: "$.progress",
            Next: "MoreRows",
          },
          MoreRows: {
            Type: "Choice",
            Choices: [
              {
                Variable: "$.progress.hasMore",
                BooleanEquals: true,
                Next: "CreateOrResumeBatch",
              },
            ],
            Default: "FinalizeJob",
          },
          FinalizeJob: {
            Type: "Pass",
            Comment: "Terminal aggregation COMPLETED / COMPLETED_WITH_ERRORS / FAILED / CANCELLED",
            ResultPath: "$.finalize",
            Next: "GenerateResults",
          },
          GenerateResults: {
            Type: "Pass",
            Comment: "Write result_summary_json and rollback classification summary",
            ResultPath: "$.results",
            Next: "ReleaseLock",
          },
          ReleaseLock: {
            Type: "Pass",
            Comment: "Clear execution lock owner",
            ResultPath: "$.release",
            End: true,
          },
        },
        TimeoutSeconds: 86400,
      }),
    );

    const logGroup = new logs.LogGroup(this, "ImportExecutionLogs", {
      logGroupName: `/forge/${props.config.environmentName}/import-execution-sfn`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, "ImportExecution", {
      stateMachineName: resourceName(props.config, "sfn", "import-execution"),
      definitionBody: definition,
      timeout: cdk.Duration.hours(24),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ERROR,
        includeExecutionData: false,
      },
    });

    // Least privilege placeholder: future activity/task workers may need queue send.
    this.stateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "ImportExecutionSfnDescribeQueue",
        actions: ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
        resources: [props.importsQueue.queueArn],
      }),
    );

    cdk.Tags.of(this.stateMachine).add("forge:capability", "import-execution");
    cdk.Tags.of(this.stateMachine).add("forge:s5-activate", activate ? "true" : "false");
  }
}
