import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const emfDims = ["Environment", "development", "Service", "platform-api"];

const body = {
  widgets: [
    {
      type: "metric",
      x: 0,
      y: 0,
      width: 12,
      height: 6,
      properties: {
        metrics: [
          [
            "AWS/ECS",
            "CPUUtilization",
            "ServiceName",
            "forge-development-ecs-platform-api",
            "ClusterName",
            "forge-development-ecs-platform",
          ],
          [".", "MemoryUtilization", ".", ".", ".", "."],
        ],
        view: "timeSeries",
        stacked: false,
        region: "us-east-1",
        title: "API ECS CPU/Memory",
        period: 60,
        stat: "Average",
      },
    },
    {
      type: "metric",
      x: 12,
      y: 0,
      width: 12,
      height: 6,
      properties: {
        metrics: [
          ["Forge/Configuration", "ConfigRlsDenials", ...emfDims],
          [".", "ConfigAuthorizationDenials", ".", ".", ".", "."],
          [".", "ConfigPublishFailures", ".", ".", ".", "."],
          [".", "ConfigRollbackFailures", ".", ".", ".", "."],
          [".", "ConfigValidationFailures", ".", ".", ".", "."],
        ],
        view: "timeSeries",
        stacked: false,
        region: "us-east-1",
        title: "Configuration EMF (denials/failures)",
        period: 300,
        stat: "Sum",
      },
    },
    {
      type: "log",
      x: 0,
      y: 6,
      width: 24,
      height: 6,
      properties: {
        query:
          "SOURCE '/forge/development/platform-api'\n| fields @timestamp, @message\n| filter @message like /configuration|FORBIDDEN|VALIDATION_FAILED|config\\/\n| sort @timestamp desc\n| limit 40",
        region: "us-east-1",
        title: "Config API logs",
        view: "table",
      },
    },
  ],
};

const path = join(tmpdir(), "forge-dash.json");
writeFileSync(path, JSON.stringify(body));
console.log(path);
