/**
 * Standalone ASL definition for Import Platform S5/S6.
 * Status: DEFINITION_COMPLETE_DEPLOYMENT_PENDING until CDK Messaging stack deploy
 * activates ForgeImportExecutionStateMachine (currently worker polls SQS directly).
 * S6 adds SecurityVerdictGate before execution lock acquisition.
 */
export const IMPORT_EXECUTION_ASL = {
  Comment:
    "Forge Universal Import Platform S6 execution orchestration. Pass job/batch refs only. Security gate is fail-closed.",
  StartAt: "LoadJob",
  States: {
    LoadJob: { Type: "Pass", Next: "SecurityVerdictGate" },
    SecurityVerdictGate: {
      Type: "Choice",
      Comment:
        "Fail closed unless malwareVerdict is CLEAN or OVERRIDE_APPROVED, hash matches, and no security hold.",
      Choices: [
        {
          And: [
            {
              Or: [
                { Variable: "$.security.malwareVerdict", StringEquals: "CLEAN" },
                { Variable: "$.security.malwareVerdict", StringEquals: "OVERRIDE_APPROVED" },
              ],
            },
            { Variable: "$.security.securityHold", BooleanEquals: false },
            { Variable: "$.security.hashMatch", BooleanEquals: true },
            { Variable: "$.security.quarantined", BooleanEquals: false },
          ],
          Next: "ValidateExecutableState",
        },
      ],
      Default: "SecurityGateDenied",
    },
    SecurityGateDenied: {
      Type: "Pass",
      Result: { code: "IMPORT_SCAN_REQUIRED", outcome: "DENIED" },
      End: true,
    },
    ValidateExecutableState: { Type: "Pass", Next: "AcquireExecutionLock" },
    AcquireExecutionLock: { Type: "Pass", Next: "ResolveAdapter" },
    ResolveAdapter: { Type: "Pass", Next: "CreateOrResumeBatch" },
    CreateOrResumeBatch: { Type: "Pass", Next: "ProcessBatch" },
    ProcessBatch: {
      Type: "Pass",
      Next: "UpdateProgress",
      Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
    },
    UpdateProgress: { Type: "Pass", Next: "MoreRows" },
    MoreRows: {
      Type: "Choice",
      Choices: [
        { Variable: "$.progress.hasMore", BooleanEquals: true, Next: "CreateOrResumeBatch" },
      ],
      Default: "FinalizeJob",
    },
    FinalizeJob: { Type: "Pass", Next: "GenerateResults" },
    GenerateResults: { Type: "Pass", Next: "ReleaseLock" },
    ReleaseLock: { Type: "Pass", End: true },
    HandleFailure: { Type: "Pass", Next: "ReleaseLock" },
  },
  TimeoutSeconds: 86400,
} as const;

export const IMPORT_EXECUTION_SFN_STATUS = "DEFINITION_COMPLETE_DEPLOYMENT_PENDING" as const;
